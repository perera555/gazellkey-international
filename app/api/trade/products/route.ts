import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/app/generated/prisma/client";
import {
  Division,
  PublishStatus,
  TradeCategory,
  TradeDirection,
} from "@/app/generated/prisma/enums";
import { assertSupplierExists, isCatalogueEditor } from "@/lib/catalogue";
import { divisionOf } from "@/lib/trade";
import { TradeProductCreateRequestSchema } from "@/types/dto/catalogue";
import { getUser, requireUser } from "@/utils/authentication";
import { ApiError, handleError } from "@/utils/handleError";
import { hideSupplierCost } from "@/utils/restricted";
import { audit } from "@/utils/audit";
import { enumParam, searchParam } from "@/utils/params";
import getPageInfo, { buildPagination } from "@/utils/pageInfoRetrivel";

// Public catalogue (FR-IMP-01, FR-EXP-01)
// /api/trade/products?direction=EXPORT&category=TEA&search=ceylon
export async function GET(request: NextRequest) {
  try {
    const params = getPageInfo(request);
    const user = await getUser(request);
    const direction = enumParam(request, "direction", TradeDirection);
    const search = searchParam(request, "search");

    // editors see drafts of the division(s) they work in
    const isEditor = direction
      ? isCatalogueEditor(user, divisionOf(direction))
      : isCatalogueEditor(user, Division.IMPORT) &&
        isCatalogueEditor(user, Division.EXPORT);

    const where: Prisma.TradeProductWhereInput = {
      direction: direction,
      status: isEditor
        ? enumParam(request, "status", PublishStatus)
        : PublishStatus.PUBLISHED,
      category: enumParam(request, "category", TradeCategory),
      OR: search
        ? [
            { name: { contains: search, mode: "insensitive" } },
            { sku: { contains: search, mode: "insensitive" } },
            { origin: { contains: search, mode: "insensitive" } },
          ]
        : undefined,
    };

    const [products, totalCount] = await Promise.all([
      prisma.tradeProduct.findMany({
        where: where,
        skip: params.skip,
        take: params.take,
        orderBy: { createdAt: "desc" },
      }),
      prisma.tradeProduct.count({ where: where }),
    ]);

    return NextResponse.json({
      message: "Products fetched successfully",
      data: products.map((product) => hideSupplierCost(product, user)),
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
    const body = TradeProductCreateRequestSchema.parse(await request.json());
    if (!isCatalogueEditor(auth.user, divisionOf(body.direction))) {
      throw new ApiError(403, `You cannot edit the ${body.direction} catalogue.`);
    }
    await assertSupplierExists(body.supplierId);

    const product = await prisma.tradeProduct.create({ data: body });

    await audit({
      userId: auth.user.id,
      action: "trade_product.created",
      entityType: "TRADE_PRODUCT",
      entityId: product.id,
    });

    return NextResponse.json(
      { message: "Product created successfully", data: hideSupplierCost(product, auth.user) },
      { status: 201 },
    );
  } catch (error) {
    return handleError(error);
  }
}
