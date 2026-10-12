import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import {
  Division,
  EntityType,
  RegistrationStatus,
} from "@/app/generated/prisma/enums";
import { PRIVILEGES } from "@/lib/privileges";
import { notifyCustomer } from "@/lib/notifications";
import { EventRegistrationUpdateRequestSchema } from "@/types/dto/event";
import { canAccessDivision, requirePrivilege } from "@/utils/authentication";
import { ApiError, handleError, notFound } from "@/utils/handleError";
import { audit } from "@/utils/audit";
import { IdContext } from "@/utils/params";

// Staff confirm or cancel a registration. Cancelling gives the seats back.
export async function PUT(request: NextRequest, { params }: IdContext) {
  const { id } = await params;
  const auth = await requirePrivilege(request, PRIVILEGES.EVENTS_REGISTRATIONS);
  if (auth.error) {
    return auth.error;
  }

  try {
    if (!canAccessDivision(auth.user, Division.EVENTS)) {
      throw new ApiError(403, "You do not work in Events.");
    }
    const body = EventRegistrationUpdateRequestSchema.parse(await request.json());

    const existing = await prisma.eventRegistration.findUnique({
      where: { id: id },
      include: { event: true },
    });
    if (existing == null) {
      return notFound("Registration");
    }
    if (existing.status == RegistrationStatus.CANCELLED) {
      throw new ApiError(409, "This registration is already cancelled.");
    }

    const registration = await prisma.$transaction(async (tx) => {
      if (body.status == RegistrationStatus.CANCELLED) {
        await tx.event.update({
          where: { id: existing.eventId },
          data: { registeredCount: { decrement: existing.seats } },
        });
      }
      return tx.eventRegistration.update({
        where: { id: id },
        data: { status: body.status, notes: body.notes },
        include: { customer: true },
      });
    });

    if (body.status != existing.status) {
      await audit({
        userId: auth.user.id,
        action: "event_registration.status_changed",
        entityType: "EVENT_REGISTRATION",
        entityId: id,
        details: { from: existing.status, to: body.status },
      });
      await notifyCustomer({
        customer: registration.customer,
        subject: `${existing.event.name}: registration ${body.status.toLowerCase()}`,
        body: `Dear ${registration.customer.firstName},\n\nYour registration ${registration.reference} for ${existing.event.name} is now ${body.status.toLowerCase()}.`,
        entityType: EntityType.EVENT_REGISTRATION,
        entityId: id,
      });
    }

    return NextResponse.json({ message: "Registration updated", data: registration });
  } catch (error) {
    return handleError(error);
  }
}
