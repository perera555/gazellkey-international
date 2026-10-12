import prisma from "@/lib/prisma";
import {
  Division,
  EntityType,
  Role,
  UserStatus,
} from "@/app/generated/prisma/enums";
import { PRIVILEGES } from "@/lib/privileges";
import { customerSummaryFields } from "@/lib/selects";
import { RequestUserType } from "@/types/requestUser";
import { canAccessDivision, hasPrivilege } from "@/utils/authentication";
import { ApiError } from "@/utils/handleError";
import { isUuid } from "@/utils/params";

// Catalogue editors: staff of the division with catalogue:edit, or admins
export function isCatalogueEditor(
  user: RequestUserType | null,
  division: Division,
) {
  return (
    user != null &&
    hasPrivilege(user, PRIVILEGES.CATALOGUE_EDIT) &&
    canAccessDivision(user, division)
  );
}

// /api/gems/abc-123 can be looked up by id or by slug / sku
export function idOrKey(value: string, keyField: "slug" | "sku") {
  return isUuid(value) ? { id: value } : { [keyField]: value };
}

export async function assertSupplierExists(supplierId: string | null | undefined) {
  if (!supplierId) {
    return;
  }
  const supplier = await prisma.supplier.findUnique({
    where: { id: supplierId },
  });
  if (supplier == null) {
    throw new ApiError(400, "Supplier not found.");
  }
}

// Enquiry, quotation and order history of one catalogue item (FR-GEM-06)
export async function getItemHistory(itemType: EntityType, itemId: string) {
  const [enquiries, quotationLines, orderLines] = await Promise.all([
    prisma.enquiry.findMany({
      where: { itemType: itemType, itemId: itemId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        reference: true,
        status: true,
        createdAt: true,
        customer: { select: customerSummaryFields },
      },
    }),
    prisma.quotationItem.findMany({
      where: { itemType: itemType, itemId: itemId },
      take: 50,
      select: {
        quotation: {
          select: {
            id: true,
            reference: true,
            status: true,
            total: true,
            currency: true,
            createdAt: true,
          },
        },
      },
    }),
    prisma.orderItem.findMany({
      where: { itemType: itemType, itemId: itemId },
      take: 50,
      select: {
        order: {
          select: { id: true, reference: true, status: true, createdAt: true },
        },
      },
    }),
  ]);

  return {
    enquiries: enquiries,
    quotations: quotationLines.map((line) => line.quotation),
    orders: orderLines.map((line) => line.order),
  };
}

// Is this user allowed to be assigned to a travel case?
export async function assertTravelStaff(userId: string | null | undefined) {
  if (!userId) {
    return;
  }
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const ok =
    user != null &&
    user.status == UserStatus.ACTIVE &&
    (user.role == Role.ADMIN ||
      (user.role == Role.STAFF && user.divisions.includes(Division.TRAVEL)));
  if (!ok) {
    throw new ApiError(400, "The selected user is not active Travel staff.");
  }
}
