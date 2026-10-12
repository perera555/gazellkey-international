import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/app/generated/prisma/client";
import { Division, OrderStatus } from "@/app/generated/prisma/enums";
import { PRIVILEGES } from "@/lib/privileges";
import { customerSummaryFields } from "@/lib/selects";
import { divisionWhere, requirePrivilege } from "@/utils/authentication";
import { handleError } from "@/utils/handleError";
import { dateRangeFilter, enumParam, searchParam } from "@/utils/params";
import getPageInfo, { buildPagination } from "@/utils/pageInfoRetrivel";

// Bookings and orders are created only by accepting a quotation
// (POST /api/quotations/[id]/respond) or by a paid event registration.
// /api/orders?division=EXPORT&status=CONFIRMED&customerId=...
export async function GET(request: NextRequest) {
  const auth = await requirePrivilege(request, PRIVILEGES.ORDERS_READ);
  if (auth.error) {
    return auth.error;
  }

  try {
    const params = getPageInfo(request);
    const search = searchParam(request, "search");

    const where: Prisma.OrderWhereInput = {
      AND: [
        divisionWhere(auth.user),
        {
          division: enumParam(request, "division", Division),
          status: enumParam(request, "status", OrderStatus),
          customerId: searchParam(request, "customerId"),
          createdAt: dateRangeFilter(request),
        },
        search
          ? { reference: { contains: search, mode: "insensitive" } }
          : {},
      ],
    };

    const [orders, totalCount] = await Promise.all([
      prisma.order.findMany({
        where: where,
        skip: params.skip,
        take: params.take,
        orderBy: { createdAt: "desc" },
        include: {
          customer: { select: customerSummaryFields },
          quotation: { select: { id: true, reference: true } },
        },
      }),
      prisma.order.count({ where: where }),
    ]);

    return NextResponse.json({
      message: "Orders fetched successfully",
      data: orders,
      pagination: buildPagination(params, totalCount),
    });
  } catch (error) {
    return handleError(error);
  }
}
