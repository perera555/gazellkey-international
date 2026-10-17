import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/app/generated/prisma/client";
import { Division, PublishStatus } from "@/app/generated/prisma/enums";
import { isCatalogueEditor } from "@/lib/catalogue";
import { ShopProductCreateRequestSchema } from "@/types/dto/shop";
import { getUser, requireUser } from "@/utils/authentication";
import { ApiError, handleError } from "@/utils/handleError";
import { audit } from "@/utils/audit";
import { enumParam, searchParam } from "@/utils/params";
import getPageInfo, { buildPagination } from "@/utils/pageInfoRetrivel";

// Retail shop products (admin: Catalogue > Shop products)
// /api/shop/products?category=Gifts&search=mug&status=DRAFT
// Visitors see published products; catalogue editors also see drafts and
// archived products of the divisions they work in.
export async function GET(request: NextRequest) {
  try {
    const params = getPageInfo(request);
    const user = await getUser(request);
    const search = searchParam(request, "search");
    const category = searchParam(request, "category");
    const editorDivisions = Object.values(Division).filter((division) =>
      isCatalogueEditor(user, division),
    );

    const where: Prisma.ShopProductWhereInput = {
      ...(editorDivisions.length > 0
        ? {
            status: enumParam(request, "status", PublishStatus),
            OR: [
              { status: PublishStatus.PUBLISHED },
              { division: { in: editorDivisions } },
            ],
          }
        : { status: PublishStatus.PUBLISHED }),
      category: category ? { equals: category, mode: "insensitive" } : undefined,
      AND: search
        ? [
            {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { sku: { contains: search, mode: "insensitive" } },
                { brand: { contains: search, mode: "insensitive" } },
                { category: { contains: search, mode: "insensitive" } },
              ],
            },
          ]
        : undefined,
    };

    const [products, totalCount] = await Promise.all([
      prisma.shopProduct.findMany({
        where: where,
        skip: params.skip,
        take: params.take,
        orderBy: { createdAt: "desc" },
      }),
      prisma.shopProduct.count({ where: where }),
    ]);

    return NextResponse.json({
      message: "Shop products fetched successfully",
      data: products,
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
    const body = ShopProductCreateRequestSchema.parse(await request.json());
    if (!isCatalogueEditor(auth.user, body.division)) {
      throw new ApiError(403, `You cannot edit the ${body.division} catalogue.`);
    }

    const product = await prisma.shopProduct.create({ data: body });

    await audit({
      userId: auth.user.id,
      action: "shop_product.created",
      entityType: "SHOP_PRODUCT",
      entityId: product.id,
    });

    return NextResponse.json(
      { message: "Product created successfully", data: product },
      { status: 201 },
    );
  } catch (error) {
    return handleError(error);
  }
}
