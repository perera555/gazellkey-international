import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { Role } from "@/app/generated/prisma/enums";
import { UserRegistrationRequestSchema } from "@/types/dto/user";
import { findOrCreateCustomer } from "@/lib/customers";
import { handleError } from "@/utils/handleError";

// Public customer sign-up (FR-SH-04). Staff accounts are created by an
// administrator through POST /api/users.
export async function POST(request: NextRequest) {
  try {
    const body = UserRegistrationRequestSchema.parse(await request.json());

    const existingUser = await prisma.user.findUnique({
      where: { email: body.email },
    });
    if (existingUser != null) {
      return NextResponse.json(
        { message: "A user with this email already exists." },
        { status: 409 },
      );
    }

    const passwordHash = await bcrypt.hash(body.password, 12);

    await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: body.email,
          firstName: body.firstName,
          lastName: body.lastName,
          password: passwordHash,
          phone: body.phone,
          role: Role.CUSTOMER,
        },
      });

      // link (or create) the customer record so earlier enquiries made
      // with the same email appear in the new account
      await findOrCreateCustomer(
        {
          email: body.email,
          firstName: body.firstName,
          lastName: body.lastName,
          phone: body.phone,
          userId: user.id,
        },
        tx,
      );
    });

    return NextResponse.json(
      { message: "User created successfully" },
      { status: 201 },
    );
  } catch (error) {
    return handleError(error);
  }
}
