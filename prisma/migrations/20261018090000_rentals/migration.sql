-- CreateEnum
CREATE TYPE "RentalEventType" AS ENUM ('WEDDING', 'FUNERAL', 'BIRTHDAY', 'RELIGIOUS', 'CORPORATE', 'PARTY', 'OTHER');

-- CreateEnum
CREATE TYPE "RentalStatus" AS ENUM ('REQUESTED', 'CONFIRMED', 'DELIVERED', 'RETURNED', 'CANCELLED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EntityType" ADD VALUE 'RENTAL_ITEM';
ALTER TYPE "EntityType" ADD VALUE 'RENTAL_BOOKING';

-- CreateTable
CREATE TABLE "RentalItem" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "highlights" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "specifications" JSONB,
    "unit" TEXT NOT NULL DEFAULT 'piece',
    "pricePerDay" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'LKR',
    "quantityOwned" INTEGER NOT NULL DEFAULT 1,
    "minQuantity" INTEGER NOT NULL DEFAULT 1,
    "deposit" DECIMAL(14,2),
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "PublishStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RentalItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RentalBooking" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "status" "RentalStatus" NOT NULL DEFAULT 'REQUESTED',
    "eventType" "RentalEventType" NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "venue" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "guests" INTEGER,
    "needsDelivery" BOOLEAN NOT NULL DEFAULT true,
    "needsSetup" BOOLEAN NOT NULL DEFAULT false,
    "message" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'LKR',
    "estimatedTotal" DECIMAL(14,2) NOT NULL,
    "quotedTotal" DECIMAL(14,2),
    "staffNotes" TEXT,
    "cancelReason" TEXT,
    "customerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RentalBooking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RentalBookingItem" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "rentalItemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "pricePerDay" DECIMAL(14,2) NOT NULL,
    "days" INTEGER NOT NULL,
    "lineTotal" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "RentalBookingItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RentalItem_sku_key" ON "RentalItem"("sku");

-- CreateIndex
CREATE INDEX "RentalItem_status_category_idx" ON "RentalItem"("status", "category");

-- CreateIndex
CREATE UNIQUE INDEX "RentalBooking_reference_key" ON "RentalBooking"("reference");

-- CreateIndex
CREATE INDEX "RentalBooking_status_startDate_idx" ON "RentalBooking"("status", "startDate");

-- CreateIndex
CREATE INDEX "RentalBookingItem_rentalItemId_idx" ON "RentalBookingItem"("rentalItemId");

-- AddForeignKey
ALTER TABLE "RentalBooking" ADD CONSTRAINT "RentalBooking_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RentalBookingItem" ADD CONSTRAINT "RentalBookingItem_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "RentalBooking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RentalBookingItem" ADD CONSTRAINT "RentalBookingItem_rentalItemId_fkey" FOREIGN KEY ("rentalItemId") REFERENCES "RentalItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
