import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { EntityType, OrderStatus } from "@/app/generated/prisma/enums";
import { PRIVILEGES } from "@/lib/privileges";
import { canViewOwnedRecord } from "@/lib/access";
import { notifyCustomer } from "@/lib/notifications";
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

    const order = await prisma.order.update({
      where: { id: id },
      data: {
        status: body.status,
        supplierId: body.supplierId,
        shippingTerms: body.shippingTerms,
        details: body.details,
      },
      include: { customer: true },
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
