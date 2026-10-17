import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import {
  EntityType,
  OrderStatus,
  PaymentStatus,
} from "@/app/generated/prisma/enums";
import { PRIVILEGES } from "@/lib/privileges";
import { canViewOwnedRecord } from "@/lib/access";
import { notifyCustomer } from "@/lib/notifications";
import { isShopOrder, releaseOrderStock } from "@/lib/stock";
import { expireStaleCheckouts } from "@/lib/shop";
import { customerSummaryFields } from "@/lib/selects";
import { OrderUpdateRequestSchema } from "@/types/dto/order";
import {
  canAccessDivision,
  requirePrivilege,
  requireUser,
} from "@/utils/authentication";
import { ApiError, handleError, notFound } from "@/utils/handleError";
import { audit } from "@/utils/audit";
import { IdContext } from "@/utils/params";

// Which status may follow which (SRS 5.2)
const ALLOWED_NEXT: Record<OrderStatus, OrderStatus[]> = {
  PENDING: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
  CONFIRMED: [OrderStatus.IN_FULFILMENT, OrderStatus.CANCELLED],
  IN_FULFILMENT: [OrderStatus.COMPLETED, OrderStatus.CANCELLED],
  COMPLETED: [],
  CANCELLED: [],
};

export async function GET(request: NextRequest, { params }: IdContext) {
  const { id } = await params;
  const auth = await requireUser(request);
  if (auth.error) {
    return auth.error;
  }

  const order = await prisma.order.findUnique({
    where: { id: id },
    include: {
      items: { orderBy: { sortOrder: "asc" } },
      customer: { select: customerSummaryFields },
      quotation: { select: { id: true, reference: true } },
      payments: { orderBy: { createdAt: "desc" } },
      shipments: {
        include: { milestones: { orderBy: { occurredAt: "asc" } } },
      },
    },
  });

  if (
    order == null ||
    !(await canViewOwnedRecord(auth.user, order, PRIVILEGES.ORDERS_READ))
  ) {
    return notFound("Order");
  }
  return NextResponse.json({ message: "Order fetched", data: order });
}

export async function PUT(request: NextRequest, { params }: IdContext) {
  const { id } = await params;
  const auth = await requirePrivilege(request, PRIVILEGES.ORDERS_EDIT);
  if (auth.error) {
    return auth.error;
  }

  try {
    const body = OrderUpdateRequestSchema.parse(await request.json());
    // close online checkouts nobody finished, so their orders can be changed
    await expireStaleCheckouts().catch((error) => console.error("Checkout sweep failed", error));

    const existing = await prisma.order.findUnique({ where: { id: id } });
    if (existing == null || !canAccessDivision(auth.user, existing.division)) {
      return notFound("Order");
    }

    const statusChanged =
      body.status != undefined && body.status != existing.status;
    if (statusChanged && !ALLOWED_NEXT[existing.status].includes(body.status!)) {
      throw new ApiError(
        409,
        `Order cannot move from ${existing.status} to ${body.status}.`,
      );
    }

    const shopOrder = isShopOrder(existing);
    if (statusChanged && shopOrder) {
      // a card payment still open on PayHere / Stripe could be paid any moment
      const paying = await prisma.payment.count({
        where: {
          orderId: id,
          status: PaymentStatus.PENDING,
          provider: { not: null },
        },
      });
      if (paying > 0) {
        throw new ApiError(
          409,
          "The customer is paying for this order online. Wait until the card payment is finished or expires (at most 60 minutes).",
        );
      }
    }

    const order = await prisma.$transaction(async (tx) => {
      if (statusChanged) {
        // conditional, so the order is cancelled (and its stock given back) once
        const changed = await tx.order.updateMany({
          where: { id: id, status: existing.status },
          data: { status: body.status },
        });
        if (changed.count == 0) {
          throw new ApiError(409, "This order was just changed by someone else.");
        }
        if (body.status == OrderStatus.CANCELLED) {
          await releaseOrderStock(tx, id);
          // e.g. a bank transfer that will not come any more
          await tx.payment.updateMany({
            where: { orderId: id, status: PaymentStatus.PENDING },
            data: { status: PaymentStatus.FAILED, note: "Order cancelled" },
          });
        }
      }
      return tx.order.update({
        where: { id: id },
        data: {
          supplierId: body.supplierId,
          shippingTerms: body.shippingTerms,
          // online shop orders keep their source marker (lib/stock.ts)
          details:
            body.details && shopOrder
              ? { ...body.details, ...(existing.details as object) }
              : body.details,
        },
        include: { customer: true },
      });
    });

    if (statusChanged) {
      await audit({
        userId: auth.user.id,
        action: "order.status_changed",
        entityType: "ORDER",
        entityId: id,
        details: { from: existing.status, to: body.status! },
      });
      await notifyCustomer({
        customer: order.customer,
        subject: `Order ${order.reference} is now ${order.status.replace(/_/g, " ").toLowerCase()}`,
        body: `Dear ${order.customer.firstName},\n\nThe status of your booking/order ${order.reference} changed to: ${order.status.replace(/_/g, " ").toLowerCase()}.`,
        entityType: EntityType.ORDER,
        entityId: order.id,
      });
    }

    return NextResponse.json({
      message: "Order updated successfully",
      data: order,
    });
  } catch (error) {
    return handleError(error);
  }
}
