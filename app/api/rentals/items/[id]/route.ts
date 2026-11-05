import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { Division, EntityType, PublishStatus } from "@/app/generated/prisma/enums";
import { idOrKey, isCatalogueEditor } from "@/lib/catalogue";
import { RentalItemUpdateRequestSchema } from "@/types/dto/rental";
import { getUser, requireUser } from "@/utils/authentication";
import { ApiError, handleError, notFound } from "@/utils/handleError";
import { audit } from "@/utils/audit";
import { IdContext } from "@/utils/params";

// GET /api/rentals/items/{id or SKU}
export async function GET(request: NextRequest, { params }: IdContext) {
  const { id } = await params;
  const user = await getUser(request);

  const item = await prisma.rentalItem.findFirst({ where: idOrKey(id, "sku") });
  const isEditor = isCatalogueEditor(user, Division.EVENTS);
  if (item == null || (item.status != PublishStatus.PUBLISHED && !isEditor)) {
    return notFound("Rental item");
  }
  return NextResponse.json({ message: "Rental item fetched", data: item });
}

export async function PUT(request: NextRequest, { params }: IdContext) {
  const { id } = await params;
  const auth = await requireUser(request);
  if (auth.error) {
    return auth.error;
  }

  try {
    if (!isCatalogueEditor(auth.user, Division.EVENTS)) {
      throw new ApiError(403, "You cannot edit the Events catalogue.");
    }
    const body = RentalItemUpdateRequestSchema.parse(await request.json());
    const existing = await prisma.rentalItem.findUnique({ where: { id: id } });
    if (existing == null) {
      return notFound("Rental item");
    }
    if ((body.minQuantity ?? existing.minQuantity) > (body.quantityOwned ?? existing.quantityOwned)) {
      throw new ApiError(400, "minQuantity: The minimum cannot be more than the quantity you own");
    }

    const item = await prisma.rentalItem.update({ where: { id: id }, data: body });

    await audit({
      userId: auth.user.id,
      action: "rental_item.updated",
      entityType: EntityType.RENTAL_ITEM,
      entityId: id,
      details: { changedFields: Object.keys(body) },
    });
    return NextResponse.json({ message: "Rental item updated", data: item });
  } catch (error) {
    return handleError(error);
  }
}

// Soft delete: archived, so old bookings still show their items
export async function DELETE(request: NextRequest, { params }: IdContext) {
  const { id } = await params;
  const auth = await requireUser(request);
  if (auth.error) {
    return auth.error;
  }

  try {
    if (!isCatalogueEditor(auth.user, Division.EVENTS)) {
      throw new ApiError(403, "You cannot edit the Events catalogue.");
    }
    await prisma.rentalItem.update({ where: { id: id }, data: { status: PublishStatus.ARCHIVED } });
    await audit({
      userId: auth.user.id,
      action: "rental_item.archived",
      entityType: EntityType.RENTAL_ITEM,
      entityId: id,
    });
    return NextResponse.json({ message: "Rental item archived" });
  } catch (error) {
    return handleError(error);
  }
}
