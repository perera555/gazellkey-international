import { z } from "zod";

// ── Membership cards (admin: Sales > Members) ──
export const MembershipCreateRequestSchema = z.object({
  customerId: z.uuid(),
});

// Staff redeem points (a reward / discount) or adjust them (gift, correction).
// REDEMPTION always takes points away; ADJUSTMENT can add (+) or remove (-).
export const PointsChangeRequestSchema = z.object({
  points: z.number().int().min(-1_000_000).max(1_000_000).refine((points) => points != 0, "Enter a number of points other than 0"),
  reason: z.enum(["REDEMPTION", "ADJUSTMENT"]),
  note: z.string().trim().min(2, "Please say what the points are for").max(300),
});
