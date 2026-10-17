import prisma from "@/lib/prisma";
import { after, NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/app/generated/prisma/client";
import {
  AppointmentMode,
  AppointmentStatus,
  Division,
  EntityType,
} from "@/app/generated/prisma/enums";
import { PRIVILEGES } from "@/lib/privileges";
import {
  assertSlotAvailable,
  formatAppointmentTime,
  lockSlot,
  MODE_LABELS,
  slotEnd,
  syncAppointmentCalendar,
} from "@/lib/appointments";
import { findOrCreateCustomer } from "@/lib/customers";
import { notifyCustomer } from "@/lib/notifications";
import { adminUrl, customerContact, smsOffice } from "@/lib/officeAlerts";
import { customerSummaryFields, staffNameFields } from "@/lib/selects";
import { AppointmentCreateRequestSchema } from "@/types/dto/appointment";
import {
  divisionWhere,
  getUser,
  requirePrivilege,
} from "@/utils/authentication";
import { ApiError, handleError } from "@/utils/handleError";
import { divisionReference } from "@/utils/reference";
import { dateParam, enumParam, searchParam } from "@/utils/params";
import getPageInfo, { buildPagination } from "@/utils/pageInfoRetrivel";

// Public: any visitor can request an appointment, signed in or not.
// It starts as REQUESTED; staff confirm it, which adds it to Google Calendar.
export async function POST(request: NextRequest) {
  try {
    const body = AppointmentCreateRequestSchema.parse(await request.json());

    // honeypot field is hidden on the form - only bots fill it in
    if (body.website) {
      return NextResponse.json(
        { message: "Appointment requested" },
        { status: 201 },
      );
    }

    const signedInUser = await getUser(request);

    const appointment = await prisma.$transaction(async (tx) => {
      await lockSlot(tx, body.division, body.startAt);
      await assertSlotAvailable(body.startAt, body.division);

      const customer = await findOrCreateCustomer(
        {
          email: body.email,
          firstName: body.firstName,
          lastName: body.lastName,
          companyName: body.companyName,
          phone: body.phone,
          country: body.country,
          userId: signedInUser?.id,
        },
        tx,
      );

      if (body.enquiryId) {
        const enquiry = await tx.enquiry.findFirst({
          where: { id: body.enquiryId, customerId: customer.id },
        });
        if (enquiry == null) {
          throw new ApiError(400, "enquiryId: enquiry not found");
        }
      }

      return tx.appointment.create({
        data: {
          reference: await divisionReference(body.division, "APT", tx),
          division: body.division,
          serviceType: body.serviceType,
          subject: body.subject,
          message: body.message,
          mode: body.mode,
          startAt: body.startAt,
          endAt: slotEnd(body.startAt),
          customerId: customer.id,
          enquiryId: body.enquiryId,
        },
        include: { customer: true },
      });
    });

    await notifyCustomer({
      customer: appointment.customer,
      subject: `Appointment request ${appointment.reference} received`,
      body: `Dear ${appointment.customer.firstName},\n\nThank you for booking with Gazellekey International. We received your appointment request about "${appointment.subject}".\n\nWhen: ${formatAppointmentTime(appointment.startAt)}\nType: ${MODE_LABELS[appointment.mode]}\n\nYour reference is ${appointment.reference}. We will email you again as soon as a member of our team confirms the time.`,
      entityType: EntityType.APPOINTMENT,
      entityId: appointment.id,
    });

    // Office alerts after the customer has their answer: a yellow "To confirm"
    // event in the office Google Calendar and an SMS to the office phone
    after(async () => {
      await syncAppointmentCalendar(appointment.id);
      await smsOffice(
        `Gazellekey: New appointment ${appointment.reference}, ${formatAppointmentTime(appointment.startAt)} (${MODE_LABELS[appointment.mode]}). ` +
          `${customerContact(appointment.customer)}. ` +
          `Confirm: ${adminUrl(`/appointments/${appointment.id}`)}`,
        EntityType.APPOINTMENT,
        appointment.id,
      );
    });

    return NextResponse.json(
      {
        message: "Appointment requested",
        reference: appointment.reference,
        data: {
          id: appointment.id,
          reference: appointment.reference,
          startAt: appointment.startAt,
          endAt: appointment.endAt,
          status: appointment.status,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return handleError(error);
  }
}

// Staff list: /api/appointments?division=TRAVEL&status=REQUESTED&assignedTo=me
//   &from=2026-10-01&to=2026-10-31&upcoming=true&search=...
export async function GET(request: NextRequest) {
  const auth = await requirePrivilege(request, PRIVILEGES.APPOINTMENTS_READ);
  if (auth.error) {
    return auth.error;
  }

  try {
    const params = getPageInfo(request);
    const search = searchParam(request, "search");
    const assignedTo = searchParam(request, "assignedTo");
    const upcoming = searchParam(request, "upcoming") == "true";
    const from = dateParam(request, "from");
    const to = dateParam(request, "to");
    if (to) {
      to.setHours(23, 59, 59, 999); // include the whole "to" day
    }

    const where: Prisma.AppointmentWhereInput = {
      AND: [
        divisionWhere(auth.user), // staff only see their divisions
        {
          division: enumParam(request, "division", Division),
          status: enumParam(request, "status", AppointmentStatus),
          mode: enumParam(request, "mode", AppointmentMode),
          assignedToId:
            assignedTo == "me"
              ? auth.user.id
              : assignedTo == "none"
                ? null
                : assignedTo,
        },
        from || to ? { startAt: { gte: from, lte: to } } : {},
        upcoming ? { endAt: { gte: new Date() } } : {},
        search
          ? {
              OR: [
                { reference: { contains: search, mode: "insensitive" } },
                { subject: { contains: search, mode: "insensitive" } },
                {
                  customer: {
                    email: { contains: search, mode: "insensitive" },
                  },
                },
              ],
            }
          : {},
      ],
    };

    const [appointments, totalCount] = await Promise.all([
      prisma.appointment.findMany({
        where: where,
        skip: params.skip,
        take: params.take,
        // upcoming lists read best soonest-first
        orderBy: { startAt: upcoming ? "asc" : "desc" },
        include: {
          customer: { select: customerSummaryFields },
          assignedTo: { select: staffNameFields },
        },
      }),
      prisma.appointment.count({ where: where }),
    ]);

    return NextResponse.json({
      message: "Appointments fetched successfully",
      data: appointments,
      pagination: buildPagination(params, totalCount),
    });
  } catch (error) {
    return handleError(error);
  }
}
