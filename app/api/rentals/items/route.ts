import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/app/generated/prisma/client";
import { Division, PublishStatus } from "@/app/generated/prisma/enums";
import { isCatalogueEditor } from "@/lib/catalogue";
import { RentalItemCreateRequestSchema } from "@/types/dto/rental";
import { getUser, requireUser } from "@/utils/authentication";
import { ApiError, handleError } from "@/utils/handleError";
import { audit } from "@/utils/audit";
import { enumParam, searchParam } from "@/utils/params";
import getPageInfo, { buildPagination } from "@/utils/pageInfoRetrivel";

// Rental items (Events division): website Rentals page + admin catalogue
// /api/rentals/items?category=Chairs&search=tent&status=DRAFT
// Visitors see published items; Events catalogue editors see every status.
export async function GET(request: NextRequest) {
  try {
    const params = getPageInfo(request);
    const user = await getUser(request);
    const isEditor = isCatalogueEditor(user, Division.EVENTS);
    const search = searchParam(request, "search");
    const category = searchParam(request, "category");

    const where: Prisma.RentalItemWhereInput = {
      status: isEditor ? enumParam(request, "status", PublishStatus) : PublishStatus.PUBLISHED,
      category: category ? { equals: category, mode: "insensitive" } : undefined,
      OR: search
        ? [
            { name: { contains: search, mode: "insensitive" } },
            { sku: { contains: search, mode: "insensitive" } },
            { category: { contains: search, mode: "insensitive" } },
          ]
        : undefined,
    };

    const [items, totalCount] = await Promise.all([
      prisma.rentalItem.findMany({
        where: where,
        skip: params.skip,
        take: params.take,
        orderBy: [{ featured: "desc" }, { category: "asc" }, { name: "asc" }],
      }),
      prisma.rentalItem.count({ where: where }),
    ]);

    return NextResponse.json({
      message: "Rental items fetched successfully",
      data: items,
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
    if (!isCatalogueEditor(auth.user, Division.EVENTS)) {
      throw new ApiError(403, "You cannot edit the Events catalogue.");
    }
    const body = RentalItemCreateRequestSchema.parse(await request.json());
    if (body.minQuantity > body.quantityOwned) {
      throw new ApiError(400, "minQuantity: The minimum cannot be more than the quantity you own");
    }

    const item = await prisma.rentalItem.create({ data: body });

    await audit({
      userId: auth.user.id,
      action: "rental_item.created",
      entityType: "RENTAL_ITEM",
      entityId: item.id,
    });

    return NextResponse.json(
      { message: "Rental item created successfully", data: item },
      { status: 201 },
    );
  } catch (error) {
    return handleError(error);
  }
}
