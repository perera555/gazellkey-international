import prisma from "@/lib/prisma";
import { Prisma } from "@/app/generated/prisma/client";
import { ReviewStatus } from "@/app/generated/prisma/enums";

// What the website shows of a review: first name + last initial,
// never the email or phone of the customer.
export const publicReviewSelect = {
  id: true,
  division: true,
  rating: true,
  title: true,
  body: true,
  tripDate: true,
  createdAt: true,
  tour: { select: { id: true, slug: true, title: true } },
  customer: { select: { firstName: true, lastName: true, country: true } },
} satisfies Prisma.ReviewSelect;

type PublicReviewRow = Prisma.ReviewGetPayload<{ select: typeof publicReviewSelect }>;

export function toPublicReview(review: PublicReviewRow) {
  const { customer, ...rest } = review;
  const initial = customer.lastName ? ` ${customer.lastName.charAt(0).toUpperCase()}.` : "";
  return {
    ...rest,
    author: `${customer.firstName}${initial}`,
    country: customer.country,
  };
}

// Average stars, total and how many of each star (5 -> 1)
export async function reviewSummary(where: Prisma.ReviewWhereInput) {
  const published = { ...where, status: ReviewStatus.PUBLISHED };
  const [aggregate, groups] = await Promise.all([
    prisma.review.aggregate({
      where: published,
      _avg: { rating: true },
      _count: { _all: true },
    }),
    prisma.review.groupBy({
      by: ["rating"],
      where: published,
      _count: { _all: true },
    }),
  ]);

  return {
    average: aggregate._avg.rating ? Math.round(aggregate._avg.rating * 10) / 10 : null,
    count: aggregate._count._all,
    stars: [5, 4, 3, 2, 1].map((stars) => ({
      stars: stars,
      count: groups.find((group) => group.rating == stars)?._count._all ?? 0,
    })),
  };
}
