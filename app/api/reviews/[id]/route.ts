import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { ReviewStatus } from "@/app/generated/prisma/enums";
import { PRIVILEGES } from "@/lib/privileges";
import { ReviewModerateRequestSchema } from "@/types/dto/review";
import {
  hasPrivilege,
  requirePrivilege,
  requireUser,
} from "@/utils/authentication";
import { handleError, notFound } from "@/utils/handleError";
import { audit } from "@/utils/audit";
import { IdContext } from "@/utils/params";

// Admin: remove a bad review from the website (HIDDEN, with a reason)
// or put it back (PUBLISHED). Hidden reviews are kept for the record.
export async function PUT(request: NextRequest, { params }: IdContext) {
  const { id } = await params;
  const auth = await requirePrivilege(request, PRIVILEGES.REVIEWS_MODERATE);
  if (auth.error) {
    return auth.error;
  }

  try {
    const body = ReviewModerateRequestSchema.parse(await request.json());
    const existing = await prisma.review.findUnique({ where: { id: id } });
    if (existing == null) {
      return notFound("Review");
    }

    const hide = body.status == ReviewStatus.HIDDEN;
    const review = await prisma.review.update({
      where: { id: id },
      data: {
        status: body.status,
        removedReason: hide ? body.removedReason : null,
        removedById: hide ? auth.user.id : null,
        removedAt: hide ? new Date() : null,
      },
    });

    if (existing.status != body.status) {
      await audit({
        userId: auth.user.id,
        action: hide ? "review.hidden" : "review.restored",
        entityType: "REVIEW",
        entityId: id,
        details: { rating: existing.rating, reason: body.removedReason ?? null },
      });
    }

    return NextResponse.json({
      message: hide ? "Review removed from the website" : "Review published again",
      data: review,
    });
  } catch (error) {
    return handleError(error);
  }
}

// Delete for good: an admin (spam, abuse) or the customer who wrote it
export async function DELETE(request: NextRequest, { params }: IdContext) {
  const { id } = await params;
  const auth = await requireUser(request);
  if (auth.error) {
    return auth.error;
  }

  try {
    const existing = await prisma.review.findUnique({ where: { id: id } });
    const isModerator = hasPrivilege(auth.user, PRIVILEGES.REVIEWS_MODERATE);
    if (existing == null || (!isModerator && existing.userId != auth.user.id)) {
      return notFound("Review");
    }

    await prisma.review.delete({ where: { id: id } });

    if (existing.userId != auth.user.id) {
      await audit({
        userId: auth.user.id,
        action: "review.deleted",
        entityType: "REVIEW",
        entityId: id,
        details: {
          rating: existing.rating,
          title: existing.title,
          body: existing.body.slice(0, 500),
          customerId: existing.customerId,
        },
      });
    }

    return NextResponse.json({ message: "Review deleted" });
  } catch (error) {
    return handleError(error);
  }
}
