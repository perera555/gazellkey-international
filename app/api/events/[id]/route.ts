import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { Division, PublishStatus } from "@/app/generated/prisma/enums";
import { idOrKey, isCatalogueEditor } from "@/lib/catalogue";
import { EventUpdateRequestSchema } from "@/types/dto/event";
import { getUser, requireUser } from "@/utils/authentication";
import { ApiError, handleError, notFound } from "@/utils/handleError";
import { audit } from "@/utils/audit";
import { IdContext } from "@/utils/params";

// GET /api/events/{id or slug}
export async function GET(request: NextRequest, { params }: IdContext) {
  const { id } = await params;
  const user = await getUser(request);

  const event = await prisma.event.findFirst({ where: idOrKey(id, "slug") });
  if (
    event == null ||
    (event.status != PublishStatus.PUBLISHED &&
      !isCatalogueEditor(user, Division.EVENTS))
  ) {
    return notFound("Event");
  }

  return NextResponse.json({
    message: "Event fetched",
    data: {
      ...event,
      seatsLeft:
        event.capacity == null ? null : event.capacity - event.registeredCount,
    },
  });
}

export async function PUT(request: NextRequest, { params }: IdContext) {
  const { id } = await params;
  const auth = await requireUser(request);
  if (auth.error) {
    return auth.error;
  }

  try {
    if (!isCatalogueEditor(auth.user, Division.EVENTS)) {
      throw new ApiError(403, "You cannot edit the Events catalogue.");
    }
    const body = EventUpdateRequestSchema.parse(await request.json());

    const existing = await prisma.event.findUnique({ where: { id: id } });
    if (existing == null) {
      return notFound("Event");
    }

    const startDate = body.startDate ?? existing.startDate;
    const endDate = body.endDate ?? existing.endDate;
    if (endDate < startDate) {
      throw new ApiError(400, "endDate must be on or after startDate.");
    }
    if (body.capacity != null && body.capacity < existing.registeredCount) {
      throw new ApiError(
        409,
        `Capacity cannot be lower than the ${existing.registeredCount} seats already registered.`,
      );
    }

    const event = await prisma.event.update({ where: { id: id }, data: body });

    await audit({
      userId: auth.user.id,
      action: "event.updated",
      entityType: "EVENT",
      entityId: id,
      details: { changedFields: Object.keys(body) },
    });

    return NextResponse.json({ message: "Event updated", data: event });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: IdContext) {
  const { id } = await params;
  const auth = await requireUser(request);
  if (auth.error) {
    return auth.error;
  }

  try {
    if (!isCatalogueEditor(auth.user, Division.EVENTS)) {
      throw new ApiError(403, "You cannot edit the Events catalogue.");
    }
    await prisma.event.update({
      where: { id: id },
      data: { status: PublishStatus.ARCHIVED, registrationOpen: false },
    });
    await audit({
      userId: auth.user.id,
      action: "event.archived",
      entityType: "EVENT",
      entityId: id,
    });
    return NextResponse.json({ message: "Event archived" });
  } catch (error) {
    return handleError(error);
  }
}
