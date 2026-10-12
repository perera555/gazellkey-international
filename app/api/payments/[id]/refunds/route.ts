import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { EntityType, PaymentStatus } from "@/app/generated/prisma/enums";
import { PRIVILEGES } from "@/lib/privileges";
import { notifyCustomer } from "@/lib/notifications";
import { RefundCreateRequestSchema } from "@/types/dto/order";
import { canAccessDivision, requirePrivilege } from "@/utils/authentication";
import { ApiError, handleError, notFound } from "@/utils/handleError";
import { fromCents, toCents } from "@/utils/money";
import { audit } from "@/utils/audit";
import { IdContext } from "@/utils/params";

// Finance refunds part or all of a paid payment (workflow step 10)
export async function POST(request: NextRequest, { params }: IdContext) {
  const { id } = await params;
  const auth = await requirePrivilege(request, PRIVILEGES.REFUNDS_CREATE);
  if (auth.error) {
    return auth.error;
  }

  try {
    const body = RefundCreateRequestSchema.parse(await request.json());

    const payment = await prisma.payment.findUnique({
      where: { id: id },
      include: { order: true, customer: true },
    });
    if (payment == null || !canAccessDivision(auth.user, payment.order.division)) {
      return notFound("Payment");
    }
    if (
      payment.status != PaymentStatus.PAID &&
      payment.status != PaymentStatus.PARTIALLY_REFUNDED
    ) {
      throw new ApiError(409, "Only paid payments can be refunded.");
    }

    const refundableCents =
      toCents(payment.amount) - toCents(payment.refundedAmount);
    const refundCents = toCents(body.amount);
    if (refundCents > refundableCents) {
      throw new ApiError(
        400,
        `You can refund at most ${payment.currency} ${fromCents(refundableCents).toFixed(2)}.`,
      );
    }

    const fullyRefunded = refundCents == refundableCents;

    const refund = await prisma.$transaction(async (tx) => {
      const created = await tx.refund.create({
        data: {
          paymentId: id,
          amount: body.amount,
          currency: payment.currency,
          reason: body.reason,
          providerReference: body.providerReference,
          processedById: auth.user.id,
        },
      });
      await tx.payment.update({
        where: { id: id },
        data: {
          refundedAmount: { increment: body.amount },
          status: fullyRefunded
            ? PaymentStatus.REFUNDED
            : PaymentStatus.PARTIALLY_REFUNDED,
        },
      });
      await tx.order.update({
        where: { id: payment.orderId },
        data: { amountPaid: { decrement: body.amount } },
      });
      return created;
    });

    await audit({
      userId: auth.user.id,
      action: "payment.refunded",
      entityType: "PAYMENT",
      entityId: id,
      details: {
        refundId: refund.id,
        amount: body.amount,
        currency: payment.currency,
        reason: body.reason,
      },
    });

    await notifyCustomer({
      customer: payment.customer,
      subject: `Refund for ${payment.order.reference}`,
      body: `Dear ${payment.customer.firstName},\n\nA refund of ${payment.currency} ${body.amount.toFixed(2)} has been processed for ${payment.order.reference}.`,
      entityType: EntityType.PAYMENT,
      entityId: id,
    });

    return NextResponse.json(
      { message: "Refund processed", data: refund },
      { status: 201 },
    );
  } catch (error) {
    return handleError(error);
  }
}
