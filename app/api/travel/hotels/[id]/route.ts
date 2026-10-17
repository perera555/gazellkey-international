import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { Division, PublishStatus } from "@/app/generated/prisma/enums";
import { idOrKey, isCatalogueEditor } from "@/lib/catalogue";
import { HotelUpdateRequestSchema } from "@/types/dto/travel";
import { getUser, requireUser } from "@/utils/authentication";
import { ApiError, handleError, notFound } from "@/utils/handleError";
import { audit } from "@/utils/audit";
import { IdContext } from "@/utils/params";

// GET /api/travel/hotels/{id or slug}
export async function GET(request: NextRequest, { params }: IdContext) {
  const { id } = await params;
  const user = await getUser(request);

  const hotel = await prisma.hotel.findFirst({ where: idOrKey(id, "slug") });
  if (hotel == null || (hotel.status != PublishStatus.PUBLISHED && !isCatalogueEditor(user, Division.TRAVEL))) {
    return notFound("Hotel");
  }
  return NextResponse.json({ message: "Hotel fetched", data: hotel });
}

export async function PUT(request: NextRequest, { params }: IdContext) {
  const { id } = await params;
  const auth = await requireUser(request);
  if (auth.error) {
    return auth.error;
  }

  try {
    if (!isCatalogueEditor(auth.user, Division.TRAVEL)) {
      throw new ApiError(403, "You cannot edit the Travel catalogue.");
    }
    const body = HotelUpdateRequestSchema.parse(await request.json());

    const hotel = await prisma.hotel.update({ where: { id: id }, data: body });

    await audit({
      userId: auth.user.id,
      action: "hotel.updated",
      entityType: "HOTEL",
      entityId: id,
      details: { changedFields: Object.keys(body) },
    });

    return NextResponse.json({ message: "Hotel updated", data: hotel });
  } catch (error) {
    return handleError(error);
  }
}

// Soft delete: the hotel is archived, not removed, so old enquiries still link to it
export async function DELETE(request: NextRequest, { params }: IdContext) {
  const { id } = await params;
  const auth = await requireUser(request);
  if (auth.error) {
    return auth.error;
  }

  try {
    if (!isCatalogueEditor(auth.user, Division.TRAVEL)) {
      throw new ApiError(403, "You cannot edit the Travel catalogue.");
    }
    await prisma.hotel.update({ where: { id: id }, data: { status: PublishStatus.ARCHIVED } });
    await audit({ userId: auth.user.id, action: "hotel.archived", entityType: "HOTEL", entityId: id });
    return NextResponse.json({ message: "Hotel archived" });
  } catch (error) {
    return handleError(error);
  }
}
