import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/app/generated/prisma/client";
import { Division, PublishStatus, TourType } from "@/app/generated/prisma/enums";
import { isCatalogueEditor } from "@/lib/catalogue";
import { TourCreateRequestSchema } from "@/types/dto/travel";
import { getUser, requireUser } from "@/utils/authentication";
import { ApiError, handleError } from "@/utils/handleError";
import { audit } from "@/utils/audit";
import { enumParam, searchParam } from "@/utils/params";
import getPageInfo, { buildPagination } from "@/utils/pageInfoRetrivel";

// Public tour catalogue (FR-TRV-03, FR-SH-01)
// /api/travel/tours?tourType=OUTBOUND&country=thailand&search=phuket
// "search" also matches the country; "country" filters by country only.
export async function GET(request: NextRequest) {
  try {
    const params = getPageInfo(request);
    const user = await getUser(request);
    const isEditor = isCatalogueEditor(user, Division.TRAVEL);
    const search = searchParam(request, "search");
    const country = searchParam(request, "country");

    const where: Prisma.TourPackageWhereInput = {
      // visitors only see published tours; editors may filter by status
      status: isEditor
        ? enumParam(request, "status", PublishStatus)
        : PublishStatus.PUBLISHED,
      tourType: enumParam(request, "tourType", TourType),
      // a tour without a country counts under its destination (e.g. "Maldives")
      AND: country
        ? [
            {
              OR: [
                { country: { contains: country, mode: "insensitive" } },
                { country: null, destination: { contains: country, mode: "insensitive" } },
              ],
            },
          ]
        : undefined,
      OR: search
        ? [
            { title: { contains: search, mode: "insensitive" } },
            { destination: { contains: search, mode: "insensitive" } },
            { country: { contains: search, mode: "insensitive" } },
          ]
        : undefined,
    };

    const [tours, totalCount] = await Promise.all([
      prisma.tourPackage.findMany({
        where: where,
        skip: params.skip,
        take: params.take,
        orderBy: { createdAt: "desc" },
      }),
      prisma.tourPackage.count({ where: where }),
    ]);

    return NextResponse.json({
      message: "Tours fetched successfully",
      data: tours,
      pagination: buildPagination(params, totalCount),
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireUser(request);
  if (auth.error) {
    return auth.error;
  }

  try {
    if (!isCatalogueEditor(auth.user, Division.TRAVEL)) {
      throw new ApiError(403, "You cannot edit the Travel catalogue.");
    }
    const body = TourCreateRequestSchema.parse(await request.json());

    const tour = await prisma.tourPackage.create({ data: body });

    await audit({
      userId: auth.user.id,
      action: "tour.created",
      entityType: "TOUR_PACKAGE",
      entityId: tour.id,
    });

    return NextResponse.json(
      { message: "Tour created successfully", data: tour },
      { status: 201 },
    );
  } catch (error) {
    return handleError(error);
  }
}
