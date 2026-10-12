import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/app/generated/prisma/client";
import {
  Availability,
  Division,
  GemItemType,
  PublishStatus,
} from "@/app/generated/prisma/enums";
import { assertSupplierExists, isCatalogueEditor } from "@/lib/catalogue";
import { GemCreateRequestSchema } from "@/types/dto/catalogue";
import { getUser, requireUser } from "@/utils/authentication";
import { ApiError, handleError } from "@/utils/handleError";
import { hideSupplierCost } from "@/utils/restricted";
import { audit } from "@/utils/audit";
import { enumParam, searchParam } from "@/utils/params";
import getPageInfo, { buildPagination } from "@/utils/pageInfoRetrivel";

// Public gem & jewellery catalogue (FR-GEM-01)
// /api/gems?itemType=GEMSTONE&category=sapphire&availability=AVAILABLE&search=blue
export async function GET(request: NextRequest) {
  try {
    const params = getPageInfo(request);
    const user = await getUser(request);
    const isEditor = isCatalogueEditor(user, Division.GEMS);
    const search = searchParam(request, "search");
    const category = searchParam(request, "category");

    const where: Prisma.GemItemWhereInput = {
      status: isEditor
        ? enumParam(request, "status", PublishStatus)
        : PublishStatus.PUBLISHED,
      itemType: enumParam(request, "itemType", GemItemType),
      availability: enumParam(request, "availability", Availability),
      category: category ? { equals: category, mode: "insensitive" } : undefined,
      OR: search
        ? [
            { name: { contains: search, mode: "insensitive" } },
            { sku: { contains: search, mode: "insensitive" } },
            { colour: { contains: search, mode: "insensitive" } },
            { origin: { contains: search, mode: "insensitive" } },
          ]
        : undefined,
    };

    const [items, totalCount] = await Promise.all([
      prisma.gemItem.findMany({
        where: where,
        skip: params.skip,
        take: params.take,
        orderBy: { createdAt: "desc" },
      }),
      prisma.gemItem.count({ where: where }),
    ]);

    return NextResponse.json({
      message: "Gems fetched successfully",
      data: items.map((item) => hideSupplierCost(item, user)),
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
    if (!isCatalogueEditor(auth.user, Division.GEMS)) {
      throw new ApiError(403, "You cannot edit the Gems & Jewellery catalogue.");
    }
    const body = GemCreateRequestSchema.parse(await request.json());
    await assertSupplierExists(body.supplierId);

    const item = await prisma.gemItem.create({ data: body });

    await audit({
      userId: auth.user.id,
      action: "gem_item.created",
      entityType: "GEM_ITEM",
      entityId: item.id,
    });

    return NextResponse.json(
      { message: "Item created successfully", data: hideSupplierCost(item, auth.user) },
      { status: 201 },
    );
  } catch (error) {
    return handleError(error);
  }
}
