import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { Division, PublishStatus } from "@/app/generated/prisma/enums";
import { idOrKey, isCatalogueEditor } from "@/lib/catalogue";
import { TourUpdateRequestSchema } from "@/types/dto/travel";
import { getUser, requireUser } from "@/utils/authentication";
import { ApiError, handleError, notFound } from "@/utils/handleError";
import { audit } from "@/utils/audit";
import { IdContext } from "@/utils/params";

// GET /api/travel/tours/{id or slug}
export async function GET(request: NextRequest, { params }: IdContext) {
  const { id } = await params;
  const user = await getUser(request);

  const tour = await prisma.tourPackage.findFirst({
    where: idOrKey(id, "slug"),
  });
  if (
    tour == null ||
    (tour.status != PublishStatus.PUBLISHED &&
      !isCatalogueEditor(user, Division.TRAVEL))
  ) {
    return notFound("Tour");
  }
  return NextResponse.json({ message: "Tour fetched", data: tour });
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
    const body = TourUpdateRequestSchema.parse(await request.json());

    const tour = await prisma.tourPackage.update({
      where: { id: id },
      data: body,
    });

    await audit({
      userId: auth.user.id,
      action: "tour.updated",
      entityType: "TOUR_PACKAGE",
      entityId: id,
      details: { changedFields: Object.keys(body) },
    });

    return NextResponse.json({ message: "Tour updated", data: tour });
  } catch (error) {
    return handleError(error);
  }
}

// Soft delete: the tour is archived, not removed, so old bookings still link to it
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
    await prisma.tourPackage.update({
      where: { id: id },
      data: { status: PublishStatus.ARCHIVED },
    });
    await audit({
      userId: auth.user.id,
      action: "tour.archived",
      entityType: "TOUR_PACKAGE",
      entityId: id,
    });
    return NextResponse.json({ message: "Tour archived" });
  } catch (error) {
    return handleError(error);
  }
}
