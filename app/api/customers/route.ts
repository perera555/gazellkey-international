import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/app/generated/prisma/client";
import { PRIVILEGES } from "@/lib/privileges";
import { CustomerCreateRequestSchema } from "@/types/dto/customer";
import { requirePrivilege } from "@/utils/authentication";
import { handleError } from "@/utils/handleError";
import { nextReference } from "@/utils/reference";
import { audit } from "@/utils/audit";
import { enumParam, searchParam } from "@/utils/params";
import { RecordStatus } from "@/app/generated/prisma/enums";
import getPageInfo, { buildPagination } from "@/utils/pageInfoRetrivel";

// GET /api/customers?search=perera&status=INACTIVE
// Deleted (INACTIVE) customers are left out unless status=INACTIVE is asked for.
export async function GET(request: NextRequest) {
  const auth = await requirePrivilege(request, PRIVILEGES.CUSTOMERS_READ);
  if (auth.error) {
    return auth.error;
  }

  try {
    const params = getPageInfo(request);
    const search = searchParam(request, "search");

    const where: Prisma.CustomerWhereInput = {
      status: enumParam(request, "status", RecordStatus) ?? RecordStatus.ACTIVE,
      ...(search
      ? {
          OR: [
            { reference: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
            { firstName: { contains: search, mode: "insensitive" } },
            { lastName: { contains: search, mode: "insensitive" } },
            { companyName: { contains: search, mode: "insensitive" } },
            { phone: { contains: search } },
          ],
        }
      : {}),
    };

    const [customers, totalCount] = await Promise.all([
      prisma.customer.findMany({
        where: where,
        skip: params.skip,
        take: params.take,
        orderBy: { createdAt: "desc" },
        include: {
          _count: {
            select: { enquiries: true, quotations: true, orders: true },
          },
        },
      }),
      prisma.customer.count({ where: where }),
    ]);

    return NextResponse.json({
      message: "Customers fetched successfully",
      data: customers,
      pagination: buildPagination(params, totalCount),
    });
  } catch (error) {
    return handleError(error);
  }
}

// Staff add a customer by hand (walk-in, phone call ...)
export async function POST(request: NextRequest) {
  const auth = await requirePrivilege(request, PRIVILEGES.CUSTOMERS_EDIT);
  if (auth.error) {
    return auth.error;
  }

  try {
    const body = CustomerCreateRequestSchema.parse(await request.json());

    const customer = await prisma.customer.create({
      data: { ...body, reference: await nextReference("CUS") },
    });

    await audit({
      userId: auth.user.id,
      action: "customer.created",
      entityType: "CUSTOMER",
      entityId: customer.id,
    });

    return NextResponse.json(
      { message: "Customer created successfully", data: customer },
      { status: 201 },
    );
  } catch (error) {
    return handleError(error);
  }
}
