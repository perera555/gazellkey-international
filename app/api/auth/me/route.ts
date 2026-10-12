import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/utils/authentication";
import { getCustomerForUser } from "@/lib/customers";

// Who am I? Used by the frontend to show the right menu / portal.
export async function GET(request: NextRequest) {
  const auth = await requireUser(request);
  if (auth.error) {
    return auth.error;
  }

  const customer = await getCustomerForUser(auth.user.id);

  return NextResponse.json({
    message: "Current user",
    user: auth.user,
    customer: customer,
  });
}
