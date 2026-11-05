import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { Division, EntityType, RentalStatus } from "@/app/generated/prisma/enums";
import { PRIVILEGES } from "@/lib/privileges";
import { isRecordOwner } from "@/lib/access";
import { notifyCustomer } from "@/lib/notifications";
import {
  assertItemsAvailable,
  customerRentalView,
  formatRentalDates,
  getAvailabilityForBooking,
} from "@/lib/rentals";
import { RentalBookingUpdateRequestSchema } from "@/types/dto/rental";
import { canAccessDivision, hasPrivilege, requirePrivilege, requireUser } from "@/utils/authentication";
import { ApiError, handleError, notFound } from "@/utils/handleError";
import { audit } from "@/utils/audit";
import { IdContext } from "@/utils/params";

// Status changes staff may make
const NEXT_STATUSES: Record<RentalStatus, RentalStatus[]> = {
  REQUESTED: [RentalStatus.CONFIRMED, RentalStatus.CANCELLED],
  CONFIRMED: [RentalStatus.DELIVERED, RentalStatus.CANCELLED],
  DELIVERED: [RentalStatus.RETURNED],
  RETURNED: [],
  CANCELLED: [],
};

const include = {
  customer: true,
  items: { include: { rentalItem: { select: { id: true, sku: true, unit: true, quantityOwned: true, images: true } } } },
};

// Staff (orders:read, Events division) or the customer it belongs to
export async function GET(request: NextRequest, { params }: IdContext) {
  const { id } = await params;
  const auth = await requireUser(request);
  if (auth.error) {
    return auth.error;
  }

  try {
    const booking = await prisma.rentalBooking.findUnique({ where: { id: id }, include: include });
    if (booking == null) {
      return notFound("Rental booking");
    }
    if (hasPrivilege(auth.user, PRIVILEGES.ORDERS_READ) && canAccessDivision(auth.user, Division.EVENTS)) {
      return NextResponse.json({
        message: "Rental booking fetched",
        data: {
          ...booking,
          // free stock on these dates, not counting this booking
          availability: await getAvailabilityForBooking(booking),
          nextStatuses: NEXT_STATUSES[booking.status],
        },
      });
    }
    if (!(await isRecordOwner(auth.user, booking))) {
      return notFound("Rental booking");
    }
    return NextResponse.json({ message: "Rental booking fetched", data: customerRentalView(booking) });
  } catch (error) {
    return handleError(error);
  }
}

// Staff: confirm (stock is checked and held), deliver, return, cancel, price, notes
export async function PUT(request: NextRequest, { params }: IdContext) {
  const { id } = await params;
  const auth = await requirePrivilege(request, PRIVILEGES.ORDERS_EDIT);
  if (auth.error) {
    return auth.error;
  }

  try {
    if (!canAccessDivision(auth.user, Division.EVENTS)) {
      throw new ApiError(403, "Rentals belong to the Events division.");
    }
    const body = RentalBookingUpdateRequestSchema.parse(await request.json());
    const existing = await prisma.rentalBooking.findUnique({ where: { id: id }, include: { items: true } });
    if (existing == null) {
      return notFound("Rental booking");
    }

    const status = body.status ?? existing.status;
    const changed = status != existing.status;
    if (changed && !NEXT_STATUSES[existing.status].includes(status)) {
      throw new ApiError(400, `A ${existing.status.toLowerCase()} booking cannot be changed to ${status.toLowerCase()}.`);
    }
    if (changed && status == RentalStatus.CANCELLED && !body.cancelReason) {
      throw new ApiError(400, "cancelReason: please give a reason for cancelling");
    }

    await prisma.$transaction(async (tx) => {
      if (changed && status == RentalStatus.CONFIRMED) {
        // the moment stock is taken: check it is still free on every day
        await assertItemsAvailable(tx, existing.items, existing.startDate, existing.endDate, existing.id);
      }
      await tx.rentalBooking.update({
        where: { id: id },
        data: {
          status: status,
          quotedTotal: body.quotedTotal,
          staffNotes: body.staffNotes,
          cancelReason: changed && status == RentalStatus.CANCELLED ? body.cancelReason : undefined,
        },
      });
    });

    const booking = await prisma.rentalBooking.findUniqueOrThrow({ where: { id: id }, include: include });

    if (changed) {
      await audit({
        userId: auth.user.id,
        action: "rental_booking.status_changed",
        entityType: EntityType.RENTAL_BOOKING,
        entityId: id,
        details: { from: existing.status, to: status, reason: body.cancelReason ?? null },
      });

      const customer = booking.customer;
      const dates = formatRentalDates(booking.startDate, booking.endDate);
      const total = booking.quotedTotal ?? booking.estimatedTotal;
      if (status == RentalStatus.CONFIRMED) {
        await notifyCustomer({
          customer: customer,
          subject: `Rental ${booking.reference} confirmed`,
          body:
            `Dear ${customer.firstName},\n\nYour rental is confirmed and the items are reserved for you.\n\n` +
            `Dates: ${dates}\nVenue: ${booking.venue}, ${booking.city}\n` +
            booking.items.map((item) => `- ${item.quantity} x ${item.name}`).join("\n") +
            `\n\n${booking.quotedTotal != null ? "Total" : "Estimated total"}: ${booking.currency} ${Number(total).toFixed(2)}\n\n` +
            `We will contact you about delivery and payment.`,
          entityType: EntityType.RENTAL_BOOKING,
          entityId: id,
        });
      } else if (status == RentalStatus.CANCELLED) {
        await notifyCustomer({
          customer: customer,
          subject: `Rental ${booking.reference} cancelled`,
          body: `Dear ${customer.firstName},\n\nYour rental for ${dates} has been cancelled.\nReason: ${body.cancelReason}\n\nPlease contact us if you have any questions.`,
          entityType: EntityType.RENTAL_BOOKING,
          entityId: id,
        });
      }
    }

    return NextResponse.json({
      message: "Rental booking updated",
      data: {
        ...booking,
        availability: await getAvailabilityForBooking(booking),
        nextStatuses: NEXT_STATUSES[booking.status],
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
