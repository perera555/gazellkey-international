import prisma from "@/lib/prisma";
import { after, NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/app/generated/prisma/client";
import { Division, EntityType, RentalStatus } from "@/app/generated/prisma/enums";
import { PRIVILEGES } from "@/lib/privileges";
import { findOrCreateCustomer } from "@/lib/customers";
import { notifyCustomer } from "@/lib/notifications";
import { adminUrl, customerContact, smsOffice } from "@/lib/officeAlerts";
import {
  assertItemsAvailable,
  assertValidDates,
  EVENT_TYPE_LABELS,
  formatRentalDates,
  priceRentalRequest,
  todayInColombo,
  toDay,
} from "@/lib/rentals";
import { customerSummaryFields } from "@/lib/selects";
import { RentalBookingCreateRequestSchema } from "@/types/dto/rental";
import { canAccessDivision, getUser, requirePrivilege } from "@/utils/authentication";
import { ApiError, handleError } from "@/utils/handleError";
import { divisionReference } from "@/utils/reference";
import { enumParam, searchParam } from "@/utils/params";
import getPageInfo, { buildPagination } from "@/utils/pageInfoRetrivel";

// Public: a rental request from the website's Rentals page (signed in or not).
// Prices come from the database; the request is checked against the stock
// free on those dates, but nothing is held until staff confirm it.
export async function POST(request: NextRequest) {
  try {
    const body = RentalBookingCreateRequestSchema.parse(await request.json());
    if (body.website) {
      return NextResponse.json({ message: "Request received" }, { status: 201 }); // bot
    }
    const start = toDay(body.startDate);
    const end = toDay(body.endDate);
    assertValidDates(start, end);

    const priced = await priceRentalRequest(body.items, start, end);
    const signedInUser = await getUser(request);

    const booking = await prisma.$transaction(async (tx) => {
      await assertItemsAvailable(tx, priced.lines, start, end);
      const customer = await findOrCreateCustomer(
        {
          email: body.email,
          firstName: body.firstName,
          lastName: body.lastName,
          companyName: body.companyName,
          phone: body.phone,
          userId: signedInUser?.id,
        },
        tx,
      );
      return tx.rentalBooking.create({
        data: {
          reference: await divisionReference(Division.EVENTS, "RNT", tx),
          eventType: body.eventType,
          startDate: start,
          endDate: end,
          venue: body.venue,
          city: body.city,
          guests: body.guests,
          needsDelivery: body.needsDelivery,
          needsSetup: body.needsSetup,
          message: body.message,
          currency: priced.currency,
          estimatedTotal: priced.estimatedTotal,
          customerId: customer.id,
          items: {
            create: priced.lines.map((line) => ({
              rentalItemId: line.rentalItemId,
              name: line.name,
              quantity: line.quantity,
              pricePerDay: line.pricePerDay,
              days: line.days,
              lineTotal: line.lineTotal,
            })),
          },
        },
        include: { customer: true, items: true },
      });
    });

    const dates = formatRentalDates(booking.startDate, booking.endDate);
    const itemList = booking.items.map((item) => `- ${item.quantity} x ${item.name}`).join("\n");
    await notifyCustomer({
      customer: booking.customer,
      subject: `Rental request ${booking.reference} received`,
      body:
        `Dear ${booking.customer.firstName},\n\nThank you for your rental request for your ${EVENT_TYPE_LABELS[booking.eventType].toLowerCase()}.\n\n` +
        `Dates: ${dates}\nVenue: ${booking.venue}, ${booking.city}\n${itemList}\n\n` +
        `Estimated price for the items: ${booking.currency} ${Number(booking.estimatedTotal).toFixed(2)}` +
        `${booking.needsDelivery || booking.needsSetup ? " (delivery and setup are added when we confirm)" : ""}.\n\n` +
        `Your reference is ${booking.reference}. Our team will call you to confirm the items and the final price.`,
      entityType: EntityType.RENTAL_BOOKING,
      entityId: booking.id,
    });

    after(async () => {
      await smsOffice(
        `Gazellekey: New rental request ${booking.reference}, ${EVENT_TYPE_LABELS[booking.eventType]}, ${dates}, ${booking.city}. ` +
          `${customerContact(booking.customer)}. Open: ${adminUrl(`/rentals/${booking.id}`)}`,
        EntityType.RENTAL_BOOKING,
        booking.id,
      );
    });

    return NextResponse.json(
      {
        message: "Rental request received",
        reference: booking.reference,
        data: {
          id: booking.id,
          reference: booking.reference,
          estimatedTotal: booking.estimatedTotal,
          currency: booking.currency,
          status: booking.status,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return handleError(error);
  }
}

// Staff list: /api/rentals/bookings?status=REQUESTED&upcoming=true&search=...
export async function GET(request: NextRequest) {
  const auth = await requirePrivilege(request, PRIVILEGES.ORDERS_READ);
  if (auth.error) {
    return auth.error;
  }

  try {
    if (!canAccessDivision(auth.user, Division.EVENTS)) {
      throw new ApiError(403, "Rentals belong to the Events division.");
    }
    const params = getPageInfo(request);
    const search = searchParam(request, "search");
    const upcoming = searchParam(request, "upcoming") == "true";

    const where: Prisma.RentalBookingWhereInput = {
      status: enumParam(request, "status", RentalStatus),
      endDate: upcoming ? { gte: todayInColombo() } : undefined,
      OR: search
        ? [
            { reference: { contains: search, mode: "insensitive" } },
            { venue: { contains: search, mode: "insensitive" } },
            { city: { contains: search, mode: "insensitive" } },
            { customer: { email: { contains: search, mode: "insensitive" } } },
            { customer: { firstName: { contains: search, mode: "insensitive" } } },
            { customer: { lastName: { contains: search, mode: "insensitive" } } },
          ]
        : undefined,
    };

    const [bookings, totalCount] = await Promise.all([
      prisma.rentalBooking.findMany({
        where: where,
        skip: params.skip,
        take: params.take,
        orderBy: upcoming ? { startDate: "asc" } : { createdAt: "desc" },
        include: { customer: { select: customerSummaryFields }, items: true },
      }),
      prisma.rentalBooking.count({ where: where }),
    ]);

    return NextResponse.json({
      message: "Rental bookings fetched successfully",
      data: bookings,
      pagination: buildPagination(params, totalCount),
    });
  } catch (error) {
    return handleError(error);
  }
}
