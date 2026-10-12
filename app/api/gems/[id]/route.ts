import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import {
  DocumentAccess,
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
import { GemUpdateRequestSchema } from "@/types/dto/catalogue";
import { getUser, requireUser } from "@/utils/authentication";
import { ApiError, handleError, notFound } from "@/utils/handleError";
import { hideSupplierCost } from "@/utils/restricted";
import { audit } from "@/utils/audit";
import { IdContext } from "@/utils/params";

// GET /api/gems/{id or SKU}. Public certificates are included (FR-GEM-03);
// staff also get the enquiry / quotation / order history (FR-GEM-06).
export async function GET(request: NextRequest, { params }: IdContext) {
  const { id } = await params;
  const user = await getUser(request);
  const isEditor = isCatalogueEditor(user, Division.GEMS);

  const item = await prisma.gemItem.findFirst({
    where: idOrKey(id, "sku"),
    include: { supplier: true },
  });
  if (item == null || (item.status != PublishStatus.PUBLISHED && !isEditor)) {
    return notFound("Item");
  }

  const certificates = await prisma.document.findMany({
    where: {
      entityType: EntityType.GEM_ITEM,
      entityId: item.id,
      accessLevel: isEditor ? undefined : DocumentAccess.PUBLIC,
    },
    omit: { storageKey: true },
  });

  return NextResponse.json({
    message: "Item fetched",
    data: {
      ...hideSupplierCost(item, user),
      certificates: certificates,
      history: isEditor
        ? await getItemHistory(EntityType.GEM_ITEM, item.id)
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
    if (!isCatalogueEditor(auth.user, Division.GEMS)) {
      throw new ApiError(403, "You cannot edit the Gems & Jewellery catalogue.");
    }
    const body = GemUpdateRequestSchema.parse(await request.json());
    await assertSupplierExists(body.supplierId);

    const item = await prisma.gemItem.update({ where: { id: id }, data: body });

    await audit({
      userId: auth.user.id,
      action: "gem_item.updated",
      entityType: "GEM_ITEM",
      entityId: id,
      details: { changedFields: Object.keys(body) },
    });

    return NextResponse.json({
      message: "Item updated",
      data: hideSupplierCost(item, auth.user),
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
    if (!isCatalogueEditor(auth.user, Division.GEMS)) {
      throw new ApiError(403, "You cannot edit the Gems & Jewellery catalogue.");
    }
    await prisma.gemItem.update({
      where: { id: id },
      data: { status: PublishStatus.ARCHIVED },
    });
    await audit({
      userId: auth.user.id,
      action: "gem_item.archived",
      entityType: "GEM_ITEM",
      entityId: id,
    });
    return NextResponse.json({ message: "Item archived" });
  } catch (error) {
    return handleError(error);
  }
}
