import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/app/generated/prisma/client";
import { Division, DocumentApproval, DocumentType } from "@/app/generated/prisma/enums";
import { PRIVILEGES } from "@/lib/privileges";
import { customerSummaryFields, staffNameFields } from "@/lib/selects";
import { divisionScope, requirePrivilege } from "@/utils/authentication";
import { handleError } from "@/utils/handleError";
import { enumParam, searchParam } from "@/utils/params";
import getPageInfo, { buildPagination } from "@/utils/pageInfoRetrivel";

// Documents that need (or needed) an admin's approval, newest first.
// /api/documents/approvals?approval=PENDING&type=PASSPORT&division=TRAVEL&search=perera
// Without "approval", every document that went through approval is listed.
export async function GET(request: NextRequest) {
  const auth = await requirePrivilege(request, PRIVILEGES.DOCUMENTS_APPROVE);
  if (auth.error) {
    return auth.error;
  }

  try {
    const params = getPageInfo(request);
    const search = searchParam(request, "search");
    const scope = divisionScope(auth.user);
    const division = enumParam(request, "division", Division);

    const where: Prisma.DocumentWhereInput = {
      approval: enumParam(request, "approval", DocumentApproval) ?? { not: DocumentApproval.NOT_REQUIRED },
      type: enumParam(request, "type", DocumentType),
      division: division ?? (scope ? { in: scope } : undefined),
      OR: search
        ? [
            { title: { contains: search, mode: "insensitive" } },
            { fileName: { contains: search, mode: "insensitive" } },
            { customer: { email: { contains: search, mode: "insensitive" } } },
            { customer: { firstName: { contains: search, mode: "insensitive" } } },
            { customer: { lastName: { contains: search, mode: "insensitive" } } },
            { customer: { reference: { contains: search, mode: "insensitive" } } },
          ]
        : undefined,
    };

    const [documents, totalCount] = await Promise.all([
      prisma.document.findMany({
        where: where,
        skip: params.skip,
        take: params.take,
        orderBy: { createdAt: "desc" },
        omit: { storageKey: true },
        include: {
          customer: { select: customerSummaryFields },
          uploadedBy: { select: staffNameFields },
          reviewedBy: { select: staffNameFields },
        },
      }),
      prisma.document.count({ where: where }),
    ]);

    return NextResponse.json({
      message: "Documents fetched",
      data: documents,
      pagination: buildPagination(params, totalCount),
    });
  } catch (error) {
    return handleError(error);
  }
}
