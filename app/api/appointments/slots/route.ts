import { NextRequest, NextResponse } from "next/server";
import { Division } from "@/app/generated/prisma/enums";
import { APPOINTMENT_HOURS, getAvailableSlots } from "@/lib/appointments";
import { ApiError, handleError } from "@/utils/handleError";
import { enumParam, searchParam } from "@/utils/params";

// Public: free appointment times of one day for one division
//   /api/appointments/slots?division=TRAVEL&date=2026-10-14
export async function GET(request: NextRequest) {
  try {
    const division = enumParam(request, "division", Division);
    const date = searchParam(request, "date");
    if (division == undefined || date == undefined) {
      throw new ApiError(400, "division and date (YYYY-MM-DD) are required");
    }

    const slots = await getAvailableSlots(date, division);

    return NextResponse.json({
      message: "Available times fetched",
      data: {
        date: date,
        division: division,
        timeZone: APPOINTMENT_HOURS.timeZone,
        slotMinutes: APPOINTMENT_HOURS.slotMinutes,
        maxDaysAhead: APPOINTMENT_HOURS.maxDaysAhead,
        slots: slots.map((slot) => slot.toISOString()),
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
