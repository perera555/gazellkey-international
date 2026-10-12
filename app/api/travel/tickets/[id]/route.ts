import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import {
  Division,
  EntityType,
  TicketStatus,
} from "@/app/generated/prisma/enums";
import { PRIVILEGES } from "@/lib/privileges";
import { canViewOwnedRecord } from "@/lib/access";
import { assertTravelStaff } from "@/lib/catalogue";
import { notifyCustomer } from "@/lib/notifications";
import { customerSummaryFields, staffNameFields } from "@/lib/selects";
import { TicketUpdateRequestSchema } from "@/types/dto/travel";
import {
  canAccessDivision,
  hasPrivilege,
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

  const ticket = await prisma.ticketRequest.findUnique({
    where: { id: id },
    include: {
      customer: { select: customerSummaryFields },
      assignedTo: { select: staffNameFields },
    },
  });
  if (
    ticket == null ||
    !(await canViewOwnedRecord(
      auth.user,
      { customerId: ticket.customerId, division: Division.TRAVEL },
      PRIVILEGES.TRAVEL_CASES,
    ))
  ) {
    return notFound("Ticket request");
  }

  if (!hasPrivilege(auth.user, PRIVILEGES.TRAVEL_CASES)) {
    const { notes, ...customerView } = ticket;
    return NextResponse.json({ message: "Ticket fetched", data: customerView });
  }
  return NextResponse.json({ message: "Ticket fetched", data: ticket });
}

export async function PUT(request: NextRequest, { params }: IdContext) {
  const { id } = await params;
  const auth = await requirePrivilege(request, PRIVILEGES.TRAVEL_CASES);
  if (auth.error) {
    return auth.error;
  }

  try {
    if (!canAccessDivision(auth.user, Division.TRAVEL)) {
      throw new ApiError(403, "You do not work in Travel.");
    }
    const body = TicketUpdateRequestSchema.parse(await request.json());
    await assertTravelStaff(body.assignedToId);

    const existing = await prisma.ticketRequest.findUnique({
      where: { id: id },
    });
    if (existing == null) {
      return notFound("Ticket request");
    }

    // FR-TRV-06 / NFR-09: a ticket is only "confirmed" when the airline or
    // supplier has confirmed it, so a supplier reference is required.
    const supplierReference = body.supplierReference ?? existing.supplierReference;
    const ticketNumbers = body.ticketNumbers ?? existing.ticketNumbers;
    if (
      (body.status == TicketStatus.CONFIRMED ||
        body.status == TicketStatus.ISSUED) &&
      !supplierReference
    ) {
      throw new ApiError(
        400,
        "A supplier/airline confirmation reference is required before a ticket can be confirmed.",
      );
    }
    if (body.status == TicketStatus.ISSUED && ticketNumbers.length == 0) {
      throw new ApiError(400, "Ticket numbers are required to mark it ISSUED.");
    }
    if (
      body.status == TicketStatus.QUOTED &&
      (body.fareAmount ?? existing.fareAmount) == null
    ) {
      throw new ApiError(400, "A fare amount is required to mark it QUOTED.");
    }

    const ticket = await prisma.ticketRequest.update({
      where: { id: id },
      data: {
        ...body,
        passengerCount: body.passengers?.length,
      },
      include: { customer: true },
    });

    if (body.status && body.status != existing.status) {
      await audit({
        userId: auth.user.id,
        action: "ticket_request.status_changed",
        entityType: "TICKET_REQUEST",
        entityId: id,
        details: {
          from: existing.status,
          to: body.status,
          supplierReference: supplierReference,
        },
      });
      await notifyCustomer({
        customer: ticket.customer,
        subject: `Air ticket ${ticket.reference}: ${body.status.replace(/_/g, " ").toLowerCase()}`,
        body: `Dear ${ticket.customer.firstName},\n\nYour air ticket request ${ticket.reference} is now: ${body.status.replace(/_/g, " ").toLowerCase()}.${body.status == TicketStatus.QUOTED ? " Fares are indicative until the airline confirms the booking." : ""}`,
        entityType: EntityType.TICKET_REQUEST,
        entityId: id,
      });
    }

    return NextResponse.json({ message: "Ticket request updated", data: ticket });
  } catch (error) {
    return handleError(error);
  }
}
