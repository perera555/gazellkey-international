import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { PRIVILEGES } from "@/lib/privileges";
import { CustomerUpdateRequestSchema } from "@/types/dto/customer";
import { divisionWhere, requirePrivilege } from "@/utils/authentication";
import { handleError, notFound } from "@/utils/handleError";
import { audit } from "@/utils/audit";
import { IdContext } from "@/utils/params";
import { RecordStatus } from "@/app/generated/prisma/enums";

// Customer profile with history (enquiries, quotations, orders, payments
// and communication history). Staff only see records of their divisions.
export async function GET(request: NextRequest, { params }: IdContext) {
  const { id } = await params;
  const auth = await requirePrivilege(request, PRIVILEGES.CUSTOMERS_READ);
  if (auth.error) {
    return auth.error;
  }

  const inMyDivisions = divisionWhere(auth.user);

  const customer = await prisma.customer.findUnique({
    where: { id: id },
    include: {
      enquiries: {
        where: inMyDivisions,
        orderBy: { createdAt: "desc" },
        take: 20,
      },
      quotations: {
        where: inMyDivisions,
        orderBy: { createdAt: "desc" },
        take: 20,
      },
      orders: {
        where: inMyDivisions,
        orderBy: { createdAt: "desc" },
        take: 20,
      },
      payments: {
        where: { order: inMyDivisions },
        orderBy: { createdAt: "desc" },
        take: 20,
      },
      notifications: { orderBy: { createdAt: "desc" }, take: 50 },
    },
  });

  if (customer == null) {
    return notFound("Customer");
  }
  return NextResponse.json({ message: "Customer fetched", data: customer });
}

export async function PUT(request: NextRequest, { params }: IdContext) {
  const { id } = await params;
  const auth = await requirePrivilege(request, PRIVILEGES.CUSTOMERS_EDIT);
  if (auth.error) {
    return auth.error;
  }

  try {
    const body = CustomerUpdateRequestSchema.parse(await request.json());

    const customer = await prisma.customer.update({
      where: { id: id },
      data: body,
    });

    await audit({
      userId: auth.user.id,
      action: "customer.updated",
      entityType: "CUSTOMER",
      entityId: id,
      details: { changedFields: Object.keys(body) },
    });

    return NextResponse.json({
      message: "Customer updated successfully",
      data: customer,
    });
  } catch (error) {
    return handleError(error);
  }
}

// Soft delete: the customer is marked INACTIVE, never removed, because
// enquiries, orders, payments and documents still point at the record.
// Restore with PUT { status: "ACTIVE" }.
export async function DELETE(request: NextRequest, { params }: IdContext) {
  const { id } = await params;
  const auth = await requirePrivilege(request, PRIVILEGES.CUSTOMERS_EDIT);
  if (auth.error) {
    return auth.error;
  }

  try {
    await prisma.customer.update({
      where: { id: id },
      data: { status: RecordStatus.INACTIVE },
    });
    await audit({
      userId: auth.user.id,
      action: "customer.deleted",
      entityType: "CUSTOMER",
      entityId: id,
    });
    return NextResponse.json({ message: "Customer deleted (disabled)" });
  } catch (error) {
    return handleError(error);
  }
}
