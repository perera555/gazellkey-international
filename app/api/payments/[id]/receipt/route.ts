import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { PaymentStatus } from "@/app/generated/prisma/enums";
import { PRIVILEGES } from "@/lib/privileges";
import { canViewOwnedRecord } from "@/lib/access";
import { buildReceiptPdf } from "@/lib/receipt-pdf";
import { customerSummaryFields } from "@/lib/selects";
import { requireUser } from "@/utils/authentication";
import { ApiError, handleError, notFound } from "@/utils/handleError";
import { IdContext } from "@/utils/params";

// GET /api/payments/{id}/receipt  (?download=1 saves instead of opening)
// PDF receipt of a paid payment, for the customer who paid and for staff
// with payments:read in the order's division.
export async function GET(request: NextRequest, { params }: IdContext) {
  const { id } = await params;
  const auth = await requireUser(request);
  if (auth.error) {
    return auth.error;
  }

  try {
    const payment = await prisma.payment.findUnique({
      where: { id: id },
      include: {
        customer: { select: customerSummaryFields },
        order: {
          select: {
            reference: true,
            division: true,
            total: true,
            amountPaid: true,
            items: { orderBy: { sortOrder: "asc" } },
          },
        },
      },
    });

    if (
      payment == null ||
      !(await canViewOwnedRecord(
        auth.user,
        { customerId: payment.customerId, division: payment.order.division },
        PRIVILEGES.PAYMENTS_READ,
      ))
    ) {
      return notFound("Payment");
    }
    // refunded payments keep their receipt (it shows the refund)
    if (payment.status == PaymentStatus.PENDING || payment.status == PaymentStatus.FAILED) {
      throw new ApiError(409, "A receipt is available once the payment is confirmed.");
    }

    const bytes = await buildReceiptPdf(payment);
    const download = request.nextUrl.searchParams.get("download") == "1";
    const fileName = `Gazellekey-Receipt-${payment.reference}.pdf`.replace(/[^\w.-]/g, "_");

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
