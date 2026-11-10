import prisma from "@/lib/prisma";
import { Prisma } from "@/app/generated/prisma/client";
import { MembershipTier, PointsReason } from "@/app/generated/prisma/enums";
import { ApiError } from "@/utils/handleError";
import { Db, nextReference } from "@/utils/reference";

// Membership card and points (see prisma/schema.prisma "Membership & points").
// Every confirmed payment earns points; a refund takes them back.

// How much money earns one point. Currencies not listed: 1 point per 1 unit.
const AMOUNT_PER_POINT: Record<string, number> = {
  LKR: 300,
  INR: 80,
};

// The card (tier) follows the points earned in total (lifetimePoints).
// Every payment counts: shop & fertilizer, tickets, tours, events, rentals ...
export const TIERS: { tier: MembershipTier; fromPoints: number }[] = [
  { tier: MembershipTier.BLUE, fromPoints: 0 },
  { tier: MembershipTier.BRONZE, fromPoints: 250 },
  { tier: MembershipTier.SILVER, fromPoints: 1000 },
  { tier: MembershipTier.GOLD, fromPoints: 2500 },
  { tier: MembershipTier.PLATINUM, fromPoints: 5000 },
];

export function tierFor(lifetimePoints: number) {
  let current: MembershipTier = MembershipTier.BLUE;
  for (const level of TIERS) {
    if (lifetimePoints >= level.fromPoints) {
      current = level.tier;
    }
  }
  return current;
}

// The next tier and how many points are still needed (null at the top tier)
export function nextTier(lifetimePoints: number) {
  const next = TIERS.find((level) => level.fromPoints > lifetimePoints);
  return next ? { tier: next.tier, pointsNeeded: next.fromPoints - lifetimePoints } : null;
}

export function pointsFor(amount: Prisma.Decimal | number, currency: string) {
  const perPoint = AMOUNT_PER_POINT[currency.toUpperCase()] ?? 1;
  return Math.max(0, Math.floor(Number(amount) / perPoint));
}

// The customer's card, created the first time it is needed
export async function ensureMembership(customerId: string, db: Db = prisma) {
  const existing = await db.membership.findUnique({ where: { customerId: customerId } });
  if (existing != null) {
    return existing;
  }
  return db.membership.create({
    data: { customerId: customerId, cardNumber: await nextReference("GKM", db) },
  });
}

// Adds (or with a negative number removes) points and keeps the tier in step.
// Only positive changes count towards the tier, so redeeming never lowers it;
// taking points back for a refund (countsForTier) does lower it.
async function changePoints(
  db: Db,
  membershipId: string,
  points: number,
  entry: { reason: PointsReason; note?: string | null; paymentId?: string; refundId?: string; createdById?: string },
  countsForTier: boolean,
) {
  const membership = await db.membership.findUniqueOrThrow({ where: { id: membershipId } });
  const lifetimePoints = countsForTier ? Math.max(0, membership.lifetimePoints + points) : membership.lifetimePoints;
  const transaction = await db.pointsTransaction.create({
    data: { membershipId: membershipId, points: points, ...entry },
  });
  const updated = await db.membership.update({
    where: { id: membershipId },
    data: {
      pointsBalance: membership.pointsBalance + points,
      lifetimePoints: lifetimePoints,
      tier: tierFor(lifetimePoints),
    },
  });
  return { transaction, membership: updated };
}

// A payment just became PAID (inside the same transaction, see lib/payments.ts).
// Every customer has a card (Blue to start); one is created here if missing.
export async function awardPurchasePoints(
  tx: Prisma.TransactionClient,
  payment: { id: string; customerId: string; amount: Prisma.Decimal; currency: string; reference: string },
) {
  const points = pointsFor(payment.amount, payment.currency);
  if (points == 0) {
    return;
  }
  const membership = await ensureMembership(payment.customerId, tx);
  if (membership.status != "ACTIVE") {
    return; // card switched off by staff
  }
  const already = await tx.pointsTransaction.findUnique({ where: { paymentId: payment.id } });
  if (already != null) {
    return; // this payment already earned its points
  }
  await changePoints(
    tx,
    membership.id,
    points,
    { reason: PointsReason.PURCHASE, paymentId: payment.id, note: `Payment ${payment.reference}` },
    true,
  );
}

// A refund was made: take back the points that money earned
// (never more than the customer still has)
export async function reversePurchasePoints(
  tx: Prisma.TransactionClient,
  refund: { id: string; amount: Prisma.Decimal | number; currency: string },
  payment: { id: string; customerId: string; reference: string },
) {
  const earned = await tx.pointsTransaction.findUnique({ where: { paymentId: payment.id } });
  if (earned == null) {
    return; // the payment never earned points (e.g. before the card existed)
  }
  const membership = await tx.membership.findUniqueOrThrow({ where: { id: earned.membershipId } });
  const points = Math.min(pointsFor(refund.amount, refund.currency), earned.points, membership.pointsBalance);
  if (points <= 0) {
    return;
  }
  await changePoints(
    tx,
    membership.id,
    -points,
    { reason: PointsReason.REFUND, refundId: refund.id, note: `Refund on payment ${payment.reference}` },
    true,
  );
}

// Staff: redeem points (a reward or discount) or adjust them (gift, correction)
export async function staffChangePoints(
  membershipId: string,
  change: { points: number; reason: "REDEMPTION" | "ADJUSTMENT"; note: string },
  staffUserId: string,
) {
  return prisma.$transaction(async (tx) => {
    const membership = await tx.membership.findUnique({ where: { id: membershipId } });
    if (membership == null) {
      throw new ApiError(404, "Membership not found.");
    }
    const points = change.reason == PointsReason.REDEMPTION ? -Math.abs(change.points) : change.points;
    if (membership.pointsBalance + points < 0) {
      throw new ApiError(400, `Only ${membership.pointsBalance} points are available.`);
    }
    return changePoints(
      tx,
      membershipId,
      points,
      { reason: change.reason, note: change.note, createdById: staffUserId },
      change.reason == PointsReason.ADJUSTMENT && points > 0,
    );
  });
}

// What the customer sees on My account > Membership
export function membershipSummary(membership: { tier: MembershipTier; lifetimePoints: number }) {
  return {
    next: nextTier(membership.lifetimePoints),
    tiers: TIERS,
    earning: { perPoint: AMOUNT_PER_POINT, otherCurrencies: 1 },
  };
}
