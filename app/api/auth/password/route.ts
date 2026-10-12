import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { ChangePasswordRequestSchema } from "@/types/dto/user";
import { requireUser } from "@/utils/authentication";
import { handleError } from "@/utils/handleError";
import { audit } from "@/utils/audit";

export async function PUT(request: NextRequest) {
  const auth = await requireUser(request);
  if (auth.error) {
    return auth.error;
  }

  try {
    const body = ChangePasswordRequestSchema.parse(await request.json());

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: auth.user.id },
    });

    const currentValid = await bcrypt.compare(
      body.currentPassword,
      user.password,
    );
    if (!currentValid) {
      return NextResponse.json(
        { message: "Current password is incorrect" },
        { status: 400 },
      );
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { password: await bcrypt.hash(body.newPassword, 12) },
    });
    await audit({
      userId: user.id,
      action: "user.password_changed",
      entityType: "USER",
      entityId: user.id,
    });

    return NextResponse.json({ message: "Password changed successfully" });
  } catch (error) {
    return handleError(error);
  }
}
