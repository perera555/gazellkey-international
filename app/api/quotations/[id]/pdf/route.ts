import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { QuotationStatus } from "@/app/generated/prisma/enums";
import { PRIVILEGES } from "@/lib/privileges";
import { canViewOwnedRecord } from "@/lib/access";
import { buildQuotationPdf } from "@/lib/quotation-pdf";
import { customerSummaryFields, staffNameFields } from "@/lib/selects";
import { hasPrivilege, requireUser } from "@/utils/authentication";
import { handleError, notFound } from "@/utils/handleError";
import { IdContext } from "@/utils/params";

// GET /api/quotations/{id}/pdf  (?download=1 saves instead of opening)
// Same access as GET /api/quotations/{id}: staff of the division, or the
// customer it was sent to (customers never get drafts).
export async function GET(request: NextRequest, { params }: IdContext) {
  const { id } = await params;
  const auth = await requireUser(request);
  if (auth.error) {
    return auth.error;
  }

  try {
    const quotation = await prisma.quotation.findUnique({
      where: { id: id },
      include: {
        items: { orderBy: { sortOrder: "asc" } },
        customer: { select: customerSummaryFields },
        createdBy: { select: staffNameFields },
        enquiry: { select: { reference: true, subject: true, serviceType: true, details: true } },
      },
    });

    if (
      quotation == null ||
      !(await canViewOwnedRecord(auth.user, quotation, PRIVILEGES.QUOTATIONS_READ))
    ) {
      return notFound("Quotation");
    }
    const isStaff = hasPrivilege(auth.user, PRIVILEGES.QUOTATIONS_READ);
    if (!isStaff && quotation.status == QuotationStatus.DRAFT) {
      return notFound("Quotation");
    }

    const bytes = await buildQuotationPdf(quotation);
    const download = request.nextUrl.searchParams.get("download") == "1";
    const fileName = `Gazellekey-${quotation.reference}.pdf`.replace(/[^\w.-]/g, "_");

    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(bytes.length),
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${fileName}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
