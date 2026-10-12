import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { PRIVILEGES } from "@/lib/privileges";
import { SupplierUpdateRequestSchema } from "@/types/dto/trade";
import { hasPrivilege, requirePrivilege } from "@/utils/authentication";
import { handleError, notFound } from "@/utils/handleError";
import { audit } from "@/utils/audit";
import { IdContext } from "@/utils/params";

export async function GET(request: NextRequest, { params }: IdContext) {
  const { id } = await params;
  const auth = await requirePrivilege(request, PRIVILEGES.SUPPLIERS_READ);
  if (auth.error) {
    return auth.error;
  }

  // products supplied, with their cost only for users who may see it
  const canSeeCost = hasPrivilege(auth.user, PRIVILEGES.SUPPLIER_COST_READ);
  const productFields = {
    id: true,
    sku: true,
    name: true,
    status: true,
    supplierCost: canSeeCost,
  };

  const supplier = await prisma.supplier.findUnique({
    where: { id: id },
    include: {
      tradeProducts: { select: productFields },
      gemItems: { select: productFields },
      vehicles: {
        select: {
          id: true,
          sku: true,
          title: true,
          status: true,
          supplierCost: canSeeCost,
        },
      },
      orders: {
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { id: true, reference: true, status: true, createdAt: true },
      },
    },
  });

  if (supplier == null) {
    return notFound("Supplier");
  }
  return NextResponse.json({ message: "Supplier fetched", data: supplier });
}

export async function PUT(request: NextRequest, { params }: IdContext) {
  const { id } = await params;
  const auth = await requirePrivilege(request, PRIVILEGES.SUPPLIERS_EDIT);
  if (auth.error) {
    return auth.error;
  }

  try {
    const body = SupplierUpdateRequestSchema.parse(await request.json());

    const supplier = await prisma.supplier.update({
      where: { id: id },
      data: body,
    });

    await audit({
      userId: auth.user.id,
      action: "supplier.updated",
      entityType: "SUPPLIER",
      entityId: id,
      details: { changedFields: Object.keys(body) },
    });

    return NextResponse.json({ message: "Supplier updated", data: supplier });
  } catch (error) {
    return handleError(error);
  }
}
