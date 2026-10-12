import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { PRIVILEGES } from "@/lib/privileges";
import { canViewOwnedRecord } from "@/lib/access";
import { ShipmentUpdateRequestSchema } from "@/types/dto/trade";
import {
  canAccessDivision,
  requirePrivilege,
  requireUser,
} from "@/utils/authentication";
import { handleError, notFound } from "@/utils/handleError";
import { audit } from "@/utils/audit";
import { IdContext } from "@/utils/params";

// Staff of the division, or the customer of the order
export async function GET(request: NextRequest, { params }: IdContext) {
  const { id } = await params;
  const auth = await requireUser(request);
  if (auth.error) {
    return auth.error;
  }

  const shipment = await prisma.shipment.findUnique({
    where: { id: id },
    include: {
      order: {
        select: { id: true, reference: true, division: true, customerId: true },
      },
      milestones: { orderBy: { occurredAt: "asc" } },
    },
  });

  if (
    shipment == null ||
    !(await canViewOwnedRecord(auth.user, shipment.order, PRIVILEGES.ORDERS_READ))
  ) {
    return notFound("Shipment");
  }
  return NextResponse.json({ message: "Shipment fetched", data: shipment });
}

// Update carrier, tracking number, dates ... Status changes go through
// POST /api/shipments/[id]/milestones so that the history is kept.
export async function PUT(request: NextRequest, { params }: IdContext) {
  const { id } = await params;
  const auth = await requirePrivilege(request, PRIVILEGES.SHIPMENTS_EDIT);
  if (auth.error) {
    return auth.error;
  }

  try {
    const body = ShipmentUpdateRequestSchema.parse(await request.json());

    const existing = await prisma.shipment.findUnique({
      where: { id: id },
      include: { order: true },
    });
    if (existing == null || !canAccessDivision(auth.user, existing.order.division)) {
      return notFound("Shipment");
    }

    const shipment = await prisma.shipment.update({
      where: { id: id },
      data: body,
    });

    await audit({
      userId: auth.user.id,
      action: "shipment.updated",
      entityType: "SHIPMENT",
      entityId: id,
      details: { changedFields: Object.keys(body) },
    });

    return NextResponse.json({ message: "Shipment updated", data: shipment });
  } catch (error) {
    return handleError(error);
  }
}
