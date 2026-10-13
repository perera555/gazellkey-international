import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { DocumentApproval, EntityType } from "@/app/generated/prisma/enums";
import { PRIVILEGES } from "@/lib/privileges";
import { notifyCustomer } from "@/lib/notifications";
import { canAccessDivision, requirePrivilege } from "@/utils/authentication";
import { ApiError, handleError, notFound } from "@/utils/handleError";
import { audit } from "@/utils/audit";
import { IdContext } from "@/utils/params";

const ReviewRequestSchema = z
  .object({
    decision: z.enum([DocumentApproval.APPROVED, DocumentApproval.CANCELLED]),
    note: z.string().trim().max(2000).optional(), // reason, shown to the customer
  })
  .refine((data) => data.decision != DocumentApproval.CANCELLED || (data.note ?? "") != "", {
    message: "Please give a reason when cancelling",
    path: ["note"],
  });

// POST /api/documents/{id}/review  { decision: "APPROVED" | "CANCELLED", note }
// An admin approves or cancels a customer upload that is waiting for approval.
// A decision can be changed later (e.g. approve after a re-check).
export async function POST(request: NextRequest, { params }: IdContext) {
  const { id } = await params;
  const auth = await requirePrivilege(request, PRIVILEGES.DOCUMENTS_APPROVE);
  if (auth.error) {
    return auth.error;
  }

  try {
    const body = ReviewRequestSchema.parse(await request.json());

    const existing = await prisma.document.findUnique({
      where: { id: id },
      include: { customer: true },
    });
    if (existing == null || (existing.division && !canAccessDivision(auth.user, existing.division))) {
      return notFound("Document");
    }
    if (existing.approval == DocumentApproval.NOT_REQUIRED) {
      throw new ApiError(409, "This document does not need approval.");
    }

    const document = await prisma.document.update({
      where: { id: id },
      data: {
        approval: body.decision,
        reviewNote: body.note ?? null,
        reviewedById: auth.user.id,
        reviewedAt: new Date(),
      },
      omit: { storageKey: true },
    });

    await audit({
      userId: auth.user.id,
      action: body.decision == DocumentApproval.APPROVED ? "document.approved" : "document.cancelled",
      entityType: existing.entityType,
      entityId: existing.entityId,
      details: { documentId: id, type: existing.type, note: body.note },
    });

    if (existing.customer) {
      const approved = body.decision == DocumentApproval.APPROVED;
      await notifyCustomer({
        customer: existing.customer,
        subject: `Your document "${existing.title}" was ${approved ? "approved" : "not accepted"}`,
        body: approved
          ? `Dear ${existing.customer.firstName},\n\nYour document "${existing.title}" has been checked and approved.`
          : `Dear ${existing.customer.firstName},\n\nWe could not accept your document "${existing.title}".\nReason: ${body.note}\n\nPlease upload a new copy from your account.`,
        entityType: EntityType.CUSTOMER,
        entityId: existing.customer.id,
      });
    }

    return NextResponse.json({
      message: body.decision == DocumentApproval.APPROVED ? "Document approved" : "Document cancelled",
      data: document,
    });
  } catch (error) {
    return handleError(error);
  }
}
