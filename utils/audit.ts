import prisma from "@/lib/prisma";
import { Prisma } from "@/app/generated/prisma/client";
import { Db } from "@/utils/reference";

// Records a sensitive action (FR-SH-12): record changes, status changes,
// approvals, refunds and views of restricted documents.
export async function audit(
  entry: {
    userId?: string | null;
    action: string; // e.g. "enquiry.status_changed"
    entityType: string; // e.g. "ENQUIRY"
    entityId?: string | null;
    details?: Prisma.InputJsonValue;
  },
  db: Db = prisma,
) {
  await db.auditLog.create({
    data: {
      userId: entry.userId ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      details: entry.details,
    },
  });
}
