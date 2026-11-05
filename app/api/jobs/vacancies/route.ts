import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/app/generated/prisma/client";
import { Division, EntityType, PublishStatus } from "@/app/generated/prisma/enums";
import { isCatalogueEditor } from "@/lib/catalogue";
import { assertRanges, colomboDay, isAcceptingApplications } from "@/lib/jobs";
import { todayInColombo } from "@/lib/rentals";
import { JobVacancyCreateRequestSchema } from "@/types/dto/job";
import { getUser, requireUser } from "@/utils/authentication";
import { ApiError, handleError } from "@/utils/handleError";
import { audit } from "@/utils/audit";
import { divisionReference } from "@/utils/reference";
import { enumParam, searchParam } from "@/utils/params";
import getPageInfo, { buildPagination } from "@/utils/pageInfoRetrivel";

// Overseas job vacancies (Travel division): website Jobs page + admin catalogue
// /api/jobs/vacancies?region=Middle%20East&country=Qatar&category=Hospitality&search=driver
// Visitors see published vacancies still open for applications, with
// region / country counts for the filters. Travel catalogue editors see all.
export async function GET(request: NextRequest) {
  try {
    const params = getPageInfo(request);
    const user = await getUser(request);
    const isEditor = isCatalogueEditor(user, Division.TRAVEL) && searchParam(request, "view") != "public";
    const search = searchParam(request, "search");

    const visible: Prisma.JobVacancyWhereInput = isEditor
      ? { status: enumParam(request, "status", PublishStatus) }
      : {
          status: PublishStatus.PUBLISHED,
          OR: [{ deadline: null }, { deadline: { gte: todayInColombo() } }],
        };

    const where: Prisma.JobVacancyWhereInput = {
      AND: [
        visible,
        {
          region: searchParam(request, "region"),
          country: searchParam(request, "country"),
          category: searchParam(request, "category"),
        },
        search
          ? {
              OR: [
                { title: { contains: search, mode: "insensitive" } },
                { reference: { contains: search, mode: "insensitive" } },
                { country: { contains: search, mode: "insensitive" } },
                { category: { contains: search, mode: "insensitive" } },
                { employer: { contains: search, mode: "insensitive" } },
              ],
            }
          : {},
      ],
    };

    const [vacancies, totalCount, countries, categories] = await Promise.all([
      prisma.jobVacancy.findMany({
        where: where,
        skip: params.skip,
        take: params.take,
        orderBy: [{ featured: "desc" }, { createdAt: "desc" }],
        include: { _count: { select: { applications: true } } },
      }),
      prisma.jobVacancy.count({ where: where }),
      // filter counts over everything visible, not the current filter
      prisma.jobVacancy.groupBy({ by: ["region", "country"], where: visible, _count: { _all: true } }),
      prisma.jobVacancy.groupBy({ by: ["category"], where: visible, _count: { _all: true } }),
    ]);

    return NextResponse.json({
      message: "Job vacancies fetched successfully",
      data: vacancies.map(({ _count, ...vacancy }) => ({
        ...vacancy,
        acceptingApplications: isAcceptingApplications(vacancy),
        // only staff see how many applied
        applicationCount: isEditor ? _count.applications : undefined,
      })),
      filters: {
        countries: countries
          .map((row) => ({ region: row.region, country: row.country, count: row._count._all }))
          .sort((a, b) => a.region.localeCompare(b.region) || a.country.localeCompare(b.country)),
        categories: categories
          .map((row) => ({ category: row.category, count: row._count._all }))
          .sort((a, b) => a.category.localeCompare(b.category)),
      },
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
    if (!isCatalogueEditor(auth.user, Division.TRAVEL)) {
      throw new ApiError(403, "You cannot edit the Travel catalogue.");
    }
    const body = JobVacancyCreateRequestSchema.parse(await request.json());
    assertRanges(body);

    const vacancy = await prisma.jobVacancy.create({
      data: {
        ...body,
        deadline: body.deadline ? colomboDay(body.deadline) : body.deadline,
        reference: await divisionReference(Division.TRAVEL, "JOB"),
      },
    });

    await audit({
      userId: auth.user.id,
      action: "job_vacancy.created",
      entityType: EntityType.JOB_VACANCY,
      entityId: vacancy.id,
    });

    return NextResponse.json({ message: "Job vacancy created successfully", data: vacancy }, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}
