import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/app/generated/prisma/client";
import { Division, PublishStatus } from "@/app/generated/prisma/enums";
import { isCatalogueEditor } from "@/lib/catalogue";
import { HotelCreateRequestSchema } from "@/types/dto/travel";
import { getUser, requireUser } from "@/utils/authentication";
import { ApiError, handleError } from "@/utils/handleError";
import { audit } from "@/utils/audit";
import { enumParam, searchParam } from "@/utils/params";
import getPageInfo, { buildPagination } from "@/utils/pageInfoRetrivel";

// Public hotel list
// /api/travel/hotels?search=galle&country=sri lanka&city=kandy&stars=4
// "search" matches name, city and country; "stars" = this rating or higher.
export async function GET(request: NextRequest) {
  try {
    const params = getPageInfo(request);
    const user = await getUser(request);
    const isEditor = isCatalogueEditor(user, Division.TRAVEL);
    const search = searchParam(request, "search");
    const country = searchParam(request, "country");
    const city = searchParam(request, "city");
    const stars = parseInt(searchParam(request, "stars") ?? "", 10);

    const where: Prisma.HotelWhereInput = {
      // visitors only see published hotels; editors may filter by status
      status: isEditor ? enumParam(request, "status", PublishStatus) : PublishStatus.PUBLISHED,
      country: country ? { contains: country, mode: "insensitive" } : undefined,
      city: city ? { contains: city, mode: "insensitive" } : undefined,
      starRating: Number.isNaN(stars) ? undefined : { gte: stars },
      OR: search
        ? [
            { name: { contains: search, mode: "insensitive" } },
            { city: { contains: search, mode: "insensitive" } },
            { country: { contains: search, mode: "insensitive" } },
          ]
        : undefined,
    };

    const [hotels, totalCount] = await Promise.all([
      prisma.hotel.findMany({
        where: where,
        skip: params.skip,
        take: params.take,
        orderBy: [{ starRating: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      }),
      prisma.hotel.count({ where: where }),
    ]);

    return NextResponse.json({
      message: "Hotels fetched successfully",
      data: hotels,
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
    const body = HotelCreateRequestSchema.parse(await request.json());

    const hotel = await prisma.hotel.create({ data: body });

    await audit({
      userId: auth.user.id,
      action: "hotel.created",
      entityType: "HOTEL",
      entityId: hotel.id,
    });

    return NextResponse.json({ message: "Hotel created successfully", data: hotel }, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}
