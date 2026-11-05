-- AlterEnum
ALTER TYPE "InterviewStage" ADD VALUE 'MEDICAL';

-- AlterEnum
ALTER TYPE "JobApplicationStatus" ADD VALUE 'MEDICAL';

-- DropForeignKey
ALTER TABLE "Document" DROP CONSTRAINT "Document_uploadedById_fkey";

-- AlterTable
ALTER TABLE "Document" ALTER COLUMN "uploadedById" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
