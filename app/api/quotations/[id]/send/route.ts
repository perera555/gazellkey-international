import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import {
  EnquiryStatus,
  EntityType,
  QuotationStatus,
} from "@/app/generated/prisma/enums";
import { PRIVILEGES } from "@/lib/privileges";
import { notifyCustomer } from "@/lib/notifications";
import { canAccessDivision, requirePrivilege } from "@/utils/authentication";
import { ApiError, handleError, notFound } from "@/utils/handleError";
import { audit } from "@/utils/audit";
import { IdContext } from "@/utils/params";

// DRAFT -> SENT, and the customer gets an email
export async function POST(request: NextRequest, { params }: IdContext) {
  const { id } = await params;
  const auth = await requirePrivilege(request, PRIVILEGES.QUOTATIONS_EDIT);
  if (auth.error) {
    return auth.error;
  }

  try {
    const existing = await prisma.quotation.findUnique({ where: { id: id } });
    if (existing == null || !canAccessDivision(auth.user, existing.division)) {
      return notFound("Quotation");
    }
    if (existing.status != QuotationStatus.DRAFT) {
      throw new ApiError(409, "Only draft quotations can be sent.");
    }
    if (existing.validUntil < new Date()) {
      throw new ApiError(409, "validUntil is in the past. Update it first.");
    }

    const quotation = await prisma.$transaction(async (tx) => {
      const sent = await tx.quotation.update({
        where: { id: id },
        data: { status: QuotationStatus.SENT, sentAt: new Date() },
        include: { customer: true },
      });
      if (sent.enquiryId) {
        await tx.enquiry.update({
          where: { id: sent.enquiryId },
          data: { status: EnquiryStatus.QUOTED },
        });
      }
      return sent;
    });

    await audit({
      userId: auth.user.id,
      action: "quotation.sent",
      entityType: "QUOTATION",
      entityId: id,
    });

    await notifyCustomer({
      customer: quotation.customer,
      subject: `Your quotation ${quotation.reference}`,
      body: `Dear ${quotation.customer.firstName},\n\nYour quotation ${quotation.reference} is ready. Total: ${quotation.currency} ${quotation.total.toFixed(2)}. Valid until ${quotation.validUntil.toDateString()}.\n\nPlease sign in to your account to accept it or ask for changes.`,
      entityType: EntityType.QUOTATION,
      entityId: quotation.id,
    });

    return NextResponse.json({
      message: "Quotation sent",
      data: quotation,
    });
  } catch (error) {
    return handleError(error);
  }
}
