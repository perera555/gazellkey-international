import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireUser } from "@/utils/authentication";
import { getCustomerForUser } from "@/lib/customers";
import { photoUrlOf } from "@/lib/profilePhoto";

// Who am I? Used by the frontend to show the right menu / portal.
export async function GET(request: NextRequest) {
  const auth = await requireUser(request);
  if (auth.error) {
    return auth.error;
  }

  const [customer, photo] = await Promise.all([
    getCustomerForUser(auth.user.id),
    prisma.user.findUnique({
      where: { id: auth.user.id },
      select: { id: true, profileImage: true, updatedAt: true },
    }),
  ]);

  return NextResponse.json({
    message: "Current user",
    user: { ...auth.user, photoUrl: photo ? photoUrlOf(photo) : null },
    customer: customer,
  });
}
