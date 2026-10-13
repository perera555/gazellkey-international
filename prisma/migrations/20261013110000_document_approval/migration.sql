-- Admin approval for customer-uploaded documents of some types
CREATE TYPE "DocumentApproval" AS ENUM ('NOT_REQUIRED', 'PENDING', 'APPROVED', 'CANCELLED');

ALTER TABLE "Document"
  ADD COLUMN "approval" "DocumentApproval" NOT NULL DEFAULT 'NOT_REQUIRED',
  ADD COLUMN "reviewedById" TEXT,
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "reviewNote" TEXT;

CREATE INDEX "Document_approval_idx" ON "Document"("approval");

ALTER TABLE "Document" ADD CONSTRAINT "Document_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;