import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// In development the client is kept on `global`, so hot reloads do not open a
// new database pool each time. The PrismaClient class it was made from is kept
// too: after `prisma generate` (a schema change) the class is new, and a fresh
// client is created - so new tables work without restarting `npm run dev`.
const globalForPrisma = global as unknown as {
  prisma?: PrismaClient;
  prismaClass?: typeof PrismaClient;
};

function createClient() {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  });
  return new PrismaClient({ adapter });
}

const cached = globalForPrisma.prismaClass === PrismaClient ? globalForPrisma.prisma : undefined;
if (globalForPrisma.prisma && cached == undefined) {
  void globalForPrisma.prisma.$disconnect().catch(() => {}); // the old client's pool
}
const prisma = cached ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.prismaClass = PrismaClient;
}

export default prisma;
