import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/app/generated/prisma/client";
import { Division, TicketStatus } from "@/app/generated/prisma/enums";
import { PRIVILEGES } from "@/lib/privileges";
import { assertTravelStaff } from "@/lib/catalogue";
import { resolveTravelCaseCustomer } from "@/lib/travel";
import { customerSummaryFields, staffNameFields } from "@/lib/selects";
import { TicketCreateRequestSchema } from "@/types/dto/travel";
import { canAccessDivision, requirePrivilege } from "@/utils/authentication";
import { ApiError, handleError } from "@/utils/handleError";
import { divisionReference } from "@/utils/reference";
import { audit } from "@/utils/audit";
import { enumParam, searchParam } from "@/utils/params";
import getPageInfo, { buildPagination } from "@/utils/pageInfoRetrivel";

// Air ticket requests (FR-TRV-05)
export async function GET(request: NextRequest) {
  const auth = await requirePrivilege(request, PRIVILEGES.TRAVEL_CASES);
  if (auth.error) {
    return auth.error;
  }

  try {
    if (!canAccessDivision(auth.user, Division.TRAVEL)) {
      throw new ApiError(403, "You do not work in Travel.");
    }
    const params = getPageInfo(request);
    const assignedTo = searchParam(request, "assignedTo");

    const where: Prisma.TicketRequestWhereInput = {
      status: enumParam(request, "status", TicketStatus),
      assignedToId: assignedTo == "me" ? auth.user.id : assignedTo,
      customerId: searchParam(request, "customerId"),
    };

    const [tickets, totalCount] = await Promise.all([
      prisma.ticketRequest.findMany({
        where: where,
        skip: params.skip,
        take: params.take,
        orderBy: { updatedAt: "desc" },
        include: {
          customer: { select: customerSummaryFields },
          assignedTo: { select: staffNameFields },
        },
      }),
      prisma.ticketRequest.count({ where: where }),
    ]);

    return NextResponse.json({
      message: "Ticket requests fetched",
      data: tickets,
      pagination: buildPagination(params, totalCount),
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: NextRequest) {
  const auth = await requirePrivilege(request, PRIVILEGES.TRAVEL_CASES);
  if (auth.error) {
    return auth.error;
  }

  try {
    if (!canAccessDivision(auth.user, Division.TRAVEL)) {
      throw new ApiError(403, "You do not work in Travel.");
    }
    const body = TicketCreateRequestSchema.parse(await request.json());
    const customerId = await resolveTravelCaseCustomer(
      body.enquiryId,
      body.customerId,
    );
    await assertTravelStaff(body.assignedToId);

    const ticket = await prisma.ticketRequest.create({
      data: {
        reference: await divisionReference(Division.TRAVEL, "TKT"),
        enquiryId: body.enquiryId,
        customerId: customerId,
        tripType: body.tripType,
        segments: body.segments,
        passengers: body.passengers,
        passengerCount: body.passengers.length,
        cabinClass: body.cabinClass,
        assignedToId: body.assignedToId ?? auth.user.id,
        notes: body.notes,
      },
    });

    await audit({
      userId: auth.user.id,
      action: "ticket_request.created",
      entityType: "TICKET_REQUEST",
      entityId: ticket.id,
    });

    return NextResponse.json(
      { message: "Ticket request created", data: ticket },
      { status: 201 },
    );
  } catch (error) {
    return handleError(error);
  }
}
