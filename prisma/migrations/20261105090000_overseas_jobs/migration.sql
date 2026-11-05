-- CreateEnum
CREATE TYPE "JobInterviewMode" AS ENUM ('WALK_IN', 'BY_INVITATION', 'ONLINE');

-- CreateEnum
CREATE TYPE "JobApplicationStatus" AS ENUM ('APPLIED', 'SHORTLISTED', 'INTERVIEWING', 'SELECTED', 'VISA_PROCESSING', 'DEPLOYED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "InterviewStage" AS ENUM ('OFFICE', 'EMPLOYER', 'TRADE_TEST', 'EMBASSY');

-- CreateEnum
CREATE TYPE "InterviewResult" AS ENUM ('SCHEDULED', 'PASSED', 'FAILED', 'NO_SHOW', 'CANCELLED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DocumentType" ADD VALUE 'CV';
ALTER TYPE "DocumentType" ADD VALUE 'PHOTO';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EntityType" ADD VALUE 'JOB_VACANCY';
ALTER TYPE "EntityType" ADD VALUE 'JOB_APPLICATION';

-- CreateTable
CREATE TABLE "JobVacancy" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "city" TEXT,
    "employer" TEXT,
    "positions" INTEGER NOT NULL DEFAULT 1,
    "salaryMin" DECIMAL(14,2),
    "salaryMax" DECIMAL(14,2),
    "salaryCurrency" TEXT NOT NULL DEFAULT 'USD',
    "salaryPeriod" TEXT NOT NULL DEFAULT 'month',
    "contractMonths" INTEGER,
    "visaType" TEXT,
    "description" TEXT NOT NULL,
    "requirements" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "benefits" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "documentsNeeded" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ageMin" INTEGER,
    "ageMax" INTEGER,
    "gender" TEXT,
    "experienceYears" INTEGER,
    "interviewMode" "JobInterviewMode",
    "interviewAt" TIMESTAMP(3),
    "interviewPlace" TEXT,
    "interviewNotes" TEXT,
    "deadline" DATE,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "PublishStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobVacancy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobApplication" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "status" "JobApplicationStatus" NOT NULL DEFAULT 'APPLIED',
    "vacancyId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "dateOfBirth" DATE,
    "passportNumber" TEXT,
    "passportExpiry" DATE,
    "experienceYears" INTEGER,
    "currentJob" TEXT,
    "message" TEXT,
    "staffNotes" TEXT,
    "rejectReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobInterview" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "stage" "InterviewStage" NOT NULL,
    "mode" "AppointmentMode" NOT NULL DEFAULT 'IN_PERSON',
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "location" TEXT,
    "interviewer" TEXT,
    "instructions" TEXT,
    "result" "InterviewResult" NOT NULL DEFAULT 'SCHEDULED',
    "feedback" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobInterview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JobVacancy_slug_key" ON "JobVacancy"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "JobVacancy_reference_key" ON "JobVacancy"("reference");

-- CreateIndex
CREATE INDEX "JobVacancy_status_region_country_idx" ON "JobVacancy"("status", "region", "country");

-- CreateIndex
CREATE UNIQUE INDEX "JobApplication_reference_key" ON "JobApplication"("reference");

-- CreateIndex
CREATE INDEX "JobApplication_status_createdAt_idx" ON "JobApplication"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "JobApplication_vacancyId_customerId_key" ON "JobApplication"("vacancyId", "customerId");

-- CreateIndex
CREATE INDEX "JobInterview_applicationId_idx" ON "JobInterview"("applicationId");

-- CreateIndex
CREATE INDEX "JobInterview_scheduledAt_idx" ON "JobInterview"("scheduledAt");

-- AddForeignKey
ALTER TABLE "JobApplication" ADD CONSTRAINT "JobApplication_vacancyId_fkey" FOREIGN KEY ("vacancyId") REFERENCES "JobVacancy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobApplication" ADD CONSTRAINT "JobApplication_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobInterview" ADD CONSTRAINT "JobInterview_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "JobApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
