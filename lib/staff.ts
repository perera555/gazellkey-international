import prisma from "@/lib/prisma";
import { Division, Role, UserStatus } from "@/app/generated/prisma/enums";
import { ApiError } from "@/utils/handleError";

// Checks that a user can be assigned work in a division:
// an active staff member of that division, or an admin.
export async function assertAssignableStaff(
  userId: string,
  division: Division,
) {
  const staff = await prisma.user.findUnique({ where: { id: userId } });

  const canWork =
    staff != null &&
    staff.status == UserStatus.ACTIVE &&
    (staff.role == Role.ADMIN ||
      (staff.role == Role.STAFF && staff.divisions.includes(division)));

  if (!canWork) {
    throw new ApiError(
      400,
      `The selected user is not an active staff member of ${division}.`,
    );
  }
  return staff;
}
