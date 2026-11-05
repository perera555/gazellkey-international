import prisma from "@/lib/prisma";
import { Prisma } from "@/app/generated/prisma/client";
import { PublishStatus, RentalEventType, RentalStatus } from "@/app/generated/prisma/enums";
import { MAX_RENTAL_DAYS } from "@/types/dto/rental";
import { ApiError } from "@/utils/handleError";
import { fromCents, toCents } from "@/utils/money";
import { Db } from "@/utils/reference";

// Rentals (Events division): tents, chairs, tables ... hired out per day.
//
//   website request  -> REQUESTED (nothing held yet; shows as a request)
//   staff confirm    -> CONFIRMED (stock checked and held for the dates)
//   items delivered  -> DELIVERED (still held)
//   items back       -> RETURNED  (free again)
//   any time before  -> CANCELLED (free again)
//
// Stock is counted per day: an item is available on a day when the
// quantities of CONFIRMED and DELIVERED bookings covering that day leave
// some of quantityOwned free. A booking needs every one of its days free.

export const HOLDING_STATUSES: RentalStatus[] = [RentalStatus.CONFIRMED, RentalStatus.DELIVERED];

export const EVENT_TYPE_LABELS: Record<RentalEventType, string> = {
  WEDDING: "Wedding",
  FUNERAL: "Funeral",
  BIRTHDAY: "Birthday",
  RELIGIOUS: "Religious ceremony",
  CORPORATE: "Corporate event",
  PARTY: "Party",
  OTHER: "Other event",
};

const DAY = 86_400_000;

// "2026-11-14" -> that calendar day at 00:00 UTC (how @db.Date is stored)
export function toDay(value: string) {
  return new Date(`${value}T00:00:00Z`);
}

export function dayString(date: Date) {
  return date.toISOString().slice(0, 10);
}

// 14 Nov - 15 Nov = 2 days (both days count)
export function dayCount(start: Date, end: Date) {
  return Math.round((end.getTime() - start.getTime()) / DAY) + 1;
}

// Today in Sri Lanka, as a calendar day
export function todayInColombo() {
  return toDay(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Colombo" }).format(new Date()));
}

export function formatRentalDates(start: Date, end: Date) {
  const format = (date: Date) =>
    date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  return start.getTime() == end.getTime() ? format(start) : `${format(start)} - ${format(end)}`;
}

export function assertValidDates(start: Date, end: Date, { allowPast = false } = {}) {
  if (end < start) {
    throw new ApiError(400, "endDate: The last day must be on or after the first day");
  }
  if (!allowPast && start < todayInColombo()) {
    throw new ApiError(400, "startDate: Please choose today or a later date");
  }
  if (dayCount(start, end) > MAX_RENTAL_DAYS) {
    throw new ApiError(400, `endDate: One booking can cover at most ${MAX_RENTAL_DAYS} days`);
  }
}

// Most units of each item held on any one day between start and end
export async function peakBooked(
  itemIds: string[],
  start: Date,
  end: Date,
  { excludeBookingId, db = prisma }: { excludeBookingId?: string; db?: Db } = {},
) {
  const lines = await db.rentalBookingItem.findMany({
    where: {
      rentalItemId: { in: itemIds },
      booking: {
        status: { in: HOLDING_STATUSES },
        startDate: { lte: end },
        endDate: { gte: start },
        id: excludeBookingId ? { not: excludeBookingId } : undefined,
      },
    },
    select: { rentalItemId: true, quantity: true, booking: { select: { startDate: true, endDate: true } } },
  });

  const peak = new Map<string, number>();
  for (let day = start.getTime(); day <= end.getTime(); day += DAY) {
    const used = new Map<string, number>();
    for (const line of lines) {
      if (line.booking.startDate.getTime() <= day && line.booking.endDate.getTime() >= day) {
        used.set(line.rentalItemId, (used.get(line.rentalItemId) ?? 0) + line.quantity);
      }
    }
    for (const [itemId, quantity] of used) {
      peak.set(itemId, Math.max(peak.get(itemId) ?? 0, quantity));
    }
  }
  return peak;
}

// Units of each published item still free on every day of the period
export async function getAvailability(start: Date, end: Date) {
  const items = await prisma.rentalItem.findMany({
    where: { status: PublishStatus.PUBLISHED },
    select: { id: true, quantityOwned: true },
  });
  const peak = await peakBooked(items.map((item) => item.id), start, end);
  return items.map((item) => ({
    itemId: item.id,
    owned: item.quantityOwned,
    available: Math.max(0, item.quantityOwned - (peak.get(item.id) ?? 0)),
  }));
}

// For the admin booking page: units of each booked item free on the
// booking's dates, not counting the booking itself
export async function getAvailabilityForBooking(booking: {
  id: string;
  startDate: Date;
  endDate: Date;
  items: { rentalItemId: string }[];
}) {
  const ids = booking.items.map((item) => item.rentalItemId);
  const [items, peak] = await Promise.all([
    prisma.rentalItem.findMany({ where: { id: { in: ids } }, select: { id: true, quantityOwned: true } }),
    peakBooked(ids, booking.startDate, booking.endDate, { excludeBookingId: booking.id }),
  ]);
  return Object.fromEntries(
    items.map((item) => [item.id, Math.max(0, item.quantityOwned - (peak.get(item.id) ?? 0))]),
  );
}

// Inside a transaction: locks the items, then throws 409 when any line needs
// more than is free. Locking stops two confirmations taking the last chairs.
export async function assertItemsAvailable(
  tx: Prisma.TransactionClient,
  lines: { rentalItemId: string; quantity: number; name: string }[],
  start: Date,
  end: Date,
  excludeBookingId?: string,
) {
  const ids = [...new Set(lines.map((line) => line.rentalItemId))];
  await tx.$queryRaw`SELECT id FROM "RentalItem" WHERE id IN (${Prisma.join(ids)}) FOR UPDATE`;
  const items = await tx.rentalItem.findMany({ where: { id: { in: ids } } });
  const peak = await peakBooked(ids, start, end, { excludeBookingId, db: tx });

  const short = lines
    .map((line) => {
      const item = items.find((each) => each.id == line.rentalItemId);
      const free = item ? item.quantityOwned - (peak.get(line.rentalItemId) ?? 0) : 0;
      return free < line.quantity ? `${line.name}: ${Math.max(0, free)} free, ${line.quantity} needed` : null;
    })
    .filter(Boolean);
  if (short.length > 0) {
    throw new ApiError(409, `Not enough stock for these dates - ${short.join("; ")}.`);
  }
}

// Prices a website request from the database (never from the browser)
export async function priceRentalRequest(
  requested: { rentalItemId: string; quantity: number }[],
  start: Date,
  end: Date,
) {
  // the same item twice -> one line
  const merged = new Map<string, number>();
  for (const line of requested) {
    merged.set(line.rentalItemId, (merged.get(line.rentalItemId) ?? 0) + line.quantity);
  }
  const items = await prisma.rentalItem.findMany({
    where: { id: { in: [...merged.keys()] }, status: PublishStatus.PUBLISHED },
  });
  const days = dayCount(start, end);

  const lines = [...merged].map(([itemId, quantity]) => {
    const item = items.find((each) => each.id == itemId);
    if (item == null) {
      throw new ApiError(404, "An item you chose is no longer available for hire. Please remove it.");
    }
    if (quantity < item.minQuantity) {
      throw new ApiError(400, `${item.name}: the minimum is ${item.minQuantity} ${item.unit}.`);
    }
    if (quantity > item.quantityOwned) {
      throw new ApiError(409, `${item.name}: we have ${item.quantityOwned} in total.`);
    }
    const lineCents = toCents(item.pricePerDay) * quantity * days;
    return {
      rentalItemId: item.id,
      name: item.name,
      quantity: quantity,
      pricePerDay: item.pricePerDay,
      days: days,
      lineTotal: fromCents(lineCents),
      lineCents: lineCents,
      currency: item.currency,
    };
  });

  const currency = lines[0].currency;
  if (lines.some((line) => line.currency != currency)) {
    throw new ApiError(400, "Items priced in different currencies must be requested separately.");
  }
  return {
    lines,
    days,
    currency,
    estimatedTotal: fromCents(lines.reduce((sum, line) => sum + line.lineCents, 0)),
  };
}

// What the customer may see of a booking (no staff notes)
export function customerRentalView<T extends { staffNotes: string | null }>(booking: T) {
  const { staffNotes: _hidden, ...visible } = booking;
  void _hidden;
  return visible;
}
