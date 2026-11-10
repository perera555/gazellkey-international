import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { PRIVILEGES } from "@/lib/privileges";
import { membershipSummary } from "@/lib/membership";
import { requirePrivilege } from "@/utils/authentication";
import { handleError, notFound } from "@/utils/handleError";
import { IdContext } from "@/utils/params";

// Staff: one membership card with its full points history
export async function GET(request: NextRequest, { params }: IdContext) {
  const { id } = await params;
  const auth = await requirePrivilege(request, PRIVILEGES.CUSTOMERS_READ);
  if (auth.error) {
    return auth.error;
  }

  try {
    const membership = await prisma.membership.findUnique({
      where: { id: id },
      include: {
        customer: { select: { id: true, reference: true, firstName: true, lastName: true, companyName: true, email: true, phone: true } },
        transactions: { orderBy: { createdAt: "desc" }, take: 200 },
      },
    });
    if (membership == null) {
      return notFound("Membership");
    }
    return NextResponse.json({ message: "Membership fetched", data: { ...membership, ...membershipSummary(membership) } });
  } catch (error) {
    return handleError(error);
  }
}
