import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { QuotationStatus } from "@/app/generated/prisma/enums";
import { PRIVILEGES } from "@/lib/privileges";
import { canViewOwnedRecord } from "@/lib/access";
import { customerSummaryFields, staffNameFields } from "@/lib/selects";
import { QuotationUpdateRequestSchema } from "@/types/dto/quotation";
import {
  canAccessDivision,
  hasPrivilege,
  requirePrivilege,
  requireUser,
} from "@/utils/authentication";
import { ApiError, handleError, notFound } from "@/utils/handleError";
import { calculateTotals } from "@/utils/money";
import { audit } from "@/utils/audit";
import { IdContext } from "@/utils/params";

// Staff of the division, or the customer it was sent to
export async function GET(request: NextRequest, { params }: IdContext) {
  const { id } = await params;
  const auth = await requireUser(request);
  if (auth.error) {
    return auth.error;
  }

  const quotation = await prisma.quotation.findUnique({
    where: { id: id },
    include: {
      items: { orderBy: { sortOrder: "asc" } },
      customer: { select: customerSummaryFields },
      createdBy: { select: staffNameFields },
      order: { select: { id: true, reference: true, status: true } },
    },
  });

  if (
    quotation == null ||
    !(await canViewOwnedRecord(auth.user, quotation, PRIVILEGES.QUOTATIONS_READ))
  ) {
    return notFound("Quotation");
  }

  // customers never see drafts
  const isStaff = hasPrivilege(auth.user, PRIVILEGES.QUOTATIONS_READ);
  if (!isStaff && quotation.status == QuotationStatus.DRAFT) {
    return notFound("Quotation");
  }

  return NextResponse.json({ message: "Quotation fetched", data: quotation });
}

// Only DRAFT quotations can be changed. A sent quotation is changed by
// creating a revision: POST /api/quotations/[id]/revise
export async function PUT(request: NextRequest, { params }: IdContext) {
  const { id } = await params;
  const auth = await requirePrivilege(request, PRIVILEGES.QUOTATIONS_EDIT);
  if (auth.error) {
    return auth.error;
  }

  try {
    const body = QuotationUpdateRequestSchema.parse(await request.json());

    const existing = await prisma.quotation.findUnique({
      where: { id: id },
      include: { items: true },
    });
    if (existing == null || !canAccessDivision(auth.user, existing.division)) {
      return notFound("Quotation");
    }
    if (existing.status != QuotationStatus.DRAFT) {
      throw new ApiError(
        409,
        "Only draft quotations can be edited. Create a revision instead.",
      );
    }

    const items =
      body.items ??
      existing.items.map((item) => ({
        description: item.description,
        itemType: item.itemType ?? undefined,
        itemId: item.itemId ?? undefined,
        quantity: Number(item.quantity),
        unit: item.unit,
        unitPrice: Number(item.unitPrice),
      }));
    const discount = body.discount ?? Number(existing.discount);
    const tax = body.tax ?? Number(existing.tax);
    const totals = calculateTotals(items, discount, tax);

    const quotation = await prisma.$transaction(async (tx) => {
      if (body.items) {
        await tx.quotationItem.deleteMany({ where: { quotationId: id } });
      }
      return tx.quotation.update({
        where: { id: id },
        data: {
          currency: body.currency,
          validUntil: body.validUntil,
          terms: body.terms,
          shippingTerms: body.shippingTerms,
          notes: body.notes,
          discount: discount,
          tax: tax,
          subtotal: totals.subtotal,
          total: totals.total,
          items: body.items
            ? {
                create: totals.lines.map((line, index) => ({
                  ...line,
                  sortOrder: index,
                })),
              }
            : undefined,
        },
        include: { items: { orderBy: { sortOrder: "asc" } } },
      });
    });

    await audit({
      userId: auth.user.id,
      action: "quotation.updated",
      entityType: "QUOTATION",
      entityId: id,
      details: { total: totals.total },
    });

    return NextResponse.json({
      message: "Quotation updated successfully",
      data: quotation,
    });
  } catch (error) {
    return handleError(error);
  }
}
