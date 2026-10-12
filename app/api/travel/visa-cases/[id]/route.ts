import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { Division, EntityType } from "@/app/generated/prisma/enums";
import { PRIVILEGES } from "@/lib/privileges";
import { canViewOwnedRecord } from "@/lib/access";
import { assertTravelStaff } from "@/lib/catalogue";
import { notifyCustomer } from "@/lib/notifications";
import { customerSummaryFields, staffNameFields } from "@/lib/selects";
import { VisaCaseUpdateRequestSchema } from "@/types/dto/travel";
import {
  canAccessDivision,
  hasPrivilege,
  requirePrivilege,
  requireUser,
} from "@/utils/authentication";
import { ApiError, handleError, notFound } from "@/utils/handleError";
import { audit } from "@/utils/audit";
import { IdContext } from "@/utils/params";

// Travel staff, or the customer the case belongs to (FR-TRV-10)
export async function GET(request: NextRequest, { params }: IdContext) {
  const { id } = await params;
  const auth = await requireUser(request);
  if (auth.error) {
    return auth.error;
  }

  const visaCase = await prisma.visaCase.findUnique({
    where: { id: id },
    include: {
      customer: { select: customerSummaryFields },
      assignedTo: { select: staffNameFields },
    },
  });
  if (
    visaCase == null ||
    !(await canViewOwnedRecord(
      auth.user,
      { customerId: visaCase.customerId, division: Division.TRAVEL },
      PRIVILEGES.TRAVEL_CASES,
    ))
  ) {
    return notFound("Visa case");
  }

  // internal notes are for staff only
  if (!hasPrivilege(auth.user, PRIVILEGES.TRAVEL_CASES)) {
    const { notes, ...customerView } = visaCase;
    return NextResponse.json({ message: "Visa case fetched", data: customerView });
  }
  return NextResponse.json({ message: "Visa case fetched", data: visaCase });
}

// Move the case through its stages (FR-TRV-02), update checklist, assign
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
    const body = VisaCaseUpdateRequestSchema.parse(await request.json());
    await assertTravelStaff(body.assignedToId);

    const existing = await prisma.visaCase.findUnique({ where: { id: id } });
    if (existing == null) {
      return notFound("Visa case");
    }

    const visaCase = await prisma.visaCase.update({
      where: { id: id },
      data: body,
      include: { customer: true },
    });

    if (body.stage && body.stage != existing.stage) {
      await audit({
        userId: auth.user.id,
        action: "visa_case.stage_changed",
        entityType: "VISA_CASE",
        entityId: id,
        details: { from: existing.stage, to: body.stage },
      });
      await notifyCustomer({
        customer: visaCase.customer,
        subject: `Visa case ${visaCase.reference}: ${body.stage.replace(/_/g, " ").toLowerCase()}`,
        body: `Dear ${visaCase.customer.firstName},\n\nYour ${visaCase.destinationCountry} visa case ${visaCase.reference} is now at stage: ${body.stage.replace(/_/g, " ").toLowerCase()}.`,
        entityType: EntityType.VISA_CASE,
        entityId: id,
      });
    }

    return NextResponse.json({ message: "Visa case updated", data: visaCase });
  } catch (error) {
    return handleError(error);
  }
}
