import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { EntityType, ShipmentStatus } from "@/app/generated/prisma/enums";
import { PRIVILEGES } from "@/lib/privileges";
import { notifyCustomer } from "@/lib/notifications";
import { ShipmentMilestoneRequestSchema } from "@/types/dto/trade";
import { canAccessDivision, requirePrivilege } from "@/utils/authentication";
import { ApiError, handleError, notFound } from "@/utils/handleError";
import { audit } from "@/utils/audit";
import { IdContext } from "@/utils/params";

// Record a shipment milestone (FR-IMP-06, FR-EXP-05):
// Order confirmed -> Goods ready -> Documents prepared -> Shipped ->
// In transit -> Arrived / cleared -> Delivered, or Delayed (with a reason).
export async function POST(request: NextRequest, { params }: IdContext) {
  const { id } = await params;
  const auth = await requirePrivilege(request, PRIVILEGES.SHIPMENTS_EDIT);
  if (auth.error) {
    return auth.error;
  }

  try {
    const body = ShipmentMilestoneRequestSchema.parse(await request.json());

    const existing = await prisma.shipment.findUnique({
      where: { id: id },
      include: { order: { include: { customer: true } } },
    });
    if (existing == null || !canAccessDivision(auth.user, existing.order.division)) {
      return notFound("Shipment");
    }
    if (existing.status == ShipmentStatus.DELIVERED) {
      throw new ApiError(409, "This shipment is already delivered.");
    }

    const isDelay = body.status == ShipmentStatus.DELAYED;
    if (isDelay && !body.delayReason) {
      throw new ApiError(400, "delayReason is required for a DELAYED milestone.");
    }
    const occurredAt = body.occurredAt ?? new Date();

    const shipment = await prisma.$transaction(async (tx) => {
      await tx.shipmentMilestone.create({
        data: {
          shipmentId: id,
          status: body.status,
          location: body.location,
          note: isDelay ? body.delayReason : body.note,
          occurredAt: occurredAt,
          createdById: auth.user.id,
        },
      });
      return tx.shipment.update({
        where: { id: id },
        data: {
          status: body.status,
          isDelayed: isDelay,
          delayReason: isDelay ? body.delayReason : null,
          actualArrival:
            body.status == ShipmentStatus.ARRIVED_CLEARED ||
            body.status == ShipmentStatus.DELIVERED
              ? (existing.actualArrival ?? occurredAt)
              : undefined,
        },
        include: { milestones: { orderBy: { occurredAt: "asc" } } },
      });
    });

    await audit({
      userId: auth.user.id,
      action: "shipment.milestone",
      entityType: "SHIPMENT",
      entityId: id,
      details: { from: existing.status, to: body.status },
    });

    const statusText = body.status.replace(/_/g, " ").toLowerCase();
    await notifyCustomer({
      customer: existing.order.customer,
      subject: `Shipment ${existing.reference}: ${statusText}`,
      body: `Dear ${existing.order.customer.firstName},\n\nYour shipment ${existing.reference} for order ${existing.order.reference} is now: ${statusText}${body.location ? ` (${body.location})` : ""}.${isDelay ? `\nReason: ${body.delayReason}` : ""}`,
      entityType: EntityType.SHIPMENT,
      entityId: id,
    });

    return NextResponse.json(
      { message: "Milestone recorded", data: shipment },
      { status: 201 },
    );
  } catch (error) {
    return handleError(error);
  }
}
