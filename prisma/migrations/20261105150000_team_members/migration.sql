-- CreateEnum
CREATE TYPE "LeadershipRole" AS ENUM ('DIRECTOR', 'SHAREHOLDER', 'MANAGER');

-- AlterEnum
ALTER TYPE "EntityType" ADD VALUE 'TEAM_MEMBER';

-- CreateTable
CREATE TABLE "TeamMember" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "roles" "LeadershipRole"[],
    "position" TEXT NOT NULL,
    "division" "Division",
    "email" TEXT,
    "phone" TEXT,
    "bio" TEXT,
    "photo" TEXT,
    "shareholding" DECIMAL(5,2),
    "sortOrder" INTEGER NOT NULL DEFAULT 100,
    "status" "PublishStatus" NOT NULL DEFAULT 'PUBLISHED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TeamMember_status_sortOrder_idx" ON "TeamMember"("status", "sortOrder");
