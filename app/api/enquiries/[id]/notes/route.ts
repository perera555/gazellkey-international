import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { EntityType } from "@/app/generated/prisma/enums";
import { PRIVILEGES } from "@/lib/privileges";
import { notifyCustomer } from "@/lib/notifications";
import { EnquiryNoteRequestSchema } from "@/types/dto/enquiry";
import { canAccessDivision, requirePrivilege } from "@/utils/authentication";
import { handleError, notFound } from "@/utils/handleError";
import { IdContext } from "@/utils/params";

// Internal notes stay inside the team. A note with isInternal=false is a
// message to the customer: it is emailed and kept as communication history.
export async function POST(request: NextRequest, { params }: IdContext) {
  const { id } = await params;
  const auth = await requirePrivilege(request, PRIVILEGES.ENQUIRIES_EDIT);
  if (auth.error) {
    return auth.error;
  }

  try {
    const body = EnquiryNoteRequestSchema.parse(await request.json());

    const enquiry = await prisma.enquiry.findUnique({
      where: { id: id },
      include: { customer: true },
    });
    if (enquiry == null || !canAccessDivision(auth.user, enquiry.division)) {
      return notFound("Enquiry");
    }

    const note = await prisma.enquiryNote.create({
      data: {
        enquiryId: id,
        authorId: auth.user.id,
        body: body.body,
        isInternal: body.isInternal,
      },
    });

    if (!body.isInternal) {
      await notifyCustomer({
        customer: enquiry.customer,
        subject: `Message about your enquiry ${enquiry.reference}`,
        body: body.body,
        entityType: EntityType.ENQUIRY,
        entityId: enquiry.id,
      });
    }

    return NextResponse.json(
      { message: "Note added", data: note },
      { status: 201 },
    );
  } catch (error) {
    return handleError(error);
  }
}
