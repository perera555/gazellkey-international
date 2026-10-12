import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import {
  EnquiryStatus,
  EntityType,
  QuotationStatus,
} from "@/app/generated/prisma/enums";
import { PRIVILEGES } from "@/lib/privileges";
import { canViewOwnedRecord } from "@/lib/access";
import { notifyCustomer } from "@/lib/notifications";
import { QuotationResponseRequestSchema } from "@/types/dto/quotation";
import { hasPrivilege, requireUser } from "@/utils/authentication";
import { ApiError, handleError, notFound } from "@/utils/handleError";
import { divisionReference } from "@/utils/reference";
import { audit } from "@/utils/audit";
import { IdContext } from "@/utils/params";

// The customer answers a SENT quotation (workflow step 5).
// Staff with quotations:edit may record the answer for the customer
// (e.g. accepted by phone).
//   ACCEPT          -> quotation ACCEPTED, booking/order created (FR-SH-06)
//   REJECT          -> quotation REJECTED, enquiry CLOSED_LOST
//   REQUEST_CHANGES -> stays SENT, staff are asked to revise it
export async function POST(request: NextRequest, { params }: IdContext) {
  const { id } = await params;
  const auth = await requireUser(request);
  if (auth.error) {
    return auth.error;
  }

  try {
    const body = QuotationResponseRequestSchema.parse(await request.json());

    const quotation = await prisma.quotation.findUnique({
      where: { id: id },
      include: { items: true, customer: true },
    });

    const isStaff = hasPrivilege(auth.user, PRIVILEGES.QUOTATIONS_EDIT);
    if (
      quotation == null ||
      !(await canViewOwnedRecord(auth.user, quotation, PRIVILEGES.QUOTATIONS_EDIT))
    ) {
      return notFound("Quotation");
    }
    if (quotation.status != QuotationStatus.SENT) {
      throw new ApiError(
        409,
        `This quotation is ${quotation.status.toLowerCase()} and cannot be answered.`,
      );
    }
    if (quotation.validUntil < new Date()) {
      await prisma.quotation.update({
        where: { id: id },
        data: { status: QuotationStatus.EXPIRED },
      });
      throw new ApiError(
        409,
        "This quotation has expired. Please ask us for a new one.",
      );
    }

    if (body.action == "REQUEST_CHANGES") {
      await prisma.$transaction(async (tx) => {
        await tx.quotation.update({
          where: { id: id },
          data: { responseNote: body.note, respondedAt: new Date() },
        });
        if (quotation.enquiryId) {
          await tx.enquiry.update({
            where: { id: quotation.enquiryId },
            data: { status: EnquiryStatus.IN_PROGRESS },
          });
          await tx.enquiryNote.create({
            data: {
              enquiryId: quotation.enquiryId,
              authorId: auth.user.id,
              body: `Changes requested on ${quotation.reference}: ${body.note ?? "(no details)"}`,
            },
          });
        }
      });
      await audit({
        userId: auth.user.id,
        action: "quotation.changes_requested",
        entityType: "QUOTATION",
        entityId: id,
      });
      return NextResponse.json({ message: "Change request sent" });
    }

    if (body.action == "REJECT") {
      await prisma.$transaction(async (tx) => {
        await tx.quotation.update({
          where: { id: id },
          data: {
            status: QuotationStatus.REJECTED,
            responseNote: body.note,
            respondedAt: new Date(),
          },
        });
        if (quotation.enquiryId) {
          await tx.enquiry.update({
            where: { id: quotation.enquiryId },
            data: { status: EnquiryStatus.CLOSED_LOST },
          });
        }
      });
      await audit({
        userId: auth.user.id,
        action: "quotation.rejected",
        entityType: "QUOTATION",
        entityId: id,
        details: { recordedByStaff: isStaff },
      });
      return NextResponse.json({ message: "Quotation rejected" });
    }

    // ACCEPT: create the booking / order from the quotation lines
    const order = await prisma.$transaction(async (tx) => {
      // conditional update = protection against a double click creating two orders
      const accepted = await tx.quotation.updateMany({
        where: { id: id, status: QuotationStatus.SENT },
        data: {
          status: QuotationStatus.ACCEPTED,
          responseNote: body.note,
          respondedAt: new Date(),
        },
      });
      if (accepted.count == 0) {
        throw new ApiError(409, "This quotation was already answered.");
      }

      if (quotation.enquiryId) {
        await tx.enquiry.update({
          where: { id: quotation.enquiryId },
          data: { status: EnquiryStatus.CONVERTED },
        });
      }

      return tx.order.create({
        data: {
          reference: await divisionReference(quotation.division, "ORD", tx),
          division: quotation.division,
          quotationId: quotation.id,
          customerId: quotation.customerId,
          currency: quotation.currency,
          total: quotation.total,
          shippingTerms: quotation.shippingTerms,
          items: {
            create: quotation.items.map((item) => ({
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
      });
    });

    await audit({
      userId: auth.user.id,
      action: "quotation.accepted",
      entityType: "QUOTATION",
      entityId: id,
      details: { orderId: order.id, recordedByStaff: isStaff },
    });

    await notifyCustomer({
      customer: quotation.customer,
      subject: `Thank you - order ${order.reference} created`,
      body: `Dear ${quotation.customer.firstName},\n\nYou accepted quotation ${quotation.reference}. Your booking/order reference is ${order.reference}. We will send payment instructions shortly.`,
      entityType: EntityType.ORDER,
      entityId: order.id,
    });

    return NextResponse.json(
      { message: "Quotation accepted", order: order },
      { status: 201 },
    );
  } catch (error) {
    return handleError(error);
  }
}
