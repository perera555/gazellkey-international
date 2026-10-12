import prisma from "@/lib/prisma";
import { compare } from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { UserStatus } from "@/app/generated/prisma/enums";
import { LoginRequestSchema } from "@/types/dto/user";
import {
  createLoginToken,
  LOGIN_COOKIE,
  TOKEN_LIFETIME_SECONDS,
} from "@/utils/authentication";
import { handleError } from "@/utils/handleError";

export async function POST(request: NextRequest) {
  try {
    const body = LoginRequestSchema.parse(await request.json());

    const user = await prisma.user.findUnique({
      where: { email: body.email },
    });

    // Same message for "no such email" and "wrong password",
    // so nobody can use the login form to find registered emails.
    const passwordValid =
      user != null && (await compare(body.password, user.password));

    if (user == null || !passwordValid) {
      return NextResponse.json(
        { message: "Invalid email or password" },
        { status: 401 },
      );
    }

    //baned or not active user
    if (user.status != UserStatus.ACTIVE) {
      return NextResponse.json(
        {
          message: "User account is not active. please contact administrator.",
        },
        { status: 403 },
      );
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() },
    });

    const token = await createLoginToken(user.id);

    const response = NextResponse.json({
      message: "Login successful",
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        divisions: user.divisions,
      },
    });

    response.cookies.set({
      name: LOGIN_COOKIE,
      value: token,
      httpOnly: true, // JavaScript in the browser cannot read it
      secure: process.env.NODE_ENV == "production", // HTTPS only in production
      sameSite: "lax",
      path: "/",
      maxAge: TOKEN_LIFETIME_SECONDS,
    });
    return response;
  } catch (error) {
    return handleError(error);
  }
}
