import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/app/generated/prisma/client";
import {
  Division,
  EntityType,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
} from "@/app/generated/prisma/enums";
import { PRIVILEGES } from "@/lib/privileges";
import { notifyCustomer } from "@/lib/notifications";
import { customerSummaryFields } from "@/lib/selects";
import { PaymentCreateRequestSchema } from "@/types/dto/order";
import {
  canAccessDivision,
  divisionWhere,
  requirePrivilege,
} from "@/utils/authentication";
import { ApiError, handleError } from "@/utils/handleError";
import { nextReference } from "@/utils/reference";
import { toCents } from "@/utils/money";
import { audit } from "@/utils/audit";
import { dateRangeFilter, enumParam, searchParam } from "@/utils/params";
import getPageInfo, { buildPagination } from "@/utils/pageInfoRetrivel";

// /api/payments?status=PENDING&division=TRAVEL&orderId=...
export async function GET(request: NextRequest) {
  const auth = await requirePrivilege(request, PRIVILEGES.PAYMENTS_READ);
  if (auth.error) {
    return auth.error;
  }

  try {
    const params = getPageInfo(request);
    const division = enumParam(request, "division", Division);

    const where: Prisma.PaymentWhereInput = {
      AND: [
        { order: divisionWhere(auth.user) },
        division ? { order: { division: division } } : {},
        {
          status: enumParam(request, "status", PaymentStatus),
          method: enumParam(request, "method", PaymentMethod),
          orderId: searchParam(request, "orderId"),
          customerId: searchParam(request, "customerId"),
          createdAt: dateRangeFilter(request),
        },
      ],
    };

    const [payments, totalCount] = await Promise.all([
      prisma.payment.findMany({
        where: where,
        skip: params.skip,
        take: params.take,
        orderBy: { createdAt: "desc" },
        include: {
          customer: { select: customerSummaryFields },
          order: {
            select: { id: true, reference: true, division: true, total: true },
          },
        },
      }),
      prisma.payment.count({ where: where }),
    ]);

    return NextResponse.json({
      message: "Payments fetched successfully",
      data: payments,
      pagination: buildPagination(params, totalCount),
    });
  } catch (error) {
    return handleError(error);
  }
}

// Request / record a payment for an order (workflow step 7).
// It starts PENDING; Finance confirms it with PUT /api/payments/[id].
export async function POST(request: NextRequest) {
  const auth = await requirePrivilege(request, PRIVILEGES.PAYMENTS_CREATE);
  if (auth.error) {
    return auth.error;
  }

  try {
    const body = PaymentCreateRequestSchema.parse(await request.json());

    const order = await prisma.order.findUnique({
      where: { id: body.orderId },
      include: { customer: true },
    });
    if (order == null || !canAccessDivision(auth.user, order.division)) {
      throw new ApiError(404, "Order not found.");
    }
    if (order.status == OrderStatus.CANCELLED) {
      throw new ApiError(409, "This order is cancelled.");
    }

    const outstandingCents = toCents(order.total) - toCents(order.amountPaid);
    if (toCents(body.amount) > outstandingCents) {
      throw new ApiError(
        400,
        `Amount is more than the outstanding balance (${order.currency} ${(outstandingCents / 100).toFixed(2)}).`,
      );
    }

    const payment = await prisma.payment.create({
      data: {
        reference: await nextReference("PAY"),
        orderId: order.id,
        customerId: order.customerId,
        amount: body.amount,
        currency: order.currency, // always the order's currency (NFR-10)
        method: body.method,
        providerReference: body.providerReference,
        note: body.note,
      },
    });

    await audit({
      userId: auth.user.id,
      action: "payment.requested",
      entityType: "PAYMENT",
      entityId: payment.id,
      details: { orderId: order.id, amount: body.amount },
    });

    await notifyCustomer({
      customer: order.customer,
      subject: `Payment request ${payment.reference} for ${order.reference}`,
      body: `Dear ${order.customer.firstName},\n\nPlease pay ${payment.currency} ${body.amount.toFixed(2)} for your booking/order ${order.reference}. Use reference ${payment.reference} with your payment.`,
      entityType: EntityType.PAYMENT,
      entityId: payment.id,
    });

    return NextResponse.json(
      { message: "Payment recorded as pending", data: payment },
      { status: 201 },
    );
  } catch (error) {
    return handleError(error);
  }
}
