import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/app/generated/prisma/client";
import { Division, RecordStatus } from "@/app/generated/prisma/enums";
import { PRIVILEGES } from "@/lib/privileges";
import { SupplierCreateRequestSchema } from "@/types/dto/trade";
import {
  divisionScope,
  requirePrivilege,
} from "@/utils/authentication";
import { handleError } from "@/utils/handleError";
import { nextReference } from "@/utils/reference";
import { audit } from "@/utils/audit";
import { enumParam, searchParam } from "@/utils/params";
import getPageInfo, { buildPagination } from "@/utils/pageInfoRetrivel";

// Supplier records are restricted to authorised staff (SRS Section 8)
// /api/suppliers?division=IMPORT&status=ACTIVE&search=shenzhen
export async function GET(request: NextRequest) {
  const auth = await requirePrivilege(request, PRIVILEGES.SUPPLIERS_READ);
  if (auth.error) {
    return auth.error;
  }

  try {
    const params = getPageInfo(request);
    const scope = divisionScope(auth.user);
    const division = enumParam(request, "division", Division);
    const search = searchParam(request, "search");

    const where: Prisma.SupplierWhereInput = {
      AND: [
        scope ? { divisions: { hasSome: scope } } : {},
        division ? { divisions: { has: division } } : {},
        { status: enumParam(request, "status", RecordStatus) },
        search
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { reference: { contains: search, mode: "insensitive" } },
                { country: { contains: search, mode: "insensitive" } },
              ],
            }
          : {},
      ],
    };

    const [suppliers, totalCount] = await Promise.all([
      prisma.supplier.findMany({
        where: where,
        skip: params.skip,
        take: params.take,
        orderBy: { name: "asc" },
      }),
      prisma.supplier.count({ where: where }),
    ]);

    return NextResponse.json({
      message: "Suppliers fetched successfully",
      data: suppliers,
      pagination: buildPagination(params, totalCount),
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: NextRequest) {
  const auth = await requirePrivilege(request, PRIVILEGES.SUPPLIERS_EDIT);
  if (auth.error) {
    return auth.error;
  }

  try {
    const body = SupplierCreateRequestSchema.parse(await request.json());

    const supplier = await prisma.supplier.create({
      data: { ...body, reference: await nextReference("SUP") },
    });

    await audit({
      userId: auth.user.id,
      action: "supplier.created",
      entityType: "SUPPLIER",
      entityId: supplier.id,
    });

    return NextResponse.json(
      { message: "Supplier created successfully", data: supplier },
      { status: 201 },
    );
  } catch (error) {
    return handleError(error);
  }
}
