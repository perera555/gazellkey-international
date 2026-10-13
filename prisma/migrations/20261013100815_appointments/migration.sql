-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('REQUESTED', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "AppointmentMode" AS ENUM ('IN_PERSON', 'PHONE', 'VIDEO');

-- AlterEnum
ALTER TYPE "EntityType" ADD VALUE 'APPOINTMENT';

-- CreateTable
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "division" "Division" NOT NULL,
    "serviceType" TEXT,
    "subject" TEXT NOT NULL,
    "message" TEXT,
    "mode" "AppointmentMode" NOT NULL DEFAULT 'IN_PERSON',
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'REQUESTED',
    "location" TEXT,
    "meetingLink" TEXT,
    "staffNotes" TEXT,
    "cancelReason" TEXT,
    "customerId" TEXT NOT NULL,
    "enquiryId" TEXT,
    "assignedToId" TEXT,
    "googleEventId" TEXT,
    "googleEventLink" TEXT,
    "calendarSyncedAt" TIMESTAMP(3),
    "calendarError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_reference_key" ON "Appointment"("reference");

-- CreateIndex
CREATE INDEX "Appointment_startAt_status_idx" ON "Appointment"("startAt", "status");

-- CreateIndex
CREATE INDEX "Appointment_division_status_idx" ON "Appointment"("division", "status");

-- CreateIndex
CREATE INDEX "Appointment_assignedToId_idx" ON "Appointment"("assignedToId");

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_enquiryId_fkey" FOREIGN KEY ("enquiryId") REFERENCES "Enquiry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Existing users got their privileges copied when they were created, so give
-- them the new appointment privileges (same as ROLE_DEFAULT_PRIVILEGES).
UPDATE "User"
SET "privileges" = array_append("privileges", 'appointments:read')
WHERE "role" IN ('STAFF', 'FINANCE') AND NOT ('appointments:read' = ANY("privileges"));

UPDATE "User"
SET "privileges" = array_append("privileges", 'appointments:edit')
WHERE "role" = 'STAFF' AND NOT ('appointments:edit' = ANY("privileges"));
