import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import {
  Division,
  EntityType,
  InsuranceStatus,
} from "@/app/generated/prisma/enums";
import { PRIVILEGES } from "@/lib/privileges";
import { canViewOwnedRecord } from "@/lib/access";
import { assertTravelStaff } from "@/lib/catalogue";
import { notifyCustomer } from "@/lib/notifications";
import { customerSummaryFields, staffNameFields } from "@/lib/selects";
import { InsuranceUpdateRequestSchema } from "@/types/dto/travel";
import {
  canAccessDivision,
  hasPrivilege,
  requirePrivilege,
  requireUser,
} from "@/utils/authentication";
import { ApiError, handleError, notFound } from "@/utils/handleError";
import { audit } from "@/utils/audit";
import { IdContext } from "@/utils/params";

export async function GET(request: NextRequest, { params }: IdContext) {
  const { id } = await params;
  const auth = await requireUser(request);
  if (auth.error) {
    return auth.error;
  }

  const insurance = await prisma.insuranceRequest.findUnique({
    where: { id: id },
    include: {
      customer: { select: customerSummaryFields },
      assignedTo: { select: staffNameFields },
    },
  });
  if (
    insurance == null ||
    !(await canViewOwnedRecord(
      auth.user,
      { customerId: insurance.customerId, division: Division.TRAVEL },
      PRIVILEGES.TRAVEL_CASES,
    ))
  ) {
    return notFound("Insurance request");
  }

  if (!hasPrivilege(auth.user, PRIVILEGES.TRAVEL_CASES)) {
    const { notes, ...customerView } = insurance;
    return NextResponse.json({ message: "Insurance fetched", data: customerView });
  }
  return NextResponse.json({ message: "Insurance fetched", data: insurance });
}

export async function PUT(request: NextRequest, { params }: IdContext) {
  const { id } = await params;
  const auth = await requirePrivilege(request, PRIVILEGES.TRAVEL_CASES);
  if (auth.error) {
    return auth.error;
  }

  try {
    if (!canAccessDivision(auth.user, Division.TRAVEL)) {
      throw new ApiError(403, "You do not work in Travel.");
    }
    const body = InsuranceUpdateRequestSchema.parse(await request.json());
    await assertTravelStaff(body.assignedToId);

    const existing = await prisma.insuranceRequest.findUnique({
      where: { id: id },
    });
    if (existing == null) {
      return notFound("Insurance request");
    }

    const startDate = body.startDate ?? existing.startDate;
    const endDate = body.endDate ?? existing.endDate;
    if (endDate < startDate) {
      throw new ApiError(400, "endDate must be on or after startDate.");
    }
    if (
      body.status == InsuranceStatus.POLICY_ISSUED &&
      !(body.policyNumber ?? existing.policyNumber)
    ) {
      throw new ApiError(400, "A policy number is required to mark the policy issued.");
    }

    const insurance = await prisma.insuranceRequest.update({
      where: { id: id },
      data: body,
      include: { customer: true },
    });

    if (body.status && body.status != existing.status) {
      await audit({
        userId: auth.user.id,
        action: "insurance_request.status_changed",
        entityType: "INSURANCE_REQUEST",
        entityId: id,
        details: { from: existing.status, to: body.status },
      });
      await notifyCustomer({
        customer: insurance.customer,
        subject: `Travel insurance ${insurance.reference}: ${body.status.replace(/_/g, " ").toLowerCase()}`,
        body: `Dear ${insurance.customer.firstName},\n\nYour travel insurance request ${insurance.reference} is now: ${body.status.replace(/_/g, " ").toLowerCase()}.`,
        entityType: EntityType.INSURANCE_REQUEST,
        entityId: id,
      });
    }

    return NextResponse.json({ message: "Insurance request updated", data: insurance });
  } catch (error) {
    return handleError(error);
  }
}
