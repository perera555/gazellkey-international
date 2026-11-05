import { NextRequest, NextResponse } from "next/server";
import { assertValidDates, dayCount, getAvailability, toDay } from "@/lib/rentals";
import { dayStringSchema } from "@/types/dto/rental";
import { ApiError, handleError } from "@/utils/handleError";
import { searchParam } from "@/utils/params";

// Public: how many of each rental item are free on every day of a period
// /api/rentals/availability?from=2026-11-14&to=2026-11-15
export async function GET(request: NextRequest) {
  try {
    const from = searchParam(request, "from");
    const to = searchParam(request, "to") ?? from;
    if (!from || !dayStringSchema.safeParse(from).success || !dayStringSchema.safeParse(to).success) {
      throw new ApiError(400, "from and to must be dates like 2026-11-14");
    }
    const start = toDay(from);
    const end = toDay(to!);
    assertValidDates(start, end);

    return NextResponse.json({
      message: "Availability fetched",
      days: dayCount(start, end),
      data: await getAvailability(start, end),
    });
  } catch (error) {
    return handleError(error);
  }
}
