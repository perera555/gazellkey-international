import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/app/generated/prisma/client";
import {
  OrderStatus,
  ShipmentStatus,
  TradeDirection,
} from "@/app/generated/prisma/enums";
import { PRIVILEGES } from "@/lib/privileges";
import { directionOf } from "@/lib/trade";
import { customerSummaryFields } from "@/lib/selects";
import { ShipmentCreateRequestSchema } from "@/types/dto/trade";
import {
  canAccessDivision,
  divisionWhere,
  requirePrivilege,
} from "@/utils/authentication";
import { ApiError, handleError } from "@/utils/handleError";
import { nextReference } from "@/utils/reference";
import { audit } from "@/utils/audit";
import { enumParam, searchParam } from "@/utils/params";
import getPageInfo, { buildPagination } from "@/utils/pageInfoRetrivel";

// /api/shipments?direction=EXPORT&status=IN_TRANSIT&delayed=true
export async function GET(request: NextRequest) {
  const auth = await requirePrivilege(request, PRIVILEGES.ORDERS_READ);
  if (auth.error) {
    return auth.error;
  }

  try {
    const params = getPageInfo(request);

    const where: Prisma.ShipmentWhereInput = {
      order: divisionWhere(auth.user),
      direction: enumParam(request, "direction", TradeDirection),
      status: enumParam(request, "status", ShipmentStatus),
      orderId: searchParam(request, "orderId"),
      isDelayed: searchParam(request, "delayed") == "true" ? true : undefined,
    };

    const [shipments, totalCount] = await Promise.all([
      prisma.shipment.findMany({
        where: where,
        skip: params.skip,
        take: params.take,
        orderBy: { updatedAt: "desc" },
        include: {
          order: {
            select: {
              id: true,
              reference: true,
              division: true,
              customer: { select: customerSummaryFields },
            },
          },
        },
      }),
      prisma.shipment.count({ where: where }),
    ]);

    return NextResponse.json({
      message: "Shipments fetched successfully",
      data: shipments,
      pagination: buildPagination(params, totalCount),
    });
  } catch (error) {
    return handleError(error);
  }
}

// Open a shipment for a confirmed trade order. Gem import/export orders
// can also ship (FR-GEM-05) - then "direction" must be sent.
export async function POST(request: NextRequest) {
  const auth = await requirePrivilege(request, PRIVILEGES.SHIPMENTS_EDIT);
  if (auth.error) {
    return auth.error;
  }

  try {
    const body = ShipmentCreateRequestSchema.parse(await request.json());

    const order = await prisma.order.findUnique({ where: { id: body.orderId } });
    if (order == null || !canAccessDivision(auth.user, order.division)) {
      throw new ApiError(404, "Order not found.");
    }
    if (
      order.status != OrderStatus.CONFIRMED &&
      order.status != OrderStatus.IN_FULFILMENT
    ) {
      throw new ApiError(409, "Shipments can only be created for confirmed orders.");
    }

    const direction = directionOf(order.division) ?? body.direction;
    if (direction == undefined) {
      throw new ApiError(400, "direction (IMPORT or EXPORT) is required for this order.");
    }

    const { orderId, direction: _ignored, ...details } = body;

    const shipment = await prisma.$transaction(async (tx) => {
      const created = await tx.shipment.create({
        data: {
          ...details,
          reference: await nextReference("SHP", tx),
          orderId: order.id,
          direction: direction,
          milestones: {
            create: {
              status: ShipmentStatus.ORDER_CONFIRMED,
              note: "Shipment opened",
              createdById: auth.user.id,
            },
          },
        },
        include: { milestones: true },
      });
      if (order.status == OrderStatus.CONFIRMED) {
        await tx.order.update({
          where: { id: order.id },
          data: { status: OrderStatus.IN_FULFILMENT },
        });
      }
      return created;
    });

    await audit({
      userId: auth.user.id,
      action: "shipment.created",
      entityType: "SHIPMENT",
      entityId: shipment.id,
      details: { orderId: order.id },
    });

    return NextResponse.json(
      { message: "Shipment created", data: shipment },
      { status: 201 },
    );
  } catch (error) {
    return handleError(error);
  }
}
