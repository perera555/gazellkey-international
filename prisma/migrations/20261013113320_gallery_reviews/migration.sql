-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PUBLISHED', 'HIDDEN');

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "division" "Division" NOT NULL DEFAULT 'TRAVEL',
    "tourId" TEXT,
    "rating" INTEGER NOT NULL,
    "title" TEXT,
    "body" TEXT NOT NULL,
    "tripDate" TIMESTAMP(3),
    "status" "ReviewStatus" NOT NULL DEFAULT 'PUBLISHED',
    "customerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "removedReason" TEXT,
    "removedById" TEXT,
    "removedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GalleryPhoto" (
    "id" TEXT NOT NULL,
    "division" "Division" NOT NULL DEFAULT 'TRAVEL',
    "title" TEXT NOT NULL,
    "caption" TEXT,
    "place" TEXT,
    "country" TEXT,
    "takenAt" TIMESTAMP(3),
    "imageUrl" TEXT,
    "storageKey" TEXT,
    "mimeType" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" "PublishStatus" NOT NULL DEFAULT 'PUBLISHED',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GalleryPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Review_status_division_createdAt_idx" ON "Review"("status", "division", "createdAt");

-- CreateIndex
CREATE INDEX "Review_tourId_status_idx" ON "Review"("tourId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "GalleryPhoto_storageKey_key" ON "GalleryPhoto"("storageKey");

-- CreateIndex
CREATE INDEX "GalleryPhoto_division_status_sortOrder_idx" ON "GalleryPhoto"("division", "status", "sortOrder");

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_tourId_fkey" FOREIGN KEY ("tourId") REFERENCES "TourPackage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_removedById_fkey" FOREIGN KEY ("removedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GalleryPhoto" ADD CONSTRAINT "GalleryPhoto_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Stars are always 1 - 5, whatever the API sends
ALTER TABLE "Review" ADD CONSTRAINT "Review_rating_check" CHECK ("rating" BETWEEN 1 AND 5);

-- Starter gallery from the site photography (in /public/images of the
-- website and admin). Staff can edit, hide or delete these in the admin.
INSERT INTO "GalleryPhoto" ("id", "title", "caption", "place", "country", "imageUrl", "sortOrder", "updatedAt") VALUES
  (gen_random_uuid()::text, 'Tea country by train', 'The famous blue train through the hills of Ella.', 'Ella', 'Sri Lanka', '/images/travel-ella.jpg', 10, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Sunrise at Sigiriya', 'Climbing the Lion Rock fortress before the heat.', 'Sigiriya', 'Sri Lanka', '/images/travel-sigiriya.jpg', 20, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Island lagoons', 'Water villas and coral reefs on a family holiday.', 'Malé Atoll', 'Maldives', '/images/travel-maldives.jpg', 30, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Temples and long-tail boats', 'A week of markets, temples and islands.', 'Phuket', 'Thailand', '/images/travel-thailand.jpg', 40, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'City lights', 'Gardens by the Bay on a Singapore city break.', 'Marina Bay', 'Singapore', '/images/travel-singapore.jpg', 50, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Golden beaches', 'The south coast, just a few hours from Colombo.', 'Mirissa', 'Sri Lanka', '/images/hero-beach.jpg', 60, CURRENT_TIMESTAMP);
