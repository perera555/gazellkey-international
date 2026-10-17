import { Prisma } from "@/app/generated/prisma/client";
import { OrderStatus, RegistrationStatus } from "@/app/generated/prisma/enums";
import { markOrderItemsSold } from "@/lib/stock";
import { toCents } from "@/utils/money";

// Adds a payment that just became PAID to its order. Used when Finance
// confirms a payment (PUT /api/payments/[id]) and when Stripe reports a
// paid checkout (lib/shop.ts). Call inside the same transaction that
// changed the payment to PAID.
// When the order is fully paid, a PENDING order becomes CONFIRMED.
export async function addPaymentToOrder(
  tx: Prisma.TransactionClient,
  payment: { orderId: string; amount: Prisma.Decimal },
) {
  const order = await tx.order.update({
    where: { id: payment.orderId },
    data: { amountPaid: { increment: payment.amount } },
  });
  if (
    order.status != OrderStatus.PENDING ||
    toCents(order.amountPaid) < toCents(order.total)
  ) {
    return;
  }

  await tx.order.update({
    where: { id: order.id },
    data: { status: OrderStatus.CONFIRMED },
  });
  // a paid event registration is confirmed once its order is paid
  await tx.eventRegistration.updateMany({
    where: { orderId: order.id, status: RegistrationStatus.PENDING },
    data: { status: RegistrationStatus.CONFIRMED },
  });
  // online shop items held for this order are now sold
  await markOrderItemsSold(tx, order.id);
}
