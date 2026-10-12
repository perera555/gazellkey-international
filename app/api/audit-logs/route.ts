import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/app/generated/prisma/client";
import { PRIVILEGES } from "@/lib/privileges";
import { staffNameFields } from "@/lib/selects";
import { requirePrivilege } from "@/utils/authentication";
import { handleError } from "@/utils/handleError";
import { dateRangeFilter, searchParam } from "@/utils/params";
import getPageInfo, { buildPagination } from "@/utils/pageInfoRetrivel";

// /api/audit-logs?entityType=PAYMENT&entityId=...&userId=...&action=payment.refunded
export async function GET(request: NextRequest) {
  const auth = await requirePrivilege(request, PRIVILEGES.AUDIT_READ);
  if (auth.error) {
    return auth.error;
  }

  try {
    const params = getPageInfo(request);

    const where: Prisma.AuditLogWhereInput = {
      entityType: searchParam(request, "entityType"),
      entityId: searchParam(request, "entityId"),
      userId: searchParam(request, "userId"),
      action: searchParam(request, "action"),
      createdAt: dateRangeFilter(request),
    };

    const [logs, totalCount] = await Promise.all([
      prisma.auditLog.findMany({
        where: where,
        skip: params.skip,
        take: params.take,
        orderBy: { createdAt: "desc" },
        include: { user: { select: staffNameFields } },
      }),
      prisma.auditLog.count({ where: where }),
    ]);

    return NextResponse.json({
      message: "Audit log fetched",
      data: logs,
      pagination: buildPagination(params, totalCount),
    });
  } catch (error) {
    return handleError(error);
  }
}
