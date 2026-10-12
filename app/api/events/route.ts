import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/app/generated/prisma/client";
import { Division, EventType, PublishStatus } from "@/app/generated/prisma/enums";
import { isCatalogueEditor } from "@/lib/catalogue";
import { EventCreateRequestSchema } from "@/types/dto/event";
import { getUser, requireUser } from "@/utils/authentication";
import { ApiError, handleError } from "@/utils/handleError";
import { audit } from "@/utils/audit";
import { enumParam, searchParam } from "@/utils/params";
import getPageInfo, { buildPagination } from "@/utils/pageInfoRetrivel";

// Public event catalogue (FR-EVT-01, FR-EVT-02)
// /api/events?eventType=CONFERENCE&past=true&search=colombo
export async function GET(request: NextRequest) {
  try {
    const params = getPageInfo(request);
    const user = await getUser(request);
    const isEditor = isCatalogueEditor(user, Division.EVENTS);
    const search = searchParam(request, "search");
    const includePast = searchParam(request, "past") == "true";

    const where: Prisma.EventWhereInput = {
      status: isEditor
        ? enumParam(request, "status", PublishStatus)
        : PublishStatus.PUBLISHED,
      eventType: enumParam(request, "eventType", EventType),
      endDate: includePast ? undefined : { gte: new Date() }, // upcoming by default
      OR: search
        ? [
            { name: { contains: search, mode: "insensitive" } },
            { venue: { contains: search, mode: "insensitive" } },
            { city: { contains: search, mode: "insensitive" } },
          ]
        : undefined,
    };

    const [events, totalCount] = await Promise.all([
      prisma.event.findMany({
        where: where,
        skip: params.skip,
        take: params.take,
        orderBy: { startDate: "asc" },
      }),
      prisma.event.count({ where: where }),
    ]);

    return NextResponse.json({
      message: "Events fetched successfully",
      data: events.map((event) => ({
        ...event,
        seatsLeft:
          event.capacity == null ? null : event.capacity - event.registeredCount,
      })),
      pagination: buildPagination(params, totalCount),
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireUser(request);
  if (auth.error) {
    return auth.error;
  }

  try {
    if (!isCatalogueEditor(auth.user, Division.EVENTS)) {
      throw new ApiError(403, "You cannot edit the Events catalogue.");
    }
    const body = EventCreateRequestSchema.parse(await request.json());

    const event = await prisma.event.create({ data: body });

    await audit({
      userId: auth.user.id,
      action: "event.created",
      entityType: "EVENT",
      entityId: event.id,
    });

    return NextResponse.json(
      { message: "Event created successfully", data: event },
      { status: 201 },
    );
  } catch (error) {
    return handleError(error);
  }
}
