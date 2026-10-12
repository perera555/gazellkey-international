// Creates the first administrator. Run once after the first migration:
//   npm run seed
// Reads ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_FIRST_NAME, ADMIN_LAST_NAME from .env
import "dotenv/config";
import bcrypt from "bcryptjs";
import prisma from "../lib/prisma";
import { Role } from "../app/generated/prisma/enums";
import { ROLE_DEFAULT_PRIVILEGES } from "../lib/privileges";

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password || password.length < 12) {
    throw new Error(
      "Set ADMIN_EMAIL and ADMIN_PASSWORD (12+ characters) in .env first",
    );
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Admin ${email} already exists - nothing to do.`);
    return;
  }

  await prisma.user.create({
    data: {
      email,
      firstName: process.env.ADMIN_FIRST_NAME || "System",
      lastName: process.env.ADMIN_LAST_NAME || "Administrator",
      password: await bcrypt.hash(password, 12),
      role: Role.ADMIN,
      privileges: ROLE_DEFAULT_PRIVILEGES.ADMIN,
      divisions: ["TRAVEL", "EVENTS", "GEMS", "VEHICLES", "IMPORT", "EXPORT"],
    },
  });
  console.log(`Admin ${email} created.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
