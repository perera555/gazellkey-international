import prisma from "@/lib/prisma";
import {
  AppointmentMode,
  AppointmentStatus,
  Division,
} from "@/app/generated/prisma/enums";
import {
  deleteCalendarEvent,
  getBusyTimes,
  isCalendarEnabled,
  saveCalendarEvent,
} from "@/lib/googleCalendar";
import { adminUrl } from "@/lib/officeAlerts";
import { ApiError } from "@/utils/handleError";
import { Db } from "@/utils/reference";

// Office hours for bookings. Sri Lanka has no daylight saving,
// so a fixed UTC offset is safe.
export const APPOINTMENT_HOURS = {
  timeZone: "Asia/Colombo",
  utcOffset: "+05:30",
  openMinute: 9 * 60, // 09:00
  closeMinute: 17 * 60, // 17:00 - last slot ends here
  slotMinutes: 30,
  workDays: [1, 2, 3, 4, 5, 6], // Monday - Saturday (0 = Sunday)
  minNoticeMinutes: 2 * 60, // cannot book a slot starting within 2 hours
  maxDaysAhead: 60,
};

const OFFSET_MS = (5 * 60 + 30) * 60_000;

// A slot is taken while an appointment in it is still going ahead
export const ACTIVE_STATUSES: AppointmentStatus[] = [
  AppointmentStatus.REQUESTED,
  AppointmentStatus.CONFIRMED,
];

// "2026-10-14" in the office time zone
export function localDay(date: Date) {
  return new Date(date.getTime() + OFFSET_MS).toISOString().slice(0, 10);
}

// Every bookable start time of one day ("YYYY-MM-DD"), ignoring bookings
export function slotsForDay(day: string): Date[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    throw new ApiError(400, "date must be a valid date (YYYY-MM-DD)");
  }
  const midnight = new Date(`${day}T00:00:00${APPOINTMENT_HOURS.utcOffset}`);
  if (Number.isNaN(midnight.getTime())) {
    throw new ApiError(400, "date must be a valid date (YYYY-MM-DD)");
  }
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
  if (!APPOINTMENT_HOURS.workDays.includes(weekday)) {
    return [];
  }

  const slots: Date[] = [];
  for (
    let minute = APPOINTMENT_HOURS.openMinute;
    minute + APPOINTMENT_HOURS.slotMinutes <= APPOINTMENT_HOURS.closeMinute;
    minute += APPOINTMENT_HOURS.slotMinutes
  ) {
    slots.push(new Date(midnight.getTime() + minute * 60_000));
  }
  return slots;
}

export function slotEnd(start: Date, minutes = APPOINTMENT_HOURS.slotMinutes) {
  return new Date(start.getTime() + minutes * 60_000);
}

function overlaps(start: Date, end: Date, other: { start: Date; end: Date }) {
  return start < other.end && other.start < end;
}

// Free start times for one division on one day.
// Removes past times, times already booked in that division, and times
// marked busy in the company Google Calendar.
export async function getAvailableSlots(
  day: string,
  division: Division,
  excludeAppointmentId?: string,
) {
  const earliest = new Date(Date.now() + APPOINTMENT_HOURS.minNoticeMinutes * 60_000);
  const latest = new Date(Date.now() + APPOINTMENT_HOURS.maxDaysAhead * 86_400_000);
  const candidates = slotsForDay(day).filter(
    (start) => start >= earliest && start <= latest,
  );
  if (candidates.length == 0) {
    return [];
  }

  const dayStart = candidates[0];
  const dayEnd = slotEnd(candidates[candidates.length - 1]);

  const booked = await prisma.appointment.findMany({
    where: {
      division: division,
      status: { in: ACTIVE_STATUSES },
      startAt: { lt: dayEnd },
      endAt: { gt: dayStart },
      id: excludeAppointmentId ? { not: excludeAppointmentId } : undefined,
    },
    select: { startAt: true, endAt: true },
  });
  const busy = booked.map((row) => ({ start: row.startAt, end: row.endAt }));

  if (isCalendarEnabled()) {
    try {
      busy.push(...(await getBusyTimes(dayStart, dayEnd, APPOINTMENT_HOURS.utcOffset)));
    } catch (error) {
      // Google down: still offer the times free in our own database
      console.error("Could not read Google Calendar busy times", error);
    }
  }

  return candidates.filter(
    (start) => !busy.some((period) => overlaps(start, slotEnd(start), period)),
  );
}

// Public booking: the time must be a free slot right now
export async function assertSlotAvailable(start: Date, division: Division) {
  const free = await getAvailableSlots(localDay(start), division);
  if (!free.some((slot) => slot.getTime() == start.getTime())) {
    throw new ApiError(
      409,
      "That time is no longer available. Please choose another time.",
    );
  }
}

// Staff reschedule: any time is allowed (staff may book outside office
// hours), but not on top of another appointment of the same division.
export async function assertNoClash(
  start: Date,
  end: Date,
  division: Division,
  excludeAppointmentId: string,
  db: Db = prisma,
) {
  const clash = await db.appointment.findFirst({
    where: {
      id: { not: excludeAppointmentId },
      division: division,
      status: { in: ACTIVE_STATUSES },
      startAt: { lt: end },
      endAt: { gt: start },
    },
    select: { reference: true },
  });
  if (clash != null) {
    throw new ApiError(409, `This time overlaps appointment ${clash.reference}.`);
  }
}

// Stops two people booking the same slot at the same moment: the second
// transaction waits here until the first one has saved its appointment.
export async function lockSlot(db: Db, division: Division, start: Date) {
  const key = `appointment:${division}:${start.toISOString()}`;
  await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
}

// "Wednesday, 14 October 2026 at 10:30 (Sri Lanka time)"
export function formatAppointmentTime(date: Date) {
  const text = new Intl.DateTimeFormat("en-GB", {
    timeZone: APPOINTMENT_HOURS.timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
  return `${text} (Sri Lanka time)`;
}

export const MODE_LABELS: Record<AppointmentMode, string> = {
  IN_PERSON: "Office visit",
  PHONE: "Phone call",
  VIDEO: "Video call",
};

type AppointmentDetails = {
  reference: string;
  subject: string;
  mode: AppointmentMode;
  startAt: Date;
  endAt: Date;
  location: string | null;
  meetingLink: string | null;
};

// Where the customer should go / connect
export function appointmentPlace(appointment: AppointmentDetails) {
  if (appointment.mode == AppointmentMode.VIDEO) {
    return appointment.meetingLink ?? "Video call link will be emailed to you";
  }
  if (appointment.mode == AppointmentMode.PHONE) {
    return "We will call you on your phone number";
  }
  return (
    appointment.location ??
    process.env.OFFICE_ADDRESS ??
    "Gazellekey International office"
  );
}

// 2026-10-14T05:00:00.000Z -> "20261014T050000Z" (Google's date format)
function googleDate(date: Date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

// "Add to Google Calendar" link for the customer: opens Google Calendar
// with the event filled in. Works for any Google account, no setup needed.
export function googleCalendarAddUrl(appointment: AppointmentDetails) {
  const query = new URLSearchParams({
    action: "TEMPLATE",
    text: `Gazellekey: ${appointment.subject}`,
    dates: `${googleDate(appointment.startAt)}/${googleDate(appointment.endAt)}`,
    details: `${MODE_LABELS[appointment.mode]} with Gazellekey International.\nReference: ${appointment.reference}`,
    location: appointmentPlace(appointment),
    ctz: APPOINTMENT_HOURS.timeZone,
  });
  return `https://calendar.google.com/calendar/render?${query}`;
}

// What a customer may see of their own appointment (no staff notes,
// no internal calendar fields)
export function customerAppointmentView<
  T extends AppointmentDetails & {
    id: string;
    division: Division;
    serviceType: string | null;
    message: string | null;
    status: AppointmentStatus;
    cancelReason: string | null;
    createdAt: Date;
  },
>(appointment: T) {
  return {
    id: appointment.id,
    reference: appointment.reference,
    division: appointment.division,
    serviceType: appointment.serviceType,
    subject: appointment.subject,
    message: appointment.message,
    mode: appointment.mode,
    startAt: appointment.startAt,
    endAt: appointment.endAt,
    status: appointment.status,
    location: appointment.location,
    meetingLink: appointment.meetingLink,
    cancelReason: appointment.cancelReason,
    createdAt: appointment.createdAt,
    place: appointmentPlace(appointment),
    // only a confirmed time is worth putting in a calendar
    googleCalendarUrl:
      appointment.status == AppointmentStatus.CONFIRMED
        ? googleCalendarAddUrl(appointment)
        : null,
  };
}

// Copies the appointment to the office Google Calendar: REQUESTED (yellow,
// "To confirm"), CONFIRMED and COMPLETED have an event, every other status
// has none. Never throws - a Google problem is stored in calendarError so
// staff can see it and press "Sync again".
export async function syncAppointmentCalendar(appointmentId: string) {
  if (!isCalendarEnabled()) {
    return;
  }

  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      customer: true,
      assignedTo: { select: { firstName: true, lastName: true, email: true } },
    },
  });
  if (appointment == null) {
    return;
  }

  const toConfirm = appointment.status == AppointmentStatus.REQUESTED;
  const wantsEvent =
    toConfirm ||
    appointment.status == AppointmentStatus.CONFIRMED ||
    appointment.status == AppointmentStatus.COMPLETED;

  try {
    if (wantsEvent) {
      const customer = appointment.customer;
      const customerName = [customer.firstName, customer.lastName]
        .filter(Boolean)
        .join(" ");
      const staff = appointment.assignedTo
        ? `${appointment.assignedTo.firstName} ${appointment.assignedTo.lastName} (${appointment.assignedTo.email})`
        : "Not assigned yet";

      const event = await saveCalendarEvent(
        {
          appointmentId: appointment.id,
          summary: `${toConfirm ? "To confirm: " : ""}${appointment.subject} - ${customerName} [${appointment.reference}]`,
          description: [
            toConfirm ? `NEW REQUEST - please confirm it in the admin portal:\n${adminUrl(`/appointments/${appointment.id}`)}\n` : null,
            `Appointment ${appointment.reference} (${appointment.division})`,
            `Type: ${MODE_LABELS[appointment.mode]}`,
            `Customer: ${customerName}${customer.companyName ? `, ${customer.companyName}` : ""}`,
            `Email: ${customer.email}`,
            customer.phone ? `Phone: ${customer.phone}` : null,
            `Staff: ${staff}`,
            appointment.meetingLink ? `Meeting link: ${appointment.meetingLink}` : null,
            appointment.message ? `\nCustomer message:\n${appointment.message}` : null,
          ]
            .filter(Boolean)
            .join("\n"),
          location:
            appointment.mode == AppointmentMode.VIDEO
              ? appointment.meetingLink
              : appointment.location,
          start: appointment.startAt,
          end: appointment.endAt,
          timeZone: APPOINTMENT_HOURS.timeZone,
          // phone reminders: the day before and an hour before (plus 15 min once confirmed)
          reminderMinutes: toConfirm ? [24 * 60, 60] : [24 * 60, 60, 15],
          colorId: toConfirm ? "5" : "10", // yellow = to confirm, green = confirmed
        },
        appointment.googleEventId,
      );

      await prisma.appointment.update({
        where: { id: appointment.id },
        data: {
          googleEventId: event.id,
          googleEventLink: event.htmlLink,
          calendarSyncedAt: new Date(),
          calendarError: null,
        },
      });
    } else if (appointment.googleEventId) {
      await deleteCalendarEvent(appointment.googleEventId);
      await prisma.appointment.update({
        where: { id: appointment.id },
        data: {
          googleEventId: null,
          googleEventLink: null,
          calendarSyncedAt: new Date(),
          calendarError: null,
        },
      });
    }
  } catch (error) {
    console.error("Google Calendar sync failed", error);
    await prisma.appointment.update({
      where: { id: appointment.id },
      data: { calendarError: String(error instanceof Error ? error.message : error) },
    });
  }
}
