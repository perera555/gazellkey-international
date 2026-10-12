import prisma from "@/lib/prisma";
import { Prisma } from "@/app/generated/prisma/client";
import { Division } from "@/app/generated/prisma/enums";

export type Db = typeof prisma | Prisma.TransactionClient;

export const DIVISION_CODES: Record<Division, string> = {
  TRAVEL: "TRV",
  EVENTS: "EVT",
  GEMS: "GEM",
  VEHICLES: "VEH",
  IMPORT: "IMP",
  EXPORT: "EXP",
};

// Creates unique, human-readable references (NFR-05), for example:
//   nextReference("TRV-ENQ") -> "TRV-ENQ-2026-00001"
//   nextReference("CUS")     -> "CUS-2026-00001"
export async function nextReference(prefix: string, db: Db = prisma) {
  const year = new Date().getFullYear();
  const key = `${prefix}-${year}`;

  // upsert + increment is a single atomic statement in PostgreSQL
  const counter = await db.counter.upsert({
    where: { key: key },
    create: { key: key, value: 1 },
    update: { value: { increment: 1 } },
  });

  return `${key}-${String(counter.value).padStart(5, "0")}`;
}

export function divisionReference(
  division: Division,
  kind: string,
  db: Db = prisma,
) {
  return nextReference(`${DIVISION_CODES[division]}-${kind}`, db);
}
