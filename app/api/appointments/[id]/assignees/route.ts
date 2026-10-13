import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { Role, UserStatus } from "@/app/generated/prisma/enums";
import { PRIVILEGES } from "@/lib/privileges";
import { staffNameFields } from "@/lib/selects";
import { canAccessDivision, requirePrivilege } from "@/utils/authentication";
import { handleError, notFound } from "@/utils/handleError";
import { IdContext } from "@/utils/params";

// Staff who may take this appointment (same rule as assertAssignableStaff):
// active staff of its division, or admins. Names only - no users:read needed.
export async function GET(request: NextRequest, { params }: IdContext) {
  const { id } = await params;
  const auth = await requirePrivilege(request, PRIVILEGES.APPOINTMENTS_EDIT);
  if (auth.error) {
    return auth.error;
  }

  try {
    const appointment = await prisma.appointment.findUnique({
      where: { id: id },
      select: { division: true },
    });
    if (appointment == null || !canAccessDivision(auth.user, appointment.division)) {
      return notFound("Appointment");
    }

    const staff = await prisma.user.findMany({
      where: {
        status: UserStatus.ACTIVE,
        OR: [
          { role: Role.ADMIN },
          { role: Role.STAFF, divisions: { has: appointment.division } },
        ],
      },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      select: staffNameFields,
    });

    return NextResponse.json({ message: "Staff fetched", data: staff });
  } catch (error) {
    return handleError(error);
  }
}
