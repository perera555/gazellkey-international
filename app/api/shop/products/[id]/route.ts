import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { EntityType, PublishStatus } from "@/app/generated/prisma/enums";
import { getItemHistory, idOrKey, isCatalogueEditor } from "@/lib/catalogue";
import { activeSale } from "@/lib/shop-catalogue";
import { ShopProductUpdateRequestSchema } from "@/types/dto/shop";
import { getUser, requireUser } from "@/utils/authentication";
import { ApiError, handleError, notFound } from "@/utils/handleError";
import { audit } from "@/utils/audit";
import { IdContext } from "@/utils/params";

// GET /api/shop/products/{id or SKU}
export async function GET(request: NextRequest, { params }: IdContext) {
  const { id } = await params;
  const user = await getUser(request);

  const product = await prisma.shopProduct.findFirst({
    where: idOrKey(id, "sku"),
  });
  if (product == null) {
    return notFound("Product");
  }
  const isEditor = isCatalogueEditor(user, product.division);
  if (product.status != PublishStatus.PUBLISHED && !isEditor) {
    return notFound("Product");
  }

  return NextResponse.json({
    message: "Product fetched",
    data: {
      ...product,
      // what the website shows right now (the sale may have ended)
      sale: activeSale(product),
      history: isEditor
        ? await getItemHistory(EntityType.SHOP_PRODUCT, product.id)
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
    const body = ShopProductUpdateRequestSchema.parse(await request.json());

    const existing = await prisma.shopProduct.findUnique({ where: { id: id } });
    if (existing == null) {
      return notFound("Product");
    }

    // staff must be allowed in the current AND (if it changes) the new division
    const division = body.division ?? existing.division;
    if (
      !isCatalogueEditor(auth.user, existing.division) ||
      !isCatalogueEditor(auth.user, division)
    ) {
      throw new ApiError(403, `You cannot edit the ${division} catalogue.`);
    }
    const price = body.price ?? Number(existing.price);
    const compareAtPrice =
      body.compareAtPrice === undefined
        ? existing.compareAtPrice && Number(existing.compareAtPrice)
        : body.compareAtPrice;
    if (compareAtPrice != null && compareAtPrice <= price) {
      throw new ApiError(400, "compareAtPrice: The original price must be higher than the selling price");
    }

    const product = await prisma.shopProduct.update({
      where: { id: id },
      data: body,
    });

    await audit({
      userId: auth.user.id,
      action: "shop_product.updated",
      entityType: "SHOP_PRODUCT",
      entityId: id,
      details: { changedFields: Object.keys(body) },
    });

    return NextResponse.json({ message: "Product updated", data: product });
  } catch (error) {
    return handleError(error);
  }
}

// Soft delete: archived, not removed, so old orders still link to it
export async function DELETE(request: NextRequest, { params }: IdContext) {
  const { id } = await params;
  const auth = await requireUser(request);
  if (auth.error) {
    return auth.error;
  }

  try {
    const existing = await prisma.shopProduct.findUnique({ where: { id: id } });
    if (existing == null) {
      return notFound("Product");
    }
    if (!isCatalogueEditor(auth.user, existing.division)) {
      throw new ApiError(403, `You cannot edit the ${existing.division} catalogue.`);
    }
    await prisma.shopProduct.update({
      where: { id: id },
      data: { status: PublishStatus.ARCHIVED },
    });
    await audit({
      userId: auth.user.id,
      action: "shop_product.archived",
      entityType: "SHOP_PRODUCT",
      entityId: id,
    });
    return NextResponse.json({ message: "Product archived" });
  } catch (error) {
    return handleError(error);
  }
}
