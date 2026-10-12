import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/app/generated/prisma/client";
import {
  Division,
  EnquiryStatus,
  QuotationStatus,
} from "@/app/generated/prisma/enums";
import { PRIVILEGES } from "@/lib/privileges";
import { customerSummaryFields } from "@/lib/selects";
import { QuotationCreateRequestSchema } from "@/types/dto/quotation";
import {
  canAccessDivision,
  divisionWhere,
  requirePrivilege,
} from "@/utils/authentication";
import { ApiError, handleError } from "@/utils/handleError";
import { divisionReference } from "@/utils/reference";
import { calculateTotals } from "@/utils/money";
import { audit } from "@/utils/audit";
import { dateRangeFilter, enumParam, searchParam } from "@/utils/params";
import getPageInfo, { buildPagination } from "@/utils/pageInfoRetrivel";

// /api/quotations?status=SENT&division=GEMS&customerId=...&enquiryId=...
export async function GET(request: NextRequest) {
  const auth = await requirePrivilege(request, PRIVILEGES.QUOTATIONS_READ);
  if (auth.error) {
    return auth.error;
  }

  try {
    const params = getPageInfo(request);

    const where: Prisma.QuotationWhereInput = {
      AND: [
        divisionWhere(auth.user),
        {
          division: enumParam(request, "division", Division),
          status: enumParam(request, "status", QuotationStatus),
          customerId: searchParam(request, "customerId"),
          enquiryId: searchParam(request, "enquiryId"),
          createdAt: dateRangeFilter(request),
        },
      ],
    };

    const [quotations, totalCount] = await Promise.all([
      prisma.quotation.findMany({
        where: where,
        skip: params.skip,
        take: params.take,
        orderBy: { createdAt: "desc" },
        include: { customer: { select: customerSummaryFields } },
      }),
      prisma.quotation.count({ where: where }),
    ]);

    return NextResponse.json({
      message: "Quotations fetched successfully",
      data: quotations,
      pagination: buildPagination(params, totalCount),
    });
  } catch (error) {
    return handleError(error);
  }
}

// Staff prepare a quotation (workflow step 4). It starts as DRAFT.
export async function POST(request: NextRequest) {
  const auth = await requirePrivilege(request, PRIVILEGES.QUOTATIONS_EDIT);
  if (auth.error) {
    return auth.error;
  }

  try {
    const body = QuotationCreateRequestSchema.parse(await request.json());

    // customer and division come from the enquiry when one is given
    let customerId = body.customerId;
    let division = body.division;
    if (body.enquiryId) {
      const enquiry = await prisma.enquiry.findUnique({
        where: { id: body.enquiryId },
      });
      if (enquiry == null) {
        throw new ApiError(404, "Enquiry not found.");
      }
      if (
        enquiry.status == EnquiryStatus.CANCELLED ||
        enquiry.status == EnquiryStatus.CLOSED_LOST
      ) {
        throw new ApiError(409, "This enquiry is closed.");
      }
      customerId = enquiry.customerId;
      division = enquiry.division;
    }

    if (!canAccessDivision(auth.user, division!)) {
      throw new ApiError(403, "You do not work in this division.");
    }

    const totals = calculateTotals(body.items, body.discount, body.tax);

    const quotation = await prisma.$transaction(async (tx) => {
      const created = await tx.quotation.create({
        data: {
          reference: await divisionReference(division!, "QUO", tx),
          division: division!,
          enquiryId: body.enquiryId,
          customerId: customerId!,
          currency: body.currency,
          validUntil: body.validUntil,
          terms: body.terms,
          shippingTerms: body.shippingTerms,
          notes: body.notes,
          discount: body.discount,
          tax: body.tax,
          subtotal: totals.subtotal,
          total: totals.total,
          createdById: auth.user.id,
          items: {
            create: totals.lines.map((line, index) => ({
              ...line,
              sortOrder: index,
            })),
          },
        },
        include: { items: { orderBy: { sortOrder: "asc" } } },
      });

      if (body.enquiryId) {
        await tx.enquiry.updateMany({
          where: {
            id: body.enquiryId,
            status: { in: [EnquiryStatus.NEW, EnquiryStatus.ASSIGNED] },
          },
          data: { status: EnquiryStatus.IN_PROGRESS },
        });
      }
      return created;
    });

    await audit({
      userId: auth.user.id,
      action: "quotation.created",
      entityType: "QUOTATION",
      entityId: quotation.id,
      details: { total: totals.total, currency: body.currency },
    });

    return NextResponse.json(
      { message: "Quotation created successfully", data: quotation },
      { status: 201 },
    );
  } catch (error) {
    return handleError(error);
  }
}
