import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { Division, EntityType, PublishStatus } from "@/app/generated/prisma/enums";
import { idOrKey, isCatalogueEditor } from "@/lib/catalogue";
import { assertRanges, colomboDay, isAcceptingApplications } from "@/lib/jobs";
import { JobVacancyUpdateRequestSchema } from "@/types/dto/job";
import { getUser, requireUser } from "@/utils/authentication";
import { ApiError, handleError, notFound } from "@/utils/handleError";
import { audit } from "@/utils/audit";
import { IdContext } from "@/utils/params";

// GET /api/jobs/vacancies/{id or slug}
export async function GET(request: NextRequest, { params }: IdContext) {
  const { id } = await params;
  const user = await getUser(request);

  try {
    const vacancy = await prisma.jobVacancy.findFirst({ where: idOrKey(id, "slug") });
    const isEditor = isCatalogueEditor(user, Division.TRAVEL);
    if (vacancy == null || (vacancy.status != PublishStatus.PUBLISHED && !isEditor)) {
      return notFound("Job vacancy");
    }
    return NextResponse.json({
      message: "Job vacancy fetched",
      data: { ...vacancy, acceptingApplications: isAcceptingApplications(vacancy) },
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function PUT(request: NextRequest, { params }: IdContext) {
  const { id } = await params;
  const auth = await requireUser(request);
  if (auth.error) {
    return auth.error;
  }

  try {
    if (!isCatalogueEditor(auth.user, Division.TRAVEL)) {
      throw new ApiError(403, "You cannot edit the Travel catalogue.");
    }
    const body = JobVacancyUpdateRequestSchema.parse(await request.json());
    const existing = await prisma.jobVacancy.findUnique({ where: { id: id } });
    if (existing == null) {
      return notFound("Job vacancy");
    }
    const number = (value: unknown) => (value == null ? null : Number(value));
    assertRanges({
      salaryMin: body.salaryMin !== undefined ? body.salaryMin : number(existing.salaryMin),
      salaryMax: body.salaryMax !== undefined ? body.salaryMax : number(existing.salaryMax),
      ageMin: body.ageMin !== undefined ? body.ageMin : existing.ageMin,
      ageMax: body.ageMax !== undefined ? body.ageMax : existing.ageMax,
    });

    const vacancy = await prisma.jobVacancy.update({
      where: { id: id },
      data: { ...body, deadline: body.deadline ? colomboDay(body.deadline) : body.deadline },
    });

    await audit({
      userId: auth.user.id,
      action: "job_vacancy.updated",
      entityType: EntityType.JOB_VACANCY,
      entityId: id,
      details: { changedFields: Object.keys(body) },
    });
    return NextResponse.json({ message: "Job vacancy updated", data: vacancy });
  } catch (error) {
    return handleError(error);
  }
}

// Soft delete: archived, so applications keep their job
export async function DELETE(request: NextRequest, { params }: IdContext) {
  const { id } = await params;
  const auth = await requireUser(request);
  if (auth.error) {
    return auth.error;
  }

  try {
    if (!isCatalogueEditor(auth.user, Division.TRAVEL)) {
      throw new ApiError(403, "You cannot edit the Travel catalogue.");
    }
    await prisma.jobVacancy.update({ where: { id: id }, data: { status: PublishStatus.ARCHIVED } });
    await audit({
      userId: auth.user.id,
      action: "job_vacancy.archived",
      entityType: EntityType.JOB_VACANCY,
      entityId: id,
    });
    return NextResponse.json({ message: "Job vacancy archived" });
  } catch (error) {
    return handleError(error);
  }
}
