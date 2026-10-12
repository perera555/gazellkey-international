import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { PRIVILEGES, ROLE_DEFAULT_PRIVILEGES } from "@/lib/privileges";
import {
  UserSelfUpdateRequestSchema,
  UserUpdatedByAdminRequestSchema,
} from "@/types/dto/user";
import { hasPrivilege, requireUser } from "@/utils/authentication";
import { handleError, notFound } from "@/utils/handleError";
import { audit } from "@/utils/audit";
import { IdContext } from "@/utils/params";
import { userPublicFields } from "@/lib/selects";

export async function GET(request: NextRequest, { params }: IdContext) {
  const { id } = await params;
  const auth = await requireUser(request);
  if (auth.error) {
    return auth.error;
  }

  // users may read themselves; others need users:read
  if (auth.user.id != id && !hasPrivilege(auth.user, PRIVILEGES.USERS_READ)) {
    return NextResponse.json(
      {
        message:
          "You do not have the required privilege to access this resource.",
      },
      { status: 403 },
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: id },
    select: userPublicFields,
  });
  if (user == null) {
    return notFound("User");
  }
  return NextResponse.json({ message: "User fetched", data: user });
}

export async function PUT(request: NextRequest, { params }: IdContext) {
  const { id } = await params;
  const auth = await requireUser(request);
  if (auth.error) {
    return auth.error;
  }

  try {
    const body = await request.json();

    // user going to edit itself: role, status and privileges cannot change.
    // (This also stops an admin from locking themselves out by mistake.)
    if (auth.user.id == id) {
      const parsed = UserSelfUpdateRequestSchema.parse(body);
      const user = await prisma.user.update({
        where: { id: id },
        data: parsed, // undefined fields are left unchanged by Prisma
        select: userPublicFields,
      });
      return NextResponse.json({
        message: "User updated successfully",
        data: user,
      });
    }

    if (!hasPrivilege(auth.user, PRIVILEGES.USERS_EDIT)) {
      return NextResponse.json(
        {
          message:
            "You do not have the required privilege to access this resource.",
        },
        { status: 403 },
      );
    }

    const parsed = UserUpdatedByAdminRequestSchema.parse(body);

    const existing = await prisma.user.findUnique({ where: { id: id } });
    if (existing == null) {
      return notFound("User");
    }

    // when the role changes, give the new role's default privileges
    // unless the admin sent an explicit list
    const roleChanged = parsed.role != undefined && parsed.role != existing.role;
    const privileges =
      parsed.privileges ??
      (roleChanged ? ROLE_DEFAULT_PRIVILEGES[parsed.role!] : undefined);

    const user = await prisma.user.update({
      where: { id: id },
      data: { ...parsed, privileges: privileges },
      select: userPublicFields,
    });

    await audit({
      userId: auth.user.id,
      action: "user.updated_by_admin",
      entityType: "USER",
      entityId: id,
      details: {
        changedFields: Object.keys(parsed),
        role: user.role,
        status: user.status,
      },
    });

    return NextResponse.json({
      message: "User updated successfully",
      data: user,
    });
  } catch (error) {
    return handleError(error);
  }
}
