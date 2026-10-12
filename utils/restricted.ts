import { RequestUserType } from "@/types/requestUser";
import { hasPrivilege } from "@/utils/authentication";
import { PRIVILEGES } from "@/lib/privileges";

// Supplier cost and sourcing details are never shown publicly
// (FR-GEM-07, SRS Section 8). Removes them unless the user may see them.
export function hideSupplierCost<T extends object>(
  item: T,
  user: RequestUserType | null,
): T {
  if (hasPrivilege(user, PRIVILEGES.SUPPLIER_COST_READ)) {
    return item;
  }
  const { supplierCost, supplierId, sourcingNotes, supplier, ...publicItem } =
    item as T & {
      supplierCost?: unknown;
      supplierId?: unknown;
      sourcingNotes?: unknown;
      supplier?: unknown;
    };
  return publicItem as T;
}
