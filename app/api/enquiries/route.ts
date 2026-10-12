import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/app/generated/prisma/client";
import {
  Division,
  EnquiryStatus,
  EntityType,
  Priority,
} from "@/app/generated/prisma/enums";
import { PRIVILEGES } from "@/lib/privileges";
import { findOrCreateCustomer } from "@/lib/customers";
import { notifyCustomer } from "@/lib/notifications";
import { customerSummaryFields, staffNameFields } from "@/lib/selects";
import { EnquiryCreateRequestSchema } from "@/types/dto/enquiry";
import {
  divisionWhere,
  getUser,
  requirePrivilege,
} from "@/utils/authentication";
import { handleError } from "@/utils/handleError";
import { divisionReference } from "@/utils/reference";
import { dateRangeFilter, enumParam, searchParam } from "@/utils/params";
import getPageInfo, { buildPagination } from "@/utils/pageInfoRetrivel";

// Public: any visitor can send an enquiry, signed in or not (FR-SH-02)
export async function POST(request: NextRequest) {
  try {
    const body = EnquiryCreateRequestSchema.parse(await request.json());

    // honeypot field is hidden on the form - only bots fill it in.
    // Pretend it worked so the bot does not try again.
    if (body.website) {
      return NextResponse.json(
        { message: "Enquiry received" },
        { status: 201 },
      );
    }

    const signedInUser = await getUser(request);

    const enquiry = await prisma.$transaction(async (tx) => {
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

      return tx.enquiry.create({
        data: {
          reference: await divisionReference(body.division, "ENQ", tx),
          division: body.division,
          serviceType: body.serviceType,
          subject: body.subject,
          message: body.message,
          details: body.details,
          itemType: body.itemType,
          itemId: body.itemId,
          customerId: customer.id,
        },
        include: { customer: true },
      });
    });

    await notifyCustomer({
      customer: enquiry.customer,
      subject: `We received your enquiry ${enquiry.reference}`,
      body: `Dear ${enquiry.customer.firstName},\n\nThank you for contacting Gazellekey International. Your enquiry "${enquiry.subject}" has been received with reference ${enquiry.reference}. Our team will reply soon.`,
      entityType: EntityType.ENQUIRY,
      entityId: enquiry.id,
    });

    return NextResponse.json(
      {
        message: "Enquiry received",
        reference: enquiry.reference,
      },
      { status: 201 },
    );
  } catch (error) {
    return handleError(error);
  }
}

// Staff list: /api/enquiries?division=TRAVEL&status=NEW&assignedTo=me&search=...
export async function GET(request: NextRequest) {
  const auth = await requirePrivilege(request, PRIVILEGES.ENQUIRIES_READ);
  if (auth.error) {
    return auth.error;
  }

  try {
    const params = getPageInfo(request);
    const search = searchParam(request, "search");
    const assignedTo = searchParam(request, "assignedTo");

    const where: Prisma.EnquiryWhereInput = {
      AND: [
        divisionWhere(auth.user), // staff only see their divisions
        {
          division: enumParam(request, "division", Division),
          status: enumParam(request, "status", EnquiryStatus),
          priority: enumParam(request, "priority", Priority),
          createdAt: dateRangeFilter(request),
          assignedToId:
            assignedTo == "me"
              ? auth.user.id
              : assignedTo == "none"
                ? null
                : assignedTo,
        },
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

    const [enquiries, totalCount] = await Promise.all([
      prisma.enquiry.findMany({
        where: where,
        skip: params.skip,
        take: params.take,
        orderBy: { createdAt: "desc" },
        include: {
          customer: { select: customerSummaryFields },
          assignedTo: { select: staffNameFields },
        },
      }),
      prisma.enquiry.count({ where: where }),
    ]);

    return NextResponse.json({
      message: "Enquiries fetched successfully",
      data: enquiries,
      pagination: buildPagination(params, totalCount),
    });
  } catch (error) {
    return handleError(error);
  }
}
