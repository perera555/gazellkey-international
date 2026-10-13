import prisma from "@/lib/prisma";
import { NextResponse } from "next/server";
import { PublishStatus } from "@/app/generated/prisma/enums";
import { handleError } from "@/utils/handleError";

// GET /api/travel/tours/countries - countries that have published tours,
// for the country picker on the Travel page. Public.
export async function GET() {
  try {
    const rows = await prisma.tourPackage.findMany({
      where: { status: PublishStatus.PUBLISHED, country: { not: null } },
      distinct: ["country"],
      select: { country: true },
      orderBy: { country: "asc" },
    });
    const countries = rows
      .map((row) => row.country?.trim() ?? "")
      .filter((country) => country != "");

    return NextResponse.json({
      message: "Tour countries fetched",
      data: [...new Set(countries)],
    });
  } catch (error) {
    return handleError(error);
  }
}
