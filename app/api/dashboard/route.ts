import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import {
  AppointmentStatus,
  EnquiryStatus,
  OrderStatus,
  PaymentStatus,
  QuotationStatus,
} from "@/app/generated/prisma/enums";
import { PRIVILEGES } from "@/lib/privileges";
import { customerSummaryFields } from "@/lib/selects";
import { divisionWhere, requirePrivilege } from "@/utils/authentication";
import { handleError } from "@/utils/handleError";

// Staff dashboard (FR-SH-10). Enquiries, quotations, bookings/orders and
// payments are SEPARATE counts (Appendix A, correction 7).
export async function GET(request: NextRequest) {
  const auth = await requirePrivilege(request, PRIVILEGES.ENQUIRIES_READ);
  if (auth.error) {
    return auth.error;
  }

  try {
    const inMyDivisions = divisionWhere(auth.user);

    const openEnquiryStatuses: EnquiryStatus[] = [
      EnquiryStatus.NEW,
      EnquiryStatus.ASSIGNED,
      EnquiryStatus.IN_PROGRESS,
      EnquiryStatus.AWAITING_CUSTOMER,
      EnquiryStatus.QUOTED,
    ];
    const activeOrderStatuses: OrderStatus[] = [
      OrderStatus.PENDING,
      OrderStatus.CONFIRMED,
      OrderStatus.IN_FULFILMENT,
    ];

    const now = new Date();
    const in7Days = new Date(now.getTime() + 7 * 86_400_000);

    const [
      appointmentsToConfirm,
      upcomingAppointments,
      openEnquiries,
      unassignedEnquiries,
      myEnquiries,
      quotesAwaitingReply,
      activeOrders,
      paymentsToConfirm,
      delayedShipments,
      enquiriesByDivision,
      recentEnquiries,
    ] = await Promise.all([
      prisma.appointment.count({
        where: {
          ...inMyDivisions,
          status: AppointmentStatus.REQUESTED,
          startAt: { gte: now },
        },
      }),
      prisma.appointment.findMany({
        where: {
          ...inMyDivisions,
          status: { in: [AppointmentStatus.REQUESTED, AppointmentStatus.CONFIRMED] },
          startAt: { gte: now, lte: in7Days },
        },
        orderBy: { startAt: "asc" },
        take: 8,
        select: {
          id: true,
          reference: true,
          division: true,
          subject: true,
          mode: true,
          status: true,
          startAt: true,
          endAt: true,
          customer: { select: customerSummaryFields },
        },
      }),
      prisma.enquiry.count({
        where: { ...inMyDivisions, status: { in: openEnquiryStatuses } },
      }),
      prisma.enquiry.count({
        where: { ...inMyDivisions, status: EnquiryStatus.NEW, assignedToId: null },
      }),
      prisma.enquiry.count({
        where: {
          assignedToId: auth.user.id,
          status: { in: openEnquiryStatuses },
        },
      }),
      prisma.quotation.count({
        where: { ...inMyDivisions, status: QuotationStatus.SENT },
      }),
      prisma.order.count({
        where: { ...inMyDivisions, status: { in: activeOrderStatuses } },
      }),
      prisma.payment.count({
        where: { order: inMyDivisions, status: PaymentStatus.PENDING },
      }),
      prisma.shipment.count({
        where: { order: inMyDivisions, isDelayed: true },
      }),
      prisma.enquiry.groupBy({
        by: ["division"],
        where: { ...inMyDivisions, status: { in: openEnquiryStatuses } },
        _count: { _all: true },
      }),
      prisma.enquiry.findMany({
        where: inMyDivisions,
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          reference: true,
          division: true,
          serviceType: true,
          subject: true,
          status: true,
          priority: true,
          createdAt: true,
          customer: { select: customerSummaryFields },
        },
      }),
    ]);

    return NextResponse.json({
      message: "Dashboard data",
      data: {
        counts: {
          openEnquiries,
          unassignedEnquiries,
          myEnquiries,
          quotesAwaitingReply,
          activeOrders,
          paymentsToConfirm,
          delayedShipments,
          appointmentsToConfirm,
        },
        upcomingAppointments,
        openEnquiriesByDivision: enquiriesByDivision.map((row) => ({
          division: row.division,
          count: row._count._all,
        })),
        recentEnquiries,
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
