import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { DocumentAccess, QuotationStatus } from "@/app/generated/prisma/enums";
import { customerAppointmentView } from "@/lib/appointments";
import { getCustomerForUser } from "@/lib/customers";
import { requireUser } from "@/utils/authentication";
import { handleError, notFound } from "@/utils/handleError";
import getPageInfo, { buildPagination } from "@/utils/pageInfoRetrivel";

type ResourceContext = { params: Promise<{ resource: string }> };

// Customer account area (SRS 9.1): only the signed-in customer's own records.
//   /api/me/enquiries  /api/me/quotations  /api/me/orders  /api/me/payments
//   /api/me/documents  /api/me/travel  /api/me/events  /api/me/messages
//   /api/me/appointments  /api/me/reviews
export async function GET(request: NextRequest, { params }: ResourceContext) {
  const { resource } = await params;
  const auth = await requireUser(request);
  if (auth.error) {
    return auth.error;
  }

  try {
    const customer = await getCustomerForUser(auth.user.id);
    const page = getPageInfo(request);

    if (customer == null) {
      // signed in but never enquired / registered as a customer yet
      return NextResponse.json({
        message: "No records yet",
        data: [],
        pagination: buildPagination(page, 0),
      });
    }

    const mine = { customerId: customer.id };
    const paging = {
      skip: page.skip,
      take: page.take,
      orderBy: { createdAt: "desc" as const },
    };

    let data: unknown[];
    let totalCount: number;

    switch (resource) {
      case "enquiries":
        [data, totalCount] = await Promise.all([
          prisma.enquiry.findMany({
            where: mine,
            ...paging,
            select: {
              id: true,
              reference: true,
              division: true,
              serviceType: true,
              subject: true,
              status: true,
              createdAt: true,
            },
          }),
          prisma.enquiry.count({ where: mine }),
        ]);
        break;

      case "quotations": {
        const where = {
          ...mine,
          status: { not: QuotationStatus.DRAFT }, // never show drafts
        };
        [data, totalCount] = await Promise.all([
          prisma.quotation.findMany({
            where,
            ...paging,
            include: { items: { orderBy: { sortOrder: "asc" } } },
          }),
          prisma.quotation.count({ where }),
        ]);
        break;
      }

      case "orders":
        [data, totalCount] = await Promise.all([
          prisma.order.findMany({
            where: mine,
            ...paging,
            include: {
              items: { orderBy: { sortOrder: "asc" } },
              shipments: { include: { milestones: true } },
            },
          }),
          prisma.order.count({ where: mine }),
        ]);
        break;

      case "payments":
        [data, totalCount] = await Promise.all([
          prisma.payment.findMany({
            where: mine,
            ...paging,
            include: {
              order: { select: { reference: true } },
              refunds: true,
            },
          }),
          prisma.payment.count({ where: mine }),
        ]);
        break;

      case "documents": {
        const where = {
          ...mine,
          accessLevel: { not: DocumentAccess.STAFF }, // internal documents hidden
        };
        [data, totalCount] = await Promise.all([
          prisma.document.findMany({
            where,
            ...paging,
            omit: { storageKey: true },
          }),
          prisma.document.count({ where }),
        ]);
        break;
      }

      case "travel": {
        const [visaCases, tickets, insurance] = await Promise.all([
          prisma.visaCase.findMany({
            where: mine,
            orderBy: { createdAt: "desc" },
            omit: { notes: true }, // staff notes stay internal
          }),
          prisma.ticketRequest.findMany({
            where: mine,
            orderBy: { createdAt: "desc" },
            omit: { notes: true },
          }),
          prisma.insuranceRequest.findMany({
            where: mine,
            orderBy: { createdAt: "desc" },
            omit: { notes: true },
          }),
        ]);
        return NextResponse.json({
          message: "Travel records fetched",
          data: { visaCases, tickets, insurance },
        });
      }

      case "events":
        [data, totalCount] = await Promise.all([
          prisma.eventRegistration.findMany({
            where: mine,
            ...paging,
            include: {
              event: {
                select: {
                  id: true,
                  slug: true,
                  name: true,
                  venue: true,
                  startDate: true,
                  endDate: true,
                },
              },
            },
          }),
          prisma.eventRegistration.count({ where: mine }),
        ]);
        break;

      case "appointments": {
        const [appointments, count] = await Promise.all([
          prisma.appointment.findMany({
            where: mine,
            skip: page.skip,
            take: page.take,
            orderBy: { startAt: "desc" },
          }),
          prisma.appointment.count({ where: mine }),
        ]);
        data = appointments.map(customerAppointmentView); // no staff notes
        totalCount = count;
        break;
      }

      case "reviews": {
        // by account, so reviews still show if the customer record changes
        const own = { userId: auth.user.id };
        [data, totalCount] = await Promise.all([
          prisma.review.findMany({
            where: own,
            ...paging,
            select: {
              id: true,
              division: true,
              rating: true,
              title: true,
              body: true,
              tripDate: true,
              status: true,
              removedReason: true, // why an admin removed it
              createdAt: true,
              tour: { select: { id: true, slug: true, title: true } },
            },
          }),
          prisma.review.count({ where: own }),
        ]);
        break;
      }

      case "messages":
        [data, totalCount] = await Promise.all([
          prisma.notification.findMany({ where: mine, ...paging }),
          prisma.notification.count({ where: mine }),
        ]);
        break;

      default:
        return notFound("Resource");
    }

    return NextResponse.json({
      message: `My ${resource} fetched`,
      data: data,
      pagination: buildPagination(page, totalCount),
    });
  } catch (error) {
    return handleError(error);
  }
}
