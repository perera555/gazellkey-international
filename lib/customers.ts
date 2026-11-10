import prisma from "@/lib/prisma";
import { CustomerType } from "@/app/generated/prisma/enums";
import { ensureMembership } from "@/lib/membership";
import { Db, nextReference } from "@/utils/reference";

type CustomerContact = {
  email: string;
  firstName: string;
  lastName?: string | null;
  companyName?: string | null;
  phone?: string | null;
  country?: string | null;
  userId?: string | null;
};

// FR-SH-03: customer records are created or matched from enquiries.
// One customer (matched by email) can have many enquiries, quotations, payments...
export async function findOrCreateCustomer(
  contact: CustomerContact,
  db: Db = prisma,
) {
  // a signed-in user always uses their own customer record
  if (contact.userId) {
    const own = await db.customer.findUnique({
      where: { userId: contact.userId },
    });
    if (own != null) {
      return own;
    }
  }

  const email = contact.email.trim().toLowerCase();

  const existing = await db.customer.findUnique({ where: { email: email } });
  if (existing != null) {
    // link the website account if the customer signed up later
    if (contact.userId && existing.userId == null) {
      return db.customer.update({
        where: { id: existing.id },
        data: { userId: contact.userId },
      });
    }
    return existing;
  }

  const customer = await db.customer.create({
    data: {
      reference: await nextReference("CUS", db),
      email: email,
      firstName: contact.firstName,
      lastName: contact.lastName,
      companyName: contact.companyName,
      type: contact.companyName ? CustomerType.BUSINESS : CustomerType.INDIVIDUAL,
      phone: contact.phone,
      country: contact.country,
      userId: contact.userId,
    },
  });
  // every customer starts with a Blue (beginner) membership card
  await ensureMembership(customer.id, db);
  return customer;
}

// The customer record that belongs to a signed-in website user
export function getCustomerForUser(userId: string) {
  return prisma.customer.findUnique({ where: { userId: userId } });
}
