import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/app/generated/prisma/client";
import {
  Division,
  PublishStatus,
  ReviewStatus,
} from "@/app/generated/prisma/enums";
import { PRIVILEGES } from "@/lib/privileges";
import { findOrCreateCustomer } from "@/lib/customers";
import { publicReviewSelect, reviewSummary, toPublicReview } from "@/lib/reviews";
import { customerSummaryFields, staffNameFields } from "@/lib/selects";
import { ReviewCreateRequestSchema } from "@/types/dto/review";
import {
  getUser,
  hasPrivilege,
  isStaffUser,
  requireUser,
} from "@/utils/authentication";
import { ApiError, handleError } from "@/utils/handleError";
import { enumParam, isUuid, searchParam } from "@/utils/params";
import getPageInfo, { buildPagination } from "@/utils/pageInfoRetrivel";

const MAX_REVIEWS_PER_DAY = 3;

const SORTS: Record<string, Prisma.ReviewOrderByWithRelationInput[]> = {
  newest: [{ createdAt: "desc" }],
  highest: [{ rating: "desc" }, { createdAt: "desc" }],
  lowest: [{ rating: "asc" }, { createdAt: "desc" }],
};

// Public: published reviews + star summary
//   /api/reviews?division=TRAVEL&tourId=...&rating=5&sort=newest|highest|lowest
// Admins with reviews:moderate add &moderation=true to see hidden reviews too
// (&status=HIDDEN, &search=...) with the customer's contact details.
export async function GET(request: NextRequest) {
  try {
    const params = getPageInfo(request);
    const user = await getUser(request);
    const moderation =
      searchParam(request, "moderation") == "true" &&
      hasPrivilege(user, PRIVILEGES.REVIEWS_MODERATE);

    const tourId = searchParam(request, "tourId");
    if (tourId && !isUuid(tourId)) {
      throw new ApiError(400, "tourId must be a valid id");
    }
    const ratingText = searchParam(request, "rating");
    const rating = ratingText ? Number(ratingText) : undefined;
    if (rating != undefined && !(Number.isInteger(rating) && rating >= 1 && rating <= 5)) {
      throw new ApiError(400, "rating must be 1 - 5");
    }
    const search = moderation ? searchParam(request, "search") : undefined;

    const scope: Prisma.ReviewWhereInput = {
      division: enumParam(request, "division", Division),
      tourId: tourId,
    };
    const where: Prisma.ReviewWhereInput = {
      ...scope,
      rating: rating,
      status: moderation ? enumParam(request, "status", ReviewStatus) : ReviewStatus.PUBLISHED,
      OR: search
        ? [
            { title: { contains: search, mode: "insensitive" } },
            { body: { contains: search, mode: "insensitive" } },
            { customer: { email: { contains: search, mode: "insensitive" } } },
          ]
        : undefined,
    };
    const orderBy = SORTS[searchParam(request, "sort") ?? "newest"] ?? SORTS.newest;

    const [rows, totalCount, summary] = await Promise.all([
      moderation
        ? prisma.review.findMany({
            where,
            orderBy,
            skip: params.skip,
            take: params.take,
            include: {
              customer: { select: customerSummaryFields },
              tour: { select: { id: true, slug: true, title: true } },
              removedBy: { select: staffNameFields },
            },
          })
        : prisma.review
            .findMany({ where, orderBy, skip: params.skip, take: params.take, select: publicReviewSelect })
            .then((reviews) => reviews.map(toPublicReview)),
      prisma.review.count({ where }),
      reviewSummary(scope),
    ]);

    return NextResponse.json({
      message: "Reviews fetched",
      data: rows,
      summary: summary,
      pagination: buildPagination(params, totalCount),
    });
  } catch (error) {
    return handleError(error);
  }
}

// Signed-in customers only, so every review belongs to a real account.
// It is published at once; an admin can hide it later.
export async function POST(request: NextRequest) {
  const auth = await requireUser(request);
  if (auth.error) {
    return auth.error;
  }

  try {
    const body = ReviewCreateRequestSchema.parse(await request.json());
    if (body.website) {
      return NextResponse.json({ message: "Thank you for your review" }, { status: 201 });
    }
    if (isStaffUser(auth.user)) {
      throw new ApiError(403, "Staff accounts cannot post customer reviews.");
    }

    if (body.tourId) {
      const tour = await prisma.tourPackage.findFirst({
        where: { id: body.tourId, status: PublishStatus.PUBLISHED },
        select: { id: true },
      });
      if (tour == null) {
        throw new ApiError(400, "tourId: tour not found");
      }
      const already = await prisma.review.findFirst({
        where: { tourId: body.tourId, userId: auth.user.id },
        select: { id: true },
      });
      if (already != null) {
        throw new ApiError(409, "You have already reviewed this tour. You can delete it in your account and write a new one.");
      }
    }

    const today = await prisma.review.count({
      where: { userId: auth.user.id, createdAt: { gte: new Date(Date.now() - 86_400_000) } },
    });
    if (today >= MAX_REVIEWS_PER_DAY) {
      throw new ApiError(429, "You have posted several reviews today. Please try again tomorrow.");
    }

    const customer = await findOrCreateCustomer({
      email: auth.user.email,
      firstName: auth.user.firstName,
      lastName: auth.user.lastName,
      userId: auth.user.id,
    });

    const review = await prisma.review.create({
      data: {
        division: body.tourId ? Division.TRAVEL : body.division,
        tourId: body.tourId,
        rating: body.rating,
        title: body.title || null,
        body: body.body,
        tripDate: body.tripDate,
        customerId: customer.id,
        userId: auth.user.id,
      },
      select: publicReviewSelect,
    });

    return NextResponse.json(
      { message: "Thank you for your review", data: toPublicReview(review) },
      { status: 201 },
    );
  } catch (error) {
    return handleError(error);
  }
}
