import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import {
  EntityType,
  PaymentProvider,
  PaymentStatus,
} from "@/app/generated/prisma/enums";
import { PRIVILEGES } from "@/lib/privileges";
import { notifyCustomer } from "@/lib/notifications";
import { isPayHereApiEnabled, refundPayHerePayment } from "@/lib/payhere";
import { centsToStripeAmount, getStripe } from "@/lib/stripe";
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

    // Online card payments are refunded through their gateway, back to the
    // card. (The gateways themselves refuse to refund more than was paid.)
    let providerReference = body.providerReference;
    if (payment.provider == PaymentProvider.PAYHERE && payment.providerReference) {
      if (isPayHereApiEnabled()) {
        providerReference = await refundPayHerePayment(
          payment.providerReference,
          body.reason,
          fullyRefunded && toCents(payment.refundedAmount) == 0 ? undefined : refundCents,
        );
      } else if (!body.providerReference) {
        throw new ApiError(
          409,
          "Refund this payment in the PayHere portal first, then enter PayHere's refund number here. (Or set PAYHERE_APP_ID / PAYHERE_APP_SECRET to refund from here.)",
        );
      }
    } else if (payment.provider == PaymentProvider.STRIPE && payment.providerReference?.startsWith("pi_")) {
      try {
        const stripeRefund = await getStripe().refunds.create({
          payment_intent: payment.providerReference,
          amount: centsToStripeAmount(refundCents, payment.currency),
          metadata: { payment: payment.reference, reason: body.reason.slice(0, 450) },
        });
        providerReference = stripeRefund.id;
      } catch (error) {
        if (error instanceof ApiError) {
          throw error;
        }
        console.error("Stripe refund failed", error);
        throw new ApiError(
          502,
          `Stripe could not refund this payment: ${error instanceof Error ? error.message : "unknown error"}`,
        );
      }
    }

    const refund = await prisma.$transaction(async (tx) => {
      const created = await tx.refund.create({
        data: {
          paymentId: id,
          amount: body.amount,
          currency: payment.currency,
          reason: body.reason,
          providerReference: providerReference,
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
