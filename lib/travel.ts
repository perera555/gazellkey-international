import prisma from "@/lib/prisma";
import { Division } from "@/app/generated/prisma/enums";
import { ApiError } from "@/utils/handleError";

// A travel case (visa, ticket, insurance) is opened from a Travel enquiry,
// or directly for an existing customer (walk-in / phone).
export async function resolveTravelCaseCustomer(
  enquiryId: string | undefined,
  customerId: string | undefined,
) {
  if (enquiryId) {
    const enquiry = await prisma.enquiry.findUnique({
      where: { id: enquiryId },
    });
    if (enquiry == null) {
      throw new ApiError(404, "Enquiry not found.");
    }
    if (enquiry.division != Division.TRAVEL) {
      throw new ApiError(400, "This enquiry does not belong to Travel.");
    }
    return enquiry.customerId;
  }

  if (customerId) {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
    });
    if (customer == null) {
      throw new ApiError(404, "Customer not found.");
    }
    return customer.id;
  }

  throw new ApiError(400, "Provide an enquiryId or a customerId.");
}
