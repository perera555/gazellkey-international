import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/app/generated/prisma/client";
import { Division, InsuranceStatus } from "@/app/generated/prisma/enums";
import { PRIVILEGES } from "@/lib/privileges";
import { assertTravelStaff } from "@/lib/catalogue";
import { resolveTravelCaseCustomer } from "@/lib/travel";
import { customerSummaryFields, staffNameFields } from "@/lib/selects";
import { InsuranceCreateRequestSchema } from "@/types/dto/travel";
import { canAccessDivision, requirePrivilege } from "@/utils/authentication";
import { ApiError, handleError } from "@/utils/handleError";
import { divisionReference } from "@/utils/reference";
import { audit } from "@/utils/audit";
import { enumParam, searchParam } from "@/utils/params";
import getPageInfo, { buildPagination } from "@/utils/pageInfoRetrivel";

// Travel insurance requests (FR-TRV-07)
export async function GET(request: NextRequest) {
  const auth = await requirePrivilege(request, PRIVILEGES.TRAVEL_CASES);
  if (auth.error) {
    return auth.error;
  }

  try {
    if (!canAccessDivision(auth.user, Division.TRAVEL)) {
      throw new ApiError(403, "You do not work in Travel.");
    }
    const params = getPageInfo(request);
    const assignedTo = searchParam(request, "assignedTo");

    const where: Prisma.InsuranceRequestWhereInput = {
      status: enumParam(request, "status", InsuranceStatus),
      assignedToId: assignedTo == "me" ? auth.user.id : assignedTo,
      customerId: searchParam(request, "customerId"),
    };

    const [requests, totalCount] = await Promise.all([
      prisma.insuranceRequest.findMany({
        where: where,
        skip: params.skip,
        take: params.take,
        orderBy: { updatedAt: "desc" },
        include: {
          customer: { select: customerSummaryFields },
          assignedTo: { select: staffNameFields },
        },
      }),
      prisma.insuranceRequest.count({ where: where }),
    ]);

    return NextResponse.json({
      message: "Insurance requests fetched",
      data: requests,
      pagination: buildPagination(params, totalCount),
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: NextRequest) {
  const auth = await requirePrivilege(request, PRIVILEGES.TRAVEL_CASES);
  if (auth.error) {
    return auth.error;
  }

  try {
    if (!canAccessDivision(auth.user, Division.TRAVEL)) {
      throw new ApiError(403, "You do not work in Travel.");
    }
    const body = InsuranceCreateRequestSchema.parse(await request.json());
    const customerId = await resolveTravelCaseCustomer(
      body.enquiryId,
      body.customerId,
    );
    await assertTravelStaff(body.assignedToId);

    const insurance = await prisma.insuranceRequest.create({
      data: {
        reference: await divisionReference(Division.TRAVEL, "INS"),
        enquiryId: body.enquiryId,
        customerId: customerId,
        travellers: body.travellers,
        destination: body.destination,
        startDate: body.startDate,
        endDate: body.endDate,
        coverageType: body.coverageType,
        assignedToId: body.assignedToId ?? auth.user.id,
        notes: body.notes,
      },
    });

    await audit({
      userId: auth.user.id,
      action: "insurance_request.created",
      entityType: "INSURANCE_REQUEST",
      entityId: insurance.id,
    });

    return NextResponse.json(
      { message: "Insurance request created", data: insurance },
      { status: 201 },
    );
  } catch (error) {
    return handleError(error);
  }
}
