import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import {
  Division,
  EntityType,
  PublishStatus,
  RegistrationStatus,
} from "@/app/generated/prisma/enums";
import { PRIVILEGES } from "@/lib/privileges";
import { findOrCreateCustomer } from "@/lib/customers";
import { notifyCustomer } from "@/lib/notifications";
import { customerSummaryFields } from "@/lib/selects";
import { EventRegistrationRequestSchema } from "@/types/dto/event";
import {
  canAccessDivision,
  getUser,
  requirePrivilege,
} from "@/utils/authentication";
import { ApiError, handleError, notFound } from "@/utils/handleError";
import { divisionReference } from "@/utils/reference";
import { calculateTotals } from "@/utils/money";
import { enumParam, IdContext } from "@/utils/params";
import getPageInfo, { buildPagination } from "@/utils/pageInfoRetrivel";

// Public registration / booking request (FR-EVT-03, FR-EVT-05, FR-EVT-07).
// One registration can hold several participants (group booking);
// every participant takes one seat.
export async function POST(request: NextRequest, { params }: IdContext) {
  const { id } = await params;

  try {
    const body = EventRegistrationRequestSchema.parse(await request.json());
    const seats = body.participants.length;

    const event = await prisma.event.findUnique({ where: { id: id } });
    if (event == null || event.status != PublishStatus.PUBLISHED) {
      return notFound("Event");
    }
    if (!event.registrationOpen || event.endDate < new Date()) {
      throw new ApiError(409, "Registration for this event is closed.");
    }

    const signedInUser = await getUser(request);
    const isPaid = event.fee != null && Number(event.fee) > 0;

    const registration = await prisma.$transaction(async (tx) => {
      // NFR-08: reserve the seats in ONE atomic statement. Two people
      // booking the last seat at the same moment cannot both succeed.
      const reserved = await tx.$executeRaw`
        UPDATE "Event"
        SET "registeredCount" = "registeredCount" + ${seats}
        WHERE "id" = ${event.id}
          AND ("capacity" IS NULL OR "registeredCount" + ${seats} <= "capacity")`;
      if (reserved == 0) {
        throw new ApiError(409, "Not enough seats left for this event.");
      }

      const customer = await findOrCreateCustomer(
        {
          email: body.email,
          firstName: body.firstName,
          lastName: body.lastName,
          companyName: body.companyName,
          phone: body.phone,
          country: body.country,
          userId: signedInUser?.id,
        },
        tx,
      );

      // FR-EVT-06: payment and an order only when the event has a fee
      let orderId: string | undefined;
      if (isPaid) {
        const totals = calculateTotals([
          { quantity: seats, unitPrice: Number(event.fee) },
        ]);
        const order = await tx.order.create({
          data: {
            reference: await divisionReference(Division.EVENTS, "ORD", tx),
            division: Division.EVENTS,
            customerId: customer.id,
            currency: event.currency!,
            total: totals.total,
            items: {
              create: {
                description: `${event.name} - registration`,
                itemType: EntityType.EVENT,
                itemId: event.id,
                quantity: seats,
                unit: "seat",
                unitPrice: Number(event.fee),
                lineTotal: totals.lines[0].lineTotal,
              },
            },
          },
        });
        orderId = order.id;
      }

      return tx.eventRegistration.create({
        data: {
          reference: await divisionReference(Division.EVENTS, "REG", tx),
          eventId: event.id,
          customerId: customer.id,
          seats: seats,
          participants: body.participants,
          notes: body.notes,
          orderId: orderId,
          // free events are confirmed at once; paid ones after payment
          status: isPaid ? RegistrationStatus.PENDING : RegistrationStatus.CONFIRMED,
        },
        include: { customer: true },
      });
    });

    await notifyCustomer({
      customer: registration.customer,
      subject: `Registration ${registration.reference} - ${event.name}`,
      body: isPaid
        ? `Dear ${registration.customer.firstName},\n\nWe reserved ${seats} seat(s) for ${event.name}. Your registration is pending until payment is received. We will send payment instructions.`
        : `Dear ${registration.customer.firstName},\n\nYour registration for ${event.name} (${seats} seat(s)) is confirmed. Reference: ${registration.reference}.`,
      entityType: EntityType.EVENT_REGISTRATION,
      entityId: registration.id,
    });

    return NextResponse.json(
      {
        message: isPaid
          ? "Seats reserved - registration pending payment"
          : "Registration confirmed",
        reference: registration.reference,
        status: registration.status,
      },
      { status: 201 },
    );
  } catch (error) {
    return handleError(error);
  }
}

// Staff: participant list of an event (FR-EVT-09)
export async function GET(request: NextRequest, { params }: IdContext) {
  const { id } = await params;
  const auth = await requirePrivilege(request, PRIVILEGES.EVENTS_REGISTRATIONS);
  if (auth.error) {
    return auth.error;
  }

  try {
    if (!canAccessDivision(auth.user, Division.EVENTS)) {
      throw new ApiError(403, "You do not work in Events.");
    }
    const page = getPageInfo(request);
    const where = {
      eventId: id,
      status: enumParam(request, "status", RegistrationStatus),
    };

    const [registrations, totalCount, seatTotals] = await Promise.all([
      prisma.eventRegistration.findMany({
        where: where,
        skip: page.skip,
        take: page.take,
        orderBy: { createdAt: "desc" },
        include: { customer: { select: customerSummaryFields } },
      }),
      prisma.eventRegistration.count({ where: where }),
      prisma.eventRegistration.groupBy({
        by: ["status"],
        where: { eventId: id },
        _sum: { seats: true },
        _count: { _all: true },
      }),
    ]);

    return NextResponse.json({
      message: "Registrations fetched",
      data: registrations,
      summary: seatTotals.map((row) => ({
        status: row.status,
        registrations: row._count._all,
        participants: row._sum.seats ?? 0,
      })),
      pagination: buildPagination(page, totalCount),
    });
  } catch (error) {
    return handleError(error);
  }
}
