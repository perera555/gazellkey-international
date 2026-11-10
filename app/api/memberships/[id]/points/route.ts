import { NextRequest, NextResponse } from "next/server";
import { EntityType } from "@/app/generated/prisma/enums";
import { PRIVILEGES } from "@/lib/privileges";
import { staffChangePoints } from "@/lib/membership";
import { PointsChangeRequestSchema } from "@/types/dto/membership";
import { requirePrivilege } from "@/utils/authentication";
import { handleError } from "@/utils/handleError";
import { audit } from "@/utils/audit";
import { IdContext } from "@/utils/params";

// Staff redeem or adjust a customer's points: { points, reason, note }
export async function POST(request: NextRequest, { params }: IdContext) {
  const { id } = await params;
  const auth = await requirePrivilege(request, PRIVILEGES.CUSTOMERS_EDIT);
  if (auth.error) {
    return auth.error;
  }

  try {
    const body = PointsChangeRequestSchema.parse(await request.json());
    const result = await staffChangePoints(id, body, auth.user.id);

    await audit({
      userId: auth.user.id,
      action: body.reason == "REDEMPTION" ? "membership.points_redeemed" : "membership.points_adjusted",
      entityType: EntityType.MEMBERSHIP,
      entityId: id,
      details: { points: result.transaction.points, note: body.note, balance: result.membership.pointsBalance },
    });
    return NextResponse.json(
      {
        message: body.reason == "REDEMPTION" ? "Points redeemed" : "Points updated",
        data: result,
      },
      { status: 201 },
    );
  } catch (error) {
    return handleError(error);
  }
}
