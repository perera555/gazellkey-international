import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { PRIVILEGES } from "@/lib/privileges";
import { syncAppointmentCalendar } from "@/lib/appointments";
import { isCalendarEnabled } from "@/lib/googleCalendar";
import { canAccessDivision, requirePrivilege } from "@/utils/authentication";
import { ApiError, handleError, notFound } from "@/utils/handleError";
import { IdContext } from "@/utils/params";

// Staff: "Sync again" - copies the appointment to Google Calendar after
// an earlier failure (Google down, calendar not shared yet ...)
export async function POST(request: NextRequest, { params }: IdContext) {
  const { id } = await params;
  const auth = await requirePrivilege(request, PRIVILEGES.APPOINTMENTS_EDIT);
  if (auth.error) {
    return auth.error;
  }

  try {
    if (!isCalendarEnabled()) {
      throw new ApiError(
        400,
        "Google Calendar is not set up. Add the GOOGLE_* settings to the backend .env file.",
      );
    }

    const existing = await prisma.appointment.findUnique({ where: { id: id } });
    if (existing == null || !canAccessDivision(auth.user, existing.division)) {
      return notFound("Appointment");
    }

    await syncAppointmentCalendar(id);

    const appointment = await prisma.appointment.findUniqueOrThrow({
      where: { id: id },
      select: {
        googleEventId: true,
        googleEventLink: true,
        calendarSyncedAt: true,
        calendarError: true,
      },
    });
    if (appointment.calendarError) {
      throw new ApiError(502, appointment.calendarError);
    }

    return NextResponse.json({
      message: appointment.googleEventId
        ? "Saved to Google Calendar"
        : "Google Calendar is up to date",
      data: appointment,
    });
  } catch (error) {
    return handleError(error);
  }
}
