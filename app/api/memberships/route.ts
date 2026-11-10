import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/app/generated/prisma/client";
import { EntityType, MembershipTier } from "@/app/generated/prisma/enums";
import { PRIVILEGES } from "@/lib/privileges";
import { ensureMembership } from "@/lib/membership";
import { MembershipCreateRequestSchema } from "@/types/dto/membership";
import { requirePrivilege } from "@/utils/authentication";
import { handleError, notFound } from "@/utils/handleError";
import { audit } from "@/utils/audit";
import { enumParam, searchParam } from "@/utils/params";
import getPageInfo, { buildPagination } from "@/utils/pageInfoRetrivel";

const customerSelect = {
  id: true,
  reference: true,
  firstName: true,
  lastName: true,
  companyName: true,
  email: true,
  phone: true,
} as const;

// Staff: membership cards. /api/memberships?search=&tier=GOLD&customerId=
export async function GET(request: NextRequest) {
  const auth = await requirePrivilege(request, PRIVILEGES.CUSTOMERS_READ);
  if (auth.error) {
    return auth.error;
  }

  try {
    const params = getPageInfo(request);
    const search = searchParam(request, "search");
    const where: Prisma.MembershipWhereInput = {
      tier: enumParam(request, "tier", MembershipTier),
      customerId: searchParam(request, "customerId"),
      OR: search
        ? [
            { cardNumber: { contains: search, mode: "insensitive" } },
            { customer: { firstName: { contains: search, mode: "insensitive" } } },
            { customer: { lastName: { contains: search, mode: "insensitive" } } },
            { customer: { email: { contains: search, mode: "insensitive" } } },
            { customer: { reference: { contains: search, mode: "insensitive" } } },
          ]
        : undefined,
    };

    const [memberships, totalCount] = await Promise.all([
      prisma.membership.findMany({
        where: where,
        include: { customer: { select: customerSelect } },
        skip: params.skip,
        take: params.take,
        orderBy: [{ lifetimePoints: "desc" }, { joinedAt: "asc" }],
      }),
      prisma.membership.count({ where: where }),
    ]);

    return NextResponse.json({
      message: "Memberships fetched",
      data: memberships,
      pagination: buildPagination(params, totalCount),
    });
  } catch (error) {
    return handleError(error);
  }
}

// Staff: issue a card to a customer (cards are also created automatically
// on the first payment or when the customer opens My account > Membership)
export async function POST(request: NextRequest) {
  const auth = await requirePrivilege(request, PRIVILEGES.CUSTOMERS_EDIT);
  if (auth.error) {
    return auth.error;
  }

  try {
    const body = MembershipCreateRequestSchema.parse(await request.json());
    const customer = await prisma.customer.findUnique({ where: { id: body.customerId } });
    if (customer == null) {
      return notFound("Customer");
    }
    const membership = await ensureMembership(customer.id);

    await audit({
      userId: auth.user.id,
      action: "membership.issued",
      entityType: EntityType.MEMBERSHIP,
      entityId: membership.id,
    });
    return NextResponse.json({ message: "Membership card ready", data: membership }, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}
