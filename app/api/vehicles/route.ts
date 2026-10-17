import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/app/generated/prisma/client";
import {
  Availability,
  Division,
  PublishStatus,
  VehicleListingType,
} from "@/app/generated/prisma/enums";
import { assertSupplierExists, isCatalogueEditor } from "@/lib/catalogue";
import { VehicleCreateRequestSchema } from "@/types/dto/catalogue";
import { getUser, requireUser } from "@/utils/authentication";
import { ApiError, handleError } from "@/utils/handleError";
import { hideSupplierCost } from "@/utils/restricted";
import { audit } from "@/utils/audit";
import { enumParam, searchParam } from "@/utils/params";
import getPageInfo, { buildPagination } from "@/utils/pageInfoRetrivel";

// Public listings (FR-VEH-01, FR-VEH-02)
// /api/vehicles?listingType=USED_VEHICLE&make=toyota&model=aqua&yearFrom=2018&yearTo=2024
//   kind=vehicles      everything except spare parts; kind=parts = spare parts only
//   fits=Toyota Aqua   spare parts whose "compatible with" list names this model
//                      (or whose own make + model is this model)
export async function GET(request: NextRequest) {
  try {
    const params = getPageInfo(request);
    const user = await getUser(request);
    const isEditor = isCatalogueEditor(user, Division.VEHICLES);
    const search = searchParam(request, "search");
    const make = searchParam(request, "make");
    const model = searchParam(request, "model");
    const fits = searchParam(request, "fits");
    const kind = searchParam(request, "kind");
    const yearFrom = parseInt(searchParam(request, "yearFrom") ?? "", 10);
    const yearTo = parseInt(searchParam(request, "yearTo") ?? "", 10);

    const listingType =
      enumParam(request, "listingType", VehicleListingType) ??
      (kind == "parts"
        ? VehicleListingType.SPARE_PART
        : kind == "vehicles"
          ? { not: VehicleListingType.SPARE_PART }
          : undefined);

    const fitsWhere: Prisma.VehicleListingWhereInput[] = [];
    if (fits) {
      const [fitsMake, ...rest] = fits.split(" ");
      fitsWhere.push({
        OR: [
          { compatibleWith: { has: fits } },
          {
            make: { equals: fitsMake, mode: "insensitive" },
            model: { equals: rest.join(" "), mode: "insensitive" },
          },
        ],
      });
    }

    const where: Prisma.VehicleListingWhereInput = {
      status: isEditor
        ? enumParam(request, "status", PublishStatus)
        : PublishStatus.PUBLISHED,
      listingType: listingType,
      availability: enumParam(request, "availability", Availability),
      make: make ? { equals: make, mode: "insensitive" } : undefined,
      model: model ? { equals: model, mode: "insensitive" } : undefined,
      AND: fitsWhere.length > 0 ? fitsWhere : undefined,
      year: {
        gte: Number.isNaN(yearFrom) ? undefined : yearFrom,
        lte: Number.isNaN(yearTo) ? undefined : yearTo,
      },
      OR: search
        ? [
            { title: { contains: search, mode: "insensitive" } },
            { model: { contains: search, mode: "insensitive" } },
            { partNumber: { contains: search, mode: "insensitive" } },
            { sku: { contains: search, mode: "insensitive" } },
          ]
        : undefined,
    };

    const [listings, totalCount] = await Promise.all([
      prisma.vehicleListing.findMany({
        where: where,
        skip: params.skip,
        take: params.take,
        orderBy: { createdAt: "desc" },
      }),
      prisma.vehicleListing.count({ where: where }),
    ]);

    return NextResponse.json({
      message: "Listings fetched successfully",
      data: listings.map((listing) => hideSupplierCost(listing, user)),
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
    if (!isCatalogueEditor(auth.user, Division.VEHICLES)) {
      throw new ApiError(403, "You cannot edit the Vehicles & Machinery catalogue.");
    }
    const body = VehicleCreateRequestSchema.parse(await request.json());
    await assertSupplierExists(body.supplierId);

    const listing = await prisma.vehicleListing.create({ data: body });

    await audit({
      userId: auth.user.id,
      action: "vehicle_listing.created",
      entityType: "VEHICLE_LISTING",
      entityId: listing.id,
    });

    return NextResponse.json(
      { message: "Listing created successfully", data: hideSupplierCost(listing, auth.user) },
      { status: 201 },
    );
  } catch (error) {
    return handleError(error);
  }
}
