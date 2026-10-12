import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { Division, PaymentStatus } from "@/app/generated/prisma/enums";
import { PRIVILEGES } from "@/lib/privileges";
import {
  canAccessDivision,
  divisionWhere,
  requirePrivilege,
} from "@/utils/authentication";
import { ApiError, handleError } from "@/utils/handleError";
import { dateRangeFilter, enumParam, searchParam } from "@/utils/params";

// FR-SH-11: reports filtered by division, staff and date range.
// /api/reports?division=TRAVEL&from=2026-01-01&to=2026-03-31&staffId=...&format=csv
// Money totals are grouped per currency - amounts in different
// currencies are never added together (NFR-10).
export async function GET(request: NextRequest) {
  const auth = await requirePrivilege(request, PRIVILEGES.REPORTS_READ);
  if (auth.error) {
    return auth.error;
  }

  try {
    const division = enumParam(request, "division", Division);
    if (division && !canAccessDivision(auth.user, division)) {
      throw new ApiError(403, "You can only report on your own divisions.");
    }

    const createdAt = dateRangeFilter(request);
    const staffId = searchParam(request, "staffId");
    const scope = { ...divisionWhere(auth.user), ...(division ? { division } : {}) };

    const [enquiries, quotations, quotationValues, orders, payments, refunds] =
      await Promise.all([
        prisma.enquiry.groupBy({
          by: ["division", "status"],
          where: { ...scope, createdAt, assignedToId: staffId },
          _count: { _all: true },
        }),
        prisma.quotation.groupBy({
          by: ["division", "status"],
          where: { ...scope, createdAt, createdById: staffId },
          _count: { _all: true },
        }),
        prisma.quotation.groupBy({
          by: ["division", "status", "currency"],
          where: { ...scope, createdAt, createdById: staffId },
          _sum: { total: true },
        }),
        prisma.order.groupBy({
          by: ["division", "status", "currency"],
          where: { ...scope, createdAt },
          _count: { _all: true },
          _sum: { total: true, amountPaid: true },
        }),
        prisma.payment.groupBy({
          by: ["currency", "method"],
          where: {
            order: scope,
            paidAt: createdAt,
            status: {
              in: [
                PaymentStatus.PAID,
                PaymentStatus.PARTIALLY_REFUNDED,
                PaymentStatus.REFUNDED,
              ],
            },
          },
          _count: { _all: true },
          _sum: { amount: true, refundedAmount: true },
        }),
        prisma.refund.groupBy({
          by: ["currency"],
          where: { payment: { order: scope }, createdAt },
          _count: { _all: true },
          _sum: { amount: true },
        }),
      ]);

    const rows = [
      ...enquiries.map((r) => ({
        report: "enquiries",
        division: r.division,
        status: r.status,
        count: r._count._all,
      })),
      ...quotations.map((r) => ({
        report: "quotations",
        division: r.division,
        status: r.status,
        count: r._count._all,
      })),
      ...quotationValues.map((r) => ({
        report: "quotation_value",
        division: r.division,
        status: r.status,
        currency: r.currency,
        amount: Number(r._sum.total ?? 0),
      })),
      ...orders.map((r) => ({
        report: "orders",
        division: r.division,
        status: r.status,
        currency: r.currency,
        count: r._count._all,
        amount: Number(r._sum.total ?? 0),
        paid: Number(r._sum.amountPaid ?? 0),
      })),
      ...payments.map((r) => ({
        report: "payments_received",
        method: r.method,
        currency: r.currency,
        count: r._count._all,
        amount: Number(r._sum.amount ?? 0),
        refunded: Number(r._sum.refundedAmount ?? 0),
      })),
      ...refunds.map((r) => ({
        report: "refunds",
        currency: r.currency,
        count: r._count._all,
        amount: Number(r._sum.amount ?? 0),
      })),
    ];

    if (searchParam(request, "format") == "csv") {
      const columns = [
        "report",
        "division",
        "status",
        "method",
        "currency",
        "count",
        "amount",
        "paid",
        "refunded",
      ];
      const lines = [
        columns.join(","),
        ...rows.map((row) =>
          columns
            .map((column) => {
              const value = (row as Record<string, unknown>)[column];
              return value == undefined ? "" : `"${String(value).replace(/"/g, '""')}"`;
            })
            .join(","),
        ),
      ];
      return new NextResponse(lines.join("\n"), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="gazellekey-report.csv"`,
        },
      });
    }

    return NextResponse.json({ message: "Report generated", data: rows });
  } catch (error) {
    return handleError(error);
  }
}
