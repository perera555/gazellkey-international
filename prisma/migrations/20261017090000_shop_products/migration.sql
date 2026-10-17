-- Online shop: retail products sold only through the website's /shop page
ALTER TYPE "EntityType" ADD VALUE 'SHOP_PRODUCT';

-- CreateTable
CREATE TABLE "ShopProduct" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "brand" TEXT,
    "summary" TEXT,
    "description" TEXT NOT NULL,
    "highlights" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "specifications" JSONB,
    "unit" TEXT NOT NULL DEFAULT 'item',
    "price" DECIMAL(14,2) NOT NULL,
    "compareAtPrice" DECIMAL(14,2),
    "saleEndsAt" TIMESTAMP(3),
    "currency" TEXT NOT NULL,
    "stockQty" INTEGER NOT NULL DEFAULT 0,
    "division" "Division" NOT NULL DEFAULT 'IMPORT',
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "PublishStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopProduct_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShopProduct_sku_key" ON "ShopProduct"("sku");

-- CreateIndex
CREATE INDEX "ShopProduct_status_category_idx" ON "ShopProduct"("status", "category");
