import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { EnquiryStatus, EntityType } from "@/app/generated/prisma/enums";
import { PRIVILEGES } from "@/lib/privileges";
import { notifyCustomer } from "@/lib/notifications";
import { assertAssignableStaff } from "@/lib/staff";
import { staffNameFields } from "@/lib/selects";
import { EnquiryUpdateRequestSchema } from "@/types/dto/enquiry";
import { canAccessDivision, requirePrivilege } from "@/utils/authentication";
import { handleError, notFound } from "@/utils/handleError";
import { audit } from "@/utils/audit";
import { IdContext } from "@/utils/params";

// Statuses the customer is told about by email
const CUSTOMER_VISIBLE_STATUSES: EnquiryStatus[] = [
  EnquiryStatus.AWAITING_CUSTOMER,
  EnquiryStatus.CLOSED_LOST,
  EnquiryStatus.CANCELLED,
];

export async function GET(request: NextRequest, { params }: IdContext) {
  const { id } = await params;
  const auth = await requirePrivilege(request, PRIVILEGES.ENQUIRIES_READ);
  if (auth.error) {
    return auth.error;
  }

  const enquiry = await prisma.enquiry.findUnique({
    where: { id: id },
    include: {
      customer: true,
      assignedTo: { select: staffNameFields },
      notes: {
        orderBy: { createdAt: "desc" },
        include: { author: { select: staffNameFields } },
      },
      quotations: { orderBy: { createdAt: "desc" } },
      visaCase: true,
      ticketRequest: true,
      insuranceRequest: true,
    },
  });

  if (enquiry == null || !canAccessDivision(auth.user, enquiry.division)) {
    return notFound("Enquiry");
  }
  return NextResponse.json({ message: "Enquiry fetched", data: enquiry });
}

// Assign, change status or priority
export async function PUT(request: NextRequest, { params }: IdContext) {
  const { id } = await params;
  const auth = await requirePrivilege(request, PRIVILEGES.ENQUIRIES_EDIT);
  if (auth.error) {
    return auth.error;
  }

  try {
    const body = EnquiryUpdateRequestSchema.parse(await request.json());

    const existing = await prisma.enquiry.findUnique({ where: { id: id } });
    if (existing == null || !canAccessDivision(auth.user, existing.division)) {
      return notFound("Enquiry");
    }

    let status = body.status;
    if (body.assignedToId) {
      await assertAssignableStaff(body.assignedToId, existing.division);
      // first assignment moves a NEW enquiry to ASSIGNED
      if (status == undefined && existing.status == EnquiryStatus.NEW) {
        status = EnquiryStatus.ASSIGNED;
      }
    }

    const enquiry = await prisma.enquiry.update({
      where: { id: id },
      data: {
        status: status,
        priority: body.priority,
        assignedToId: body.assignedToId,
        serviceType: body.serviceType,
      },
      include: { customer: true },
    });

    if (status != undefined && status != existing.status) {
      await audit({
        userId: auth.user.id,
        action: "enquiry.status_changed",
        entityType: "ENQUIRY",
        entityId: id,
        details: { from: existing.status, to: status },
      });

      if (CUSTOMER_VISIBLE_STATUSES.includes(status)) {
        await notifyCustomer({
          customer: enquiry.customer,
          subject: `Update on your enquiry ${enquiry.reference}`,
          body: `Dear ${enquiry.customer.firstName},\n\nThe status of your enquiry ${enquiry.reference} is now: ${status.replace(/_/g, " ").toLowerCase()}.`,
          entityType: EntityType.ENQUIRY,
          entityId: enquiry.id,
        });
      }
    }

    if (body.assignedToId !== undefined && body.assignedToId != existing.assignedToId) {
      await audit({
        userId: auth.user.id,
        action: "enquiry.assigned",
        entityType: "ENQUIRY",
        entityId: id,
        details: { from: existing.assignedToId, to: body.assignedToId },
      });
    }

    return NextResponse.json({
      message: "Enquiry updated successfully",
      data: enquiry,
    });
  } catch (error) {
    return handleError(error);
  }
}
