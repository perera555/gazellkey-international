// Gives every existing customer a membership card (new customers get one
// when they tick "Become a member" on sign-up) and puts every card on the
// right tier for its points. Safe to run again: existing cards are kept.
//   npm run seed:memberships
import "dotenv/config";
import prisma from "../lib/prisma";
import { ensureMembership, tierFor } from "../lib/membership";

async function main() {
  const customers = await prisma.customer.findMany({
    where: { membership: null },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  for (const customer of customers) {
    await ensureMembership(customer.id);
  }

  let retiered = 0;
  for (const card of await prisma.membership.findMany()) {
    const tier = tierFor(card.lifetimePoints);
    if (tier != card.tier) {
      await prisma.membership.update({ where: { id: card.id }, data: { tier: tier } });
      retiered++;
    }
  }
  console.log(`Issued ${customers.length} membership cards, moved ${retiered} to their right tier.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
