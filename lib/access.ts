import { Division } from "@/app/generated/prisma/enums";
import { RequestUserType } from "@/types/requestUser";
import { canAccessDivision, hasPrivilege } from "@/utils/authentication";
import { getCustomerForUser } from "@/lib/customers";

// A record that belongs to one customer and one division
// (enquiry, quotation, order, payment, visa case ...)
type OwnedRecord = { customerId: string; division: Division };

// Staff with the privilege may see records of their divisions;
// a customer may see their own records ("Own only" in SRS Section 8).
export async function canViewOwnedRecord(
  user: RequestUserType,
  record: OwnedRecord,
  staffPrivilege: string,
) {
  if (hasPrivilege(user, staffPrivilege)) {
    return canAccessDivision(user, record.division);
  }
  return isRecordOwner(user, record);
}

export async function isRecordOwner(
  user: RequestUserType,
  record: { customerId: string | null },
) {
  if (record.customerId == null) {
    return false;
  }
  const customer = await getCustomerForUser(user.id);
  return customer != null && customer.id == record.customerId;
}
