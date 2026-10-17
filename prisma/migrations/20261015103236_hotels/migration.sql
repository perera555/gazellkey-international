-- AlterEnum
ALTER TYPE "EntityType" ADD VALUE 'HOTEL';

-- CreateTable
CREATE TABLE "Hotel" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "starRating" INTEGER,
    "address" TEXT,
    "summary" TEXT NOT NULL,
    "facilities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "roomTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "checkInTime" TEXT,
    "checkOutTime" TEXT,
    "pricingMode" "PricingMode" NOT NULL DEFAULT 'ON_REQUEST',
    "price" DECIMAL(14,2),
    "currency" TEXT,
    "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "PublishStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Hotel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Hotel_slug_key" ON "Hotel"("slug");

-- CreateIndex
CREATE INDEX "Hotel_country_idx" ON "Hotel"("country");

-- CreateIndex
CREATE INDEX "Hotel_city_idx" ON "Hotel"("city");
