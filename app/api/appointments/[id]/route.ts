import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { AppointmentStatus, EntityType } from "@/app/generated/prisma/enums";
import { PRIVILEGES } from "@/lib/privileges";
import {
  ACTIVE_STATUSES,
  appointmentPlace,
  assertNoClash,
  customerAppointmentView,
  formatAppointmentTime,
  googleCalendarAddUrl,
  lockSlot,
  MODE_LABELS,
  slotEnd,
  syncAppointmentCalendar,
} from "@/lib/appointments";
import { isRecordOwner } from "@/lib/access";
import { isCalendarEnabled } from "@/lib/googleCalendar";
import { notifyCustomer } from "@/lib/notifications";
import { assertAssignableStaff } from "@/lib/staff";
import { staffNameFields } from "@/lib/selects";
import { AppointmentUpdateRequestSchema } from "@/types/dto/appointment";
import {
  canAccessDivision,
  hasPrivilege,
  requirePrivilege,
  requireUser,
} from "@/utils/authentication";
import { ApiError, handleError, notFound } from "@/utils/handleError";
import { audit } from "@/utils/audit";
import { IdContext } from "@/utils/params";

// Status changes staff may make. Finished appointments stay finished -
// book a new one instead of reopening.
const NEXT_STATUSES: Record<AppointmentStatus, AppointmentStatus[]> = {
  REQUESTED: [AppointmentStatus.CONFIRMED, AppointmentStatus.CANCELLED],
  CONFIRMED: [
    AppointmentStatus.COMPLETED,
    AppointmentStatus.CANCELLED,
    AppointmentStatus.NO_SHOW,
  ],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

function staffInclude() {
  return {
    customer: true,
    assignedTo: { select: staffNameFields },
    enquiry: { select: { id: true, reference: true, subject: true } },
  };
}

// Staff with the privilege (their divisions), or the customer it belongs to
export async function GET(request: NextRequest, { params }: IdContext) {
  const { id } = await params;
  const auth = await requireUser(request);
  if (auth.error) {
    return auth.error;
  }

  try {
    const appointment = await prisma.appointment.findUnique({
      where: { id: id },
      include: staffInclude(),
    });
    if (appointment == null) {
      return notFound("Appointment");
    }

    if (hasPrivilege(auth.user, PRIVILEGES.APPOINTMENTS_READ)) {
      if (!canAccessDivision(auth.user, appointment.division)) {
        return notFound("Appointment");
      }
      return NextResponse.json({
        message: "Appointment fetched",
        data: {
          ...appointment,
          calendarEnabled: isCalendarEnabled(),
          googleCalendarUrl: googleCalendarAddUrl(appointment),
        },
      });
    }

    if (!(await isRecordOwner(auth.user, appointment))) {
      return notFound("Appointment");
    }
    return NextResponse.json({
      message: "Appointment fetched",
      data: customerAppointmentView(appointment),
    });
  } catch (error) {
    return handleError(error);
  }
}

// Staff: confirm, reschedule, assign, change status, add meeting details
export async function PUT(request: NextRequest, { params }: IdContext) {
  const { id } = await params;
  const auth = await requirePrivilege(request, PRIVILEGES.APPOINTMENTS_EDIT);
  if (auth.error) {
    return auth.error;
  }

  try {
    const body = AppointmentUpdateRequestSchema.parse(await request.json());

    const existing = await prisma.appointment.findUnique({ where: { id: id } });
    if (existing == null || !canAccessDivision(auth.user, existing.division)) {
      return notFound("Appointment");
    }

    const status = body.status ?? existing.status;
    if (status != existing.status && !NEXT_STATUSES[existing.status].includes(status)) {
      throw new ApiError(
        400,
        `A ${existing.status.toLowerCase()} appointment cannot be changed to ${status.toLowerCase()}.`,
      );
    }
    if (status == AppointmentStatus.CANCELLED && existing.status != status && !body.cancelReason) {
      throw new ApiError(400, "cancelReason: please give a reason for cancelling");
    }

    // reschedule: new start and/or length
    const wantsNewTime = body.startAt != undefined || body.durationMinutes != undefined;
    const startAt = body.startAt ?? existing.startAt;
    const minutes =
      body.durationMinutes ??
      Math.round((existing.endAt.getTime() - existing.startAt.getTime()) / 60_000);
    const endAt = slotEnd(startAt, minutes);
    const timeChanged =
      startAt.getTime() != existing.startAt.getTime() ||
      endAt.getTime() != existing.endAt.getTime();

    if (wantsNewTime && timeChanged && !ACTIVE_STATUSES.includes(status)) {
      throw new ApiError(400, "Only requested or confirmed appointments can be rescheduled.");
    }

    if (body.assignedToId) {
      await assertAssignableStaff(body.assignedToId, existing.division);
    }

    await prisma.$transaction(async (tx) => {
      if (timeChanged) {
        await lockSlot(tx, existing.division, startAt);
        await assertNoClash(startAt, endAt, existing.division, id, tx);
      }
      await tx.appointment.update({
        where: { id: id },
        data: {
          status: status,
          startAt: startAt,
          endAt: endAt,
          mode: body.mode,
          assignedToId: body.assignedToId,
          location: body.location,
          meetingLink: body.meetingLink,
          staffNotes: body.staffNotes,
          cancelReason:
            status == AppointmentStatus.CANCELLED ? body.cancelReason : undefined,
        },
      });
    });

    // Google Calendar follows the new state (adds, moves or removes the event)
    await syncAppointmentCalendar(id);

    const appointment = await prisma.appointment.findUniqueOrThrow({
      where: { id: id },
      include: staffInclude(),
    });

    if (status != existing.status) {
      await audit({
        userId: auth.user.id,
        action: "appointment.status_changed",
        entityType: "APPOINTMENT",
        entityId: id,
        details: { from: existing.status, to: status, reason: body.cancelReason ?? null },
      });
    }
    if (timeChanged) {
      await audit({
        userId: auth.user.id,
        action: "appointment.rescheduled",
        entityType: "APPOINTMENT",
        entityId: id,
        details: { from: existing.startAt.toISOString(), to: startAt.toISOString() },
      });
    }
    if (body.assignedToId !== undefined && body.assignedToId != existing.assignedToId) {
      await audit({
        userId: auth.user.id,
        action: "appointment.assigned",
        entityType: "APPOINTMENT",
        entityId: id,
        details: { from: existing.assignedToId, to: body.assignedToId },
      });
    }

    // Tell the customer about the changes that matter to them
    const customer = appointment.customer;
    const when = formatAppointmentTime(appointment.startAt);
    const details = `When: ${when}\nType: ${MODE_LABELS[appointment.mode]}\nWhere: ${appointmentPlace(appointment)}`;
    const addLink = `\n\nAdd it to your Google Calendar:\n${googleCalendarAddUrl(appointment)}`;

    if (status == AppointmentStatus.CONFIRMED && existing.status != status) {
      await notifyCustomer({
        customer: customer,
        subject: `Appointment ${appointment.reference} confirmed`,
        body: `Dear ${customer.firstName},\n\nYour appointment "${appointment.subject}" is confirmed.\n\n${details}${addLink}\n\nIf you cannot make it, you can cancel it in your account or reply to this email.`,
        entityType: EntityType.APPOINTMENT,
        entityId: id,
      });
    } else if (status == AppointmentStatus.CANCELLED && existing.status != status) {
      await notifyCustomer({
        customer: customer,
        subject: `Appointment ${appointment.reference} cancelled`,
        body: `Dear ${customer.firstName},\n\nWe are sorry, your appointment on ${when} has been cancelled.\nReason: ${body.cancelReason}\n\nYou are welcome to book a new time on our website.`,
        entityType: EntityType.APPOINTMENT,
        entityId: id,
      });
    } else if (ACTIVE_STATUSES.includes(status) && timeChanged) {
      await notifyCustomer({
        customer: customer,
        subject: `Appointment ${appointment.reference} moved to a new time`,
        body: `Dear ${customer.firstName},\n\nYour appointment "${appointment.subject}" has a new time.\n\n${details}${status == AppointmentStatus.CONFIRMED ? addLink : ""}`,
        entityType: EntityType.APPOINTMENT,
        entityId: id,
      });
    }

    return NextResponse.json({
      message: "Appointment updated successfully",
      data: {
        ...appointment,
        calendarEnabled: isCalendarEnabled(),
        googleCalendarUrl: googleCalendarAddUrl(appointment),
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
