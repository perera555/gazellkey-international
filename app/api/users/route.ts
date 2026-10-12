import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/app/generated/prisma/client";
import { Role, UserStatus } from "@/app/generated/prisma/enums";
import { PRIVILEGES, ROLE_DEFAULT_PRIVILEGES } from "@/lib/privileges";
import { UserCreateByAdminRequestSchema } from "@/types/dto/user";
import { requirePrivilege } from "@/utils/authentication";
import { handleError } from "@/utils/handleError";
import { audit } from "@/utils/audit";
import { enumParam, searchParam } from "@/utils/params";
import getPageInfo, { buildPagination } from "@/utils/pageInfoRetrivel";
import { userPublicFields } from "@/lib/selects";


//GET all users (?role=STAFF&status=ACTIVE&search=nimal)
export async function GET(request: NextRequest) {
  const auth = await requirePrivilege(request, PRIVILEGES.USERS_READ);
  if (auth.error) {
    return auth.error;
  }

  try {
    const params = getPageInfo(request);
    const search = searchParam(request, "search");

    const where: Prisma.UserWhereInput = {
      role: enumParam(request, "role", Role),
      status: enumParam(request, "status", UserStatus),
      OR: search
        ? [
            { email: { contains: search, mode: "insensitive" } },
            { firstName: { contains: search, mode: "insensitive" } },
            { lastName: { contains: search, mode: "insensitive" } },
          ]
        : undefined,
    };

    const [users, usersCount] = await Promise.all([
      prisma.user.findMany({
        where: where,
        skip: params.skip,
        take: params.take,
        orderBy: { createdAt: "desc" },
        select: userPublicFields,
      }),
      prisma.user.count({ where: where }),
    ]);

    return NextResponse.json({
      message: "Users fetched successfully",
      data: users,
      pagination: buildPagination(params, usersCount),
    });
  } catch (error) {
    return handleError(error);
  }
}

// Admin creates a staff / finance / admin / supplier user
export async function POST(request: NextRequest) {
  const auth = await requirePrivilege(request, PRIVILEGES.USERS_EDIT);
  if (auth.error) {
    return auth.error;
  }

  try {
    const body = UserCreateByAdminRequestSchema.parse(await request.json());

    const existingUser = await prisma.user.findUnique({
      where: { email: body.email },
    });
    if (existingUser != null) {
      return NextResponse.json(
        { message: "A user with this email already exists." },
        { status: 409 },
      );
    }

    const user = await prisma.user.create({
      data: {
        email: body.email,
        firstName: body.firstName,
        lastName: body.lastName,
        phone: body.phone,
        password: await bcrypt.hash(body.password, 12),
        role: body.role,
        divisions: body.divisions,
        privileges: body.privileges ?? ROLE_DEFAULT_PRIVILEGES[body.role],
      },
      select: userPublicFields,
    });

    await audit({
      userId: auth.user.id,
      action: "user.created",
      entityType: "USER",
      entityId: user.id,
      details: { role: user.role, divisions: user.divisions },
    });

    return NextResponse.json(
      { message: "User created successfully", data: user },
      { status: 201 },
    );
  } catch (error) {
    return handleError(error);
  }
}
