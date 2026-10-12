import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { QuotationStatus } from "@/app/generated/prisma/enums";
import { PRIVILEGES } from "@/lib/privileges";
import { canAccessDivision, requirePrivilege } from "@/utils/authentication";
import { ApiError, handleError, notFound } from "@/utils/handleError";
import { divisionReference } from "@/utils/reference";
import { audit } from "@/utils/audit";
import { IdContext } from "@/utils/params";

const REVISABLE: QuotationStatus[] = [
  QuotationStatus.SENT,
  QuotationStatus.REJECTED,
  QuotationStatus.EXPIRED,
];

// Copies a sent / rejected / expired quotation into a new DRAFT and marks
// the old one REVISED, so the history of offers is kept.
export async function POST(request: NextRequest, { params }: IdContext) {
  const { id } = await params;
  const auth = await requirePrivilege(request, PRIVILEGES.QUOTATIONS_EDIT);
  if (auth.error) {
    return auth.error;
  }

  try {
    const old = await prisma.quotation.findUnique({
      where: { id: id },
      include: { items: true },
    });
    if (old == null || !canAccessDivision(auth.user, old.division)) {
      return notFound("Quotation");
    }
    if (!REVISABLE.includes(old.status)) {
      throw new ApiError(
        409,
        `A ${old.status} quotation cannot be revised.`,
      );
    }

    const revision = await prisma.$transaction(async (tx) => {
      await tx.quotation.update({
        where: { id: id },
        data: { status: QuotationStatus.REVISED },
      });

      return tx.quotation.create({
        data: {
          reference: await divisionReference(old.division, "QUO", tx),
          division: old.division,
          enquiryId: old.enquiryId,
          customerId: old.customerId,
          currency: old.currency,
          subtotal: old.subtotal,
          discount: old.discount,
          tax: old.tax,
          total: old.total,
          validUntil: old.validUntil,
          terms: old.terms,
          shippingTerms: old.shippingTerms,
          notes: old.notes,
          revisedFromId: old.id,
          createdById: auth.user.id,
          items: {
            create: old.items.map((item) => ({
              description: item.description,
              itemType: item.itemType,
              itemId: item.itemId,
              quantity: item.quantity,
              unit: item.unit,
              unitPrice: item.unitPrice,
              lineTotal: item.lineTotal,
              sortOrder: item.sortOrder,
            })),
          },
        },
        include: { items: { orderBy: { sortOrder: "asc" } } },
      });
    });

    await audit({
      userId: auth.user.id,
      action: "quotation.revised",
      entityType: "QUOTATION",
      entityId: revision.id,
      details: { revisedFromId: old.id },
    });

    return NextResponse.json(
      { message: "Revision created as a draft", data: revision },
      { status: 201 },
    );
  } catch (error) {
    return handleError(error);
  }
}
