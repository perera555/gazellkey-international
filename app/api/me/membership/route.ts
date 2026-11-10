import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { EntityType } from "@/app/generated/prisma/enums";
import { getCustomerForUser } from "@/lib/customers";
import { ensureMembership, membershipSummary } from "@/lib/membership";
import { requireUser } from "@/utils/authentication";
import { handleError } from "@/utils/handleError";
import { audit } from "@/utils/audit";

async function membershipView(customer: { id: string; firstName: string; lastName: string | null }) {
  const card = await prisma.membership.findUnique({ where: { customerId: customer.id } });
  if (card == null) {
    return null; // not a member yet
  }
  const transactions = await prisma.pointsTransaction.findMany({
    where: { membershipId: card.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, points: true, reason: true, note: true, createdAt: true },
  });
  return {
    ...card,
    memberName: [customer.firstName, customer.lastName].filter(Boolean).join(" "),
    ...membershipSummary(card),
    transactions: transactions,
  };
}

// My account > Membership: the signed-in customer's card, points and history
// (data is null when they are not a member yet)
export async function GET(request: NextRequest) {
  const auth = await requireUser(request);
  if (auth.error) {
    return auth.error;
  }

  try {
    const customer = await getCustomerForUser(auth.user.id);
    const data = customer ? await membershipView(customer) : null;
    return NextResponse.json({ message: data ? "Membership fetched" : "Not a member yet", data: data });
  } catch (error) {
    return handleError(error);
  }
}

// "Become a member" from My account: issues the card in the customer's name
export async function POST(request: NextRequest) {
  const auth = await requireUser(request);
  if (auth.error) {
    return auth.error;
  }

  try {
    const customer = await getCustomerForUser(auth.user.id);
    if (customer == null) {
      return NextResponse.json({ message: "Only customer accounts can become members." }, { status: 400 });
    }
    const card = await ensureMembership(customer.id);
    await audit({
      userId: auth.user.id,
      action: "membership.joined",
      entityType: EntityType.MEMBERSHIP,
      entityId: card.id,
    });
    return NextResponse.json({ message: "Welcome to Gazellekey membership", data: await membershipView(customer) }, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}
