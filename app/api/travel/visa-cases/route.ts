import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/app/generated/prisma/client";
import { Division, VisaStage } from "@/app/generated/prisma/enums";
import { PRIVILEGES } from "@/lib/privileges";
import { assertTravelStaff } from "@/lib/catalogue";
import { resolveTravelCaseCustomer } from "@/lib/travel";
import { customerSummaryFields, staffNameFields } from "@/lib/selects";
import { VisaCaseCreateRequestSchema } from "@/types/dto/travel";
import { canAccessDivision, requirePrivilege } from "@/utils/authentication";
import { ApiError, handleError } from "@/utils/handleError";
import { divisionReference } from "@/utils/reference";
import { audit } from "@/utils/audit";
import { enumParam, searchParam } from "@/utils/params";
import getPageInfo, { buildPagination } from "@/utils/pageInfoRetrivel";

// /api/travel/visa-cases?stage=SUBMITTED&assignedTo=me&country=japan
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
    const country = searchParam(request, "country");

    const where: Prisma.VisaCaseWhereInput = {
      stage: enumParam(request, "stage", VisaStage),
      assignedToId: assignedTo == "me" ? auth.user.id : assignedTo,
      customerId: searchParam(request, "customerId"),
      destinationCountry: country
        ? { contains: country, mode: "insensitive" }
        : undefined,
    };

    const [cases, totalCount] = await Promise.all([
      prisma.visaCase.findMany({
        where: where,
        skip: params.skip,
        take: params.take,
        orderBy: { updatedAt: "desc" },
        include: {
          customer: { select: customerSummaryFields },
          assignedTo: { select: staffNameFields },
        },
      }),
      prisma.visaCase.count({ where: where }),
    ]);

    return NextResponse.json({
      message: "Visa cases fetched",
      data: cases,
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
    const body = VisaCaseCreateRequestSchema.parse(await request.json());
    const customerId = await resolveTravelCaseCustomer(
      body.enquiryId,
      body.customerId,
    );
    await assertTravelStaff(body.assignedToId);

    const visaCase = await prisma.visaCase.create({
      data: {
        reference: await divisionReference(Division.TRAVEL, "VISA"),
        enquiryId: body.enquiryId,
        customerId: customerId,
        destinationCountry: body.destinationCountry,
        visaType: body.visaType,
        applicants: body.applicants,
        checklist: body.checklist,
        assignedToId: body.assignedToId ?? auth.user.id,
        notes: body.notes,
      },
    });

    await audit({
      userId: auth.user.id,
      action: "visa_case.created",
      entityType: "VISA_CASE",
      entityId: visaCase.id,
    });

    return NextResponse.json(
      { message: "Visa case created", data: visaCase },
      { status: 201 },
    );
  } catch (error) {
    return handleError(error);
  }
}
