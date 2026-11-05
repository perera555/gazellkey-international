// The imported fertilizer sold on the website's Fertilizer page and in the shop.
// Safe to run again: added only when the SKU is missing, so price and stock
// changed in the admin portal (Catalogue > Shop products) are kept.
//   npm run seed:fertilizer
// Price LKR 150 per kg as given by the owners. The stock and the wording are
// EXAMPLES - set the real stock, bag sizes and product details in the admin.
import "dotenv/config";
import prisma from "../lib/prisma";
import { Division, PublishStatus } from "../app/generated/prisma/enums";

async function main() {
  const sku = "FERT-IMP-001";
  const existing = await prisma.shopProduct.findUnique({ where: { sku: sku } });
  if (existing) {
    console.log(`Fertilizer ${sku} already there - nothing changed.`);
    return;
  }
  await prisma.shopProduct.create({
    data: {
      sku: sku,
      name: "Imported Fertilizer",
      category: "Fertilizer",
      summary: "Quality imported fertilizer for farms, estates and home gardens.",
      description:
        "Imported fertilizer sold directly by Gazellekey International. Order online by the kilogram, or contact us for large quantities, estate and dealer prices, and delivery anywhere in Sri Lanka.",
      highlights: ["Imported by Gazellekey International", "Sold by the kilogram", "Bulk orders and delivery on request"],
      unit: "kg",
      price: 150,
      currency: "LKR",
      stockQty: 1000,
      division: Division.IMPORT,
      featured: true,
      status: PublishStatus.PUBLISHED,
    },
  });
  console.log(`Fertilizer ${sku} added: LKR 150 / kg, 1000 kg in stock (example - change it in the admin).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
