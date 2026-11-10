-- CreateEnum
CREATE TYPE "MembershipTier" AS ENUM ('BLUE', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM');

-- CreateEnum
CREATE TYPE "PointsReason" AS ENUM ('PURCHASE', 'REFUND', 'REDEMPTION', 'ADJUSTMENT');

-- AlterEnum
ALTER TYPE "EntityType" ADD VALUE 'MEMBERSHIP';

-- AlterEnum
ALTER TYPE "LeadershipRole" ADD VALUE 'TEAM';

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "cardNumber" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "tier" "MembershipTier" NOT NULL DEFAULT 'BLUE',
    "pointsBalance" INTEGER NOT NULL DEFAULT 0,
    "lifetimePoints" INTEGER NOT NULL DEFAULT 0,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PointsTransaction" (
    "id" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "reason" "PointsReason" NOT NULL,
    "note" TEXT,
    "paymentId" TEXT,
    "refundId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PointsTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Membership_cardNumber_key" ON "Membership"("cardNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_customerId_key" ON "Membership"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "PointsTransaction_paymentId_key" ON "PointsTransaction"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "PointsTransaction_refundId_key" ON "PointsTransaction"("refundId");

-- CreateIndex
CREATE INDEX "PointsTransaction_membershipId_createdAt_idx" ON "PointsTransaction"("membershipId", "createdAt");

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointsTransaction" ADD CONSTRAINT "PointsTransaction_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
