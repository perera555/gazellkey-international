import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { EntityType, PaymentStatus } from "@/app/generated/prisma/enums";
import { PRIVILEGES } from "@/lib/privileges";
import { canViewOwnedRecord } from "@/lib/access";
import { notifyCustomer } from "@/lib/notifications";
import { addPaymentToOrder } from "@/lib/payments";
import { websiteUrl } from "@/lib/stripe";
import { PaymentUpdateRequestSchema } from "@/types/dto/order";
import {
  canAccessDivision,
  requirePrivilege,
  requireUser,
} from "@/utils/authentication";
import { ApiError, handleError, notFound } from "@/utils/handleError";
import { audit } from "@/utils/audit";
import { IdContext } from "@/utils/params";

export async function GET(request: NextRequest, { params }: IdContext) {
  const { id } = await params;
  const auth = await requireUser(request);
  if (auth.error) {
    return auth.error;
  }

  const payment = await prisma.payment.findUnique({
    where: { id: id },
    include: {
      order: { select: { id: true, reference: true, division: true } },
      refunds: { orderBy: { createdAt: "desc" } },
    },
  });

  if (
    payment == null ||
    !(await canViewOwnedRecord(
      auth.user,
      { customerId: payment.customerId, division: payment.order.division },
      PRIVILEGES.PAYMENTS_READ,
    ))
  ) {
    return notFound("Payment");
  }
  return NextResponse.json({ message: "Payment fetched", data: payment });
}

// Finance confirms (PAID) or rejects (FAILED) a pending payment.
// When the order is fully paid, a PENDING order becomes CONFIRMED.
export async function PUT(request: NextRequest, { params }: IdContext) {
  const { id } = await params;
  const auth = await requirePrivilege(request, PRIVILEGES.PAYMENTS_CONFIRM);
  if (auth.error) {
    return auth.error;
  }

  try {
    const body = PaymentUpdateRequestSchema.parse(await request.json());

    const existing = await prisma.payment.findUnique({
      where: { id: id },
      include: { order: true, customer: true },
    });
    if (
      existing == null ||
      !canAccessDivision(auth.user, existing.order.division)
    ) {
      return notFound("Payment");
    }
    if (existing.status != PaymentStatus.PENDING) {
      throw new ApiError(409, "Only pending payments can be confirmed.");
    }
    if (existing.provider != null) {
      // the gateway decides; a manual answer could disagree with it
      throw new ApiError(
        409,
        `Online card payments are confirmed automatically by ${existing.provider == "PAYHERE" ? "PayHere" : "Stripe"}.`,
      );
    }

    const payment = await prisma.$transaction(async (tx) => {
      // conditional update so two finance users cannot confirm it twice
      const changed = await tx.payment.updateMany({
        where: { id: id, status: PaymentStatus.PENDING },
        data: {
          status: body.status,
          providerReference: body.providerReference,
          note: body.note,
          confirmedById: auth.user.id,
          paidAt: body.status == "PAID" ? new Date() : null,
        },
      });
      if (changed.count == 0) {
        throw new ApiError(409, "This payment was already processed.");
      }

      if (body.status == "PAID") {
        await addPaymentToOrder(tx, existing);
      }
      return tx.payment.findUniqueOrThrow({ where: { id: id } });
    });

    await audit({
      userId: auth.user.id,
      action: body.status == "PAID" ? "payment.confirmed" : "payment.failed",
      entityType: "PAYMENT",
      entityId: id,
      details: { amount: Number(existing.amount), currency: existing.currency },
    });

    await notifyCustomer({
      customer: existing.customer,
      subject:
        body.status == "PAID"
          ? `Payment received - ${existing.reference}`
          : `Payment problem - ${existing.reference}`,
      body:
        body.status == "PAID"
          ? `Dear ${existing.customer.firstName},\n\nWe received your payment of ${existing.currency} ${existing.amount.toFixed(2)} for ${existing.order.reference}. Thank you.\n\nYour receipt ${existing.reference} is ready to download under My account > Payments: ${websiteUrl()}/account/payments`
          : `Dear ${existing.customer.firstName},\n\nWe could not confirm payment ${existing.reference} for ${existing.order.reference}. Please contact us.`,
      entityType: EntityType.PAYMENT,
      entityId: id,
    });

    return NextResponse.json({ message: "Payment updated", data: payment });
  } catch (error) {
    return handleError(error);
  }
}
