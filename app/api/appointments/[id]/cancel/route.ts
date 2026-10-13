import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { AppointmentStatus, EntityType } from "@/app/generated/prisma/enums";
import { PRIVILEGES } from "@/lib/privileges";
import {
  ACTIVE_STATUSES,
  customerAppointmentView,
  formatAppointmentTime,
  syncAppointmentCalendar,
} from "@/lib/appointments";
import { isRecordOwner } from "@/lib/access";
import { notifyCustomer } from "@/lib/notifications";
import { AppointmentCancelRequestSchema } from "@/types/dto/appointment";
import {
  canAccessDivision,
  hasPrivilege,
  requireUser,
} from "@/utils/authentication";
import { ApiError, handleError, notFound } from "@/utils/handleError";
import { audit } from "@/utils/audit";
import { IdContext } from "@/utils/params";

// The customer cancels their own appointment from the website account
// (staff may use it too). Removes it from Google Calendar.
export async function POST(request: NextRequest, { params }: IdContext) {
  const { id } = await params;
  const auth = await requireUser(request);
  if (auth.error) {
    return auth.error;
  }

  try {
    const body = AppointmentCancelRequestSchema.parse(
      await request.json().catch(() => ({})),
    );

    const existing = await prisma.appointment.findUnique({
      where: { id: id },
      include: { customer: true },
    });
    if (existing == null) {
      return notFound("Appointment");
    }

    const isStaff =
      hasPrivilege(auth.user, PRIVILEGES.APPOINTMENTS_EDIT) &&
      canAccessDivision(auth.user, existing.division);
    if (!isStaff && !(await isRecordOwner(auth.user, existing))) {
      return notFound("Appointment");
    }

    if (!ACTIVE_STATUSES.includes(existing.status)) {
      throw new ApiError(400, "This appointment can no longer be cancelled.");
    }
    if (existing.startAt <= new Date()) {
      throw new ApiError(400, "This appointment has already started.");
    }

    const reason =
      body.reason || (isStaff ? "Cancelled by our team" : "Cancelled by the customer");

    const appointment = await prisma.appointment.update({
      where: { id: id },
      data: { status: AppointmentStatus.CANCELLED, cancelReason: reason },
    });

    await syncAppointmentCalendar(id);

    await audit({
      userId: auth.user.id,
      action: "appointment.status_changed",
      entityType: "APPOINTMENT",
      entityId: id,
      details: { from: existing.status, to: AppointmentStatus.CANCELLED, reason: reason },
    });

    await notifyCustomer({
      customer: existing.customer,
      subject: `Appointment ${existing.reference} cancelled`,
      body: `Dear ${existing.customer.firstName},\n\nYour appointment on ${formatAppointmentTime(existing.startAt)} has been cancelled.\nReason: ${reason}\n\nYou are welcome to book a new time on our website.`,
      entityType: EntityType.APPOINTMENT,
      entityId: id,
    });

    return NextResponse.json({
      message: "Appointment cancelled",
      data: customerAppointmentView(appointment),
    });
  } catch (error) {
    return handleError(error);
  }
}
