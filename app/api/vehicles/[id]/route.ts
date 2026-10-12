import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import {
  Division,
  EntityType,
  PublishStatus,
} from "@/app/generated/prisma/enums";
import {
  assertSupplierExists,
  getItemHistory,
  idOrKey,
  isCatalogueEditor,
} from "@/lib/catalogue";
import { VehicleUpdateRequestSchema } from "@/types/dto/catalogue";
import { getUser, requireUser } from "@/utils/authentication";
import { ApiError, handleError, notFound } from "@/utils/handleError";
import { hideSupplierCost } from "@/utils/restricted";
import { audit } from "@/utils/audit";
import { IdContext } from "@/utils/params";

// GET /api/vehicles/{id or SKU}. Staff also get the sales history (FR-VEH-06).
export async function GET(request: NextRequest, { params }: IdContext) {
  const { id } = await params;
  const user = await getUser(request);
  const isEditor = isCatalogueEditor(user, Division.VEHICLES);

  const listing = await prisma.vehicleListing.findFirst({
    where: idOrKey(id, "sku"),
    include: { supplier: true },
  });
  if (listing == null || (listing.status != PublishStatus.PUBLISHED && !isEditor)) {
    return notFound("Listing");
  }

  return NextResponse.json({
    message: "Listing fetched",
    data: {
      ...hideSupplierCost(listing, user),
      history: isEditor
        ? await getItemHistory(EntityType.VEHICLE_LISTING, listing.id)
        : undefined,
    },
  });
}

export async function PUT(request: NextRequest, { params }: IdContext) {
  const { id } = await params;
  const auth = await requireUser(request);
  if (auth.error) {
    return auth.error;
  }

  try {
    if (!isCatalogueEditor(auth.user, Division.VEHICLES)) {
      throw new ApiError(403, "You cannot edit the Vehicles & Machinery catalogue.");
    }
    const body = VehicleUpdateRequestSchema.parse(await request.json());
    await assertSupplierExists(body.supplierId);

    const listing = await prisma.vehicleListing.update({
      where: { id: id },
      data: body,
    });

    await audit({
      userId: auth.user.id,
      action: "vehicle_listing.updated",
      entityType: "VEHICLE_LISTING",
      entityId: id,
      details: { changedFields: Object.keys(body) },
    });

    return NextResponse.json({
      message: "Listing updated",
      data: hideSupplierCost(listing, auth.user),
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: IdContext) {
  const { id } = await params;
  const auth = await requireUser(request);
  if (auth.error) {
    return auth.error;
  }

  try {
    if (!isCatalogueEditor(auth.user, Division.VEHICLES)) {
      throw new ApiError(403, "You cannot edit the Vehicles & Machinery catalogue.");
    }
    await prisma.vehicleListing.update({
      where: { id: id },
      data: { status: PublishStatus.ARCHIVED },
    });
    await audit({
      userId: auth.user.id,
      action: "vehicle_listing.archived",
      entityType: "VEHICLE_LISTING",
      entityId: id,
    });
    return NextResponse.json({ message: "Listing archived" });
  } catch (error) {
    return handleError(error);
  }
}
