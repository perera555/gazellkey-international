import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { EntityType, PublishStatus } from "@/app/generated/prisma/enums";
import {
  assertSupplierExists,
  getItemHistory,
  idOrKey,
  isCatalogueEditor,
} from "@/lib/catalogue";
import {
  categoryMatchesDirection,
  TradeProductUpdateRequestSchema,
} from "@/types/dto/catalogue";
import { getUser, requireUser } from "@/utils/authentication";
import { ApiError, handleError, notFound } from "@/utils/handleError";
import { hideSupplierCost } from "@/utils/restricted";
import { audit } from "@/utils/audit";
import { IdContext } from "@/utils/params";
import { divisionOf } from "@/lib/trade";

// GET /api/trade/products/{id or SKU}
export async function GET(request: NextRequest, { params }: IdContext) {
  const { id } = await params;
  const user = await getUser(request);

  const product = await prisma.tradeProduct.findFirst({
    where: idOrKey(id, "sku"),
    include: { supplier: true },
  });
  if (product == null) {
    return notFound("Product");
  }
  const isEditor = isCatalogueEditor(user, divisionOf(product.direction));
  if (product.status != PublishStatus.PUBLISHED && !isEditor) {
    return notFound("Product");
  }

  return NextResponse.json({
    message: "Product fetched",
    data: {
      ...hideSupplierCost(product, user),
      history: isEditor
        ? await getItemHistory(EntityType.TRADE_PRODUCT, product.id)
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
    const body = TradeProductUpdateRequestSchema.parse(await request.json());

    const existing = await prisma.tradeProduct.findUnique({ where: { id: id } });
    if (existing == null) {
      return notFound("Product");
    }

    // staff must be allowed in the current AND (if it changes) the new division
    const direction = body.direction ?? existing.direction;
    if (
      !isCatalogueEditor(auth.user, divisionOf(existing.direction)) ||
      !isCatalogueEditor(auth.user, divisionOf(direction))
    ) {
      throw new ApiError(403, `You cannot edit the ${direction} catalogue.`);
    }
    if (!categoryMatchesDirection(direction, body.category ?? existing.category)) {
      throw new ApiError(400, "This category does not belong to the selected direction.");
    }
    await assertSupplierExists(body.supplierId);

    const product = await prisma.tradeProduct.update({
      where: { id: id },
      data: body,
    });

    await audit({
      userId: auth.user.id,
      action: "trade_product.updated",
      entityType: "TRADE_PRODUCT",
      entityId: id,
      details: { changedFields: Object.keys(body) },
    });

    return NextResponse.json({
      message: "Product updated",
      data: hideSupplierCost(product, auth.user),
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
    const existing = await prisma.tradeProduct.findUnique({ where: { id: id } });
    if (existing == null) {
      return notFound("Product");
    }
    if (!isCatalogueEditor(auth.user, divisionOf(existing.direction))) {
      throw new ApiError(403, `You cannot edit the ${existing.direction} catalogue.`);
    }
    await prisma.tradeProduct.update({
      where: { id: id },
      data: { status: PublishStatus.ARCHIVED },
    });
    await audit({
      userId: auth.user.id,
      action: "trade_product.archived",
      entityType: "TRADE_PRODUCT",
      entityId: id,
    });
    return NextResponse.json({ message: "Product archived" });
  } catch (error) {
    return handleError(error);
  }
}
