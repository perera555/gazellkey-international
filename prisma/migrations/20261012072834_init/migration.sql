-- CreateEnum
CREATE TYPE "Role" AS ENUM ('CUSTOMER', 'STAFF', 'FINANCE', 'ADMIN', 'SUPPLIER');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'BANNED');

-- CreateEnum
CREATE TYPE "Division" AS ENUM ('TRAVEL', 'EVENTS', 'GEMS', 'VEHICLES', 'IMPORT', 'EXPORT');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "EnquiryStatus" AS ENUM ('NEW', 'ASSIGNED', 'IN_PROGRESS', 'AWAITING_CUSTOMER', 'QUOTED', 'CONVERTED', 'CLOSED_LOST', 'CANCELLED');

-- CreateEnum
CREATE TYPE "QuotationStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'REVISED');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'CONFIRMED', 'IN_FULFILMENT', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'PARTIALLY_REFUNDED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('BANK_TRANSFER', 'CASH', 'CARD_ONLINE', 'OTHER');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('PASSPORT', 'VISA_CHECKLIST', 'VISA_DOCUMENT', 'TICKET', 'ITINERARY', 'INSURANCE_POLICY', 'CONFIRMATION', 'CERTIFICATE', 'VALUATION', 'OWNERSHIP', 'INVOICE', 'PACKING_LIST', 'PERMIT', 'SHIPPING_RECORD', 'OTHER');

-- CreateEnum
CREATE TYPE "DocumentAccess" AS ENUM ('PUBLIC', 'CUSTOMER', 'STAFF', 'RESTRICTED');

-- CreateEnum
CREATE TYPE "EntityType" AS ENUM ('CUSTOMER', 'ENQUIRY', 'QUOTATION', 'ORDER', 'PAYMENT', 'VISA_CASE', 'TICKET_REQUEST', 'INSURANCE_REQUEST', 'TOUR_PACKAGE', 'EVENT', 'EVENT_REGISTRATION', 'GEM_ITEM', 'VEHICLE_LISTING', 'TRADE_PRODUCT', 'SUPPLIER', 'SHIPMENT');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'SMS');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "PublishStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PricingMode" AS ENUM ('FIXED', 'ON_REQUEST');

-- CreateEnum
CREATE TYPE "Availability" AS ENUM ('AVAILABLE', 'RESERVED', 'SOLD');

-- CreateEnum
CREATE TYPE "CustomerType" AS ENUM ('INDIVIDUAL', 'BUSINESS');

-- CreateEnum
CREATE TYPE "TourType" AS ENUM ('OUTBOUND', 'INBOUND');

-- CreateEnum
CREATE TYPE "VisaStage" AS ENUM ('ENQUIRY', 'DOCUMENTS_REQUESTED', 'DOCUMENTS_RECEIVED', 'SUBMITTED', 'DECISION_RECEIVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('REQUESTED', 'QUOTED', 'AWAITING_SUPPLIER_CONFIRMATION', 'CONFIRMED', 'ISSUED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InsuranceStatus" AS ENUM ('REQUESTED', 'QUOTED', 'POLICY_ISSUED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('TRADE_SHOW', 'EXHIBITION', 'WORKSHOP', 'CONFERENCE', 'FOOD_FESTIVAL', 'SPORTS_TOURNAMENT');

-- CreateEnum
CREATE TYPE "RegistrationStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "GemItemType" AS ENUM ('GEMSTONE', 'JEWELLERY');

-- CreateEnum
CREATE TYPE "VehicleListingType" AS ENUM ('NEW_VEHICLE', 'USED_VEHICLE', 'SPARE_PART', 'HEAVY_MACHINERY');

-- CreateEnum
CREATE TYPE "TradeDirection" AS ENUM ('IMPORT', 'EXPORT');

-- CreateEnum
CREATE TYPE "TradeCategory" AS ENUM ('SPORTS_ITEMS', 'SHOES', 'CLOTHES', 'FANCY_ITEMS', 'ELECTRICAL_ITEMS', 'COMPUTERS_HARDWARE_PHONES', 'FOOD_ITEMS', 'POWER_HAND_TOOLS', 'COFFEE', 'CHOCOLATE', 'TEA', 'SPICES', 'FRUITS_VEGETABLES');

-- CreateEnum
CREATE TYPE "ShipmentStatus" AS ENUM ('ORDER_CONFIRMED', 'GOODS_READY', 'DOCUMENTS_PREPARED', 'SHIPPED', 'IN_TRANSIT', 'ARRIVED_CLEARED', 'DELIVERED', 'DELAYED');

-- CreateEnum
CREATE TYPE "RecordStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'CUSTOMER',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "privileges" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "divisions" "Division"[] DEFAULT ARRAY[]::"Division"[],
    "profileImage" TEXT NOT NULL DEFAULT 'images/default-profile.png',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastLogin" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "type" "CustomerType" NOT NULL DEFAULT 'INDIVIDUAL',
    "firstName" TEXT NOT NULL,
    "lastName" TEXT,
    "companyName" TEXT,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "country" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Enquiry" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "division" "Division" NOT NULL,
    "serviceType" TEXT,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "priority" "Priority" NOT NULL DEFAULT 'NORMAL',
    "status" "EnquiryStatus" NOT NULL DEFAULT 'NEW',
    "source" TEXT NOT NULL DEFAULT 'WEBSITE',
    "details" JSONB,
    "itemType" "EntityType",
    "itemId" TEXT,
    "customerId" TEXT NOT NULL,
    "assignedToId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Enquiry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnquiryNote" (
    "id" TEXT NOT NULL,
    "enquiryId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isInternal" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EnquiryNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quotation" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "division" "Division" NOT NULL,
    "status" "QuotationStatus" NOT NULL DEFAULT 'DRAFT',
    "enquiryId" TEXT,
    "customerId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tax" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "terms" TEXT,
    "shippingTerms" TEXT,
    "notes" TEXT,
    "revisedFromId" TEXT,
    "createdById" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "responseNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuotationItem" (
    "id" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "itemType" "EntityType",
    "itemId" TEXT,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'unit',
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "lineTotal" DECIMAL(14,2) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "QuotationItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "division" "Division" NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "quotationId" TEXT,
    "customerId" TEXT NOT NULL,
    "supplierId" TEXT,
    "currency" TEXT NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "amountPaid" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "shippingTerms" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "itemType" "EntityType",
    "itemId" TEXT,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'unit',
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "lineTotal" DECIMAL(14,2) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "providerReference" TEXT,
    "note" TEXT,
    "refundedAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "confirmedById" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "providerReference" TEXT,
    "processedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "type" "DocumentType" NOT NULL,
    "title" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "accessLevel" "DocumentAccess" NOT NULL DEFAULT 'STAFF',
    "division" "Division",
    "entityType" "EntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "customerId" TEXT,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "recipient" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'QUEUED',
    "error" TEXT,
    "customerId" TEXT,
    "entityType" "EntityType",
    "entityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteContent" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" JSONB NOT NULL,
    "status" "PublishStatus" NOT NULL DEFAULT 'DRAFT',
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteContent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Counter" (
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Counter_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "TourPackage" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "tourType" "TourType" NOT NULL,
    "destination" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "itinerary" JSONB NOT NULL,
    "durationDays" INTEGER NOT NULL,
    "departureDates" TIMESTAMP(3)[] DEFAULT ARRAY[]::TIMESTAMP(3)[],
    "isCustomisable" BOOLEAN NOT NULL DEFAULT false,
    "inclusions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "exclusions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "minGroupSize" INTEGER,
    "maxGroupSize" INTEGER,
    "pricingMode" "PricingMode" NOT NULL DEFAULT 'ON_REQUEST',
    "price" DECIMAL(14,2),
    "currency" TEXT,
    "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "PublishStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TourPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisaCase" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "enquiryId" TEXT,
    "customerId" TEXT NOT NULL,
    "destinationCountry" TEXT NOT NULL,
    "visaType" TEXT NOT NULL,
    "stage" "VisaStage" NOT NULL DEFAULT 'ENQUIRY',
    "applicants" JSONB NOT NULL,
    "checklist" JSONB NOT NULL,
    "decision" TEXT,
    "notes" TEXT,
    "assignedToId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VisaCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketRequest" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "enquiryId" TEXT,
    "customerId" TEXT NOT NULL,
    "tripType" TEXT NOT NULL,
    "segments" JSONB NOT NULL,
    "passengers" JSONB NOT NULL,
    "passengerCount" INTEGER NOT NULL,
    "cabinClass" TEXT,
    "status" "TicketStatus" NOT NULL DEFAULT 'REQUESTED',
    "fareAmount" DECIMAL(14,2),
    "currency" TEXT,
    "airline" TEXT,
    "supplierReference" TEXT,
    "pnr" TEXT,
    "ticketNumbers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "assignedToId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TicketRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsuranceRequest" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "enquiryId" TEXT,
    "customerId" TEXT NOT NULL,
    "travellers" JSONB NOT NULL,
    "destination" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "coverageType" TEXT,
    "status" "InsuranceStatus" NOT NULL DEFAULT 'REQUESTED',
    "premium" DECIMAL(14,2),
    "currency" TEXT,
    "insurer" TEXT,
    "policyNumber" TEXT,
    "notes" TEXT,
    "assignedToId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InsuranceRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "eventType" "EventType" NOT NULL,
    "description" TEXT NOT NULL,
    "venue" TEXT NOT NULL,
    "city" TEXT,
    "country" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "organiser" TEXT,
    "capacity" INTEGER,
    "registeredCount" INTEGER NOT NULL DEFAULT 0,
    "registrationOpen" BOOLEAN NOT NULL DEFAULT true,
    "fee" DECIMAL(14,2),
    "currency" TEXT,
    "terms" TEXT,
    "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "PublishStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventRegistration" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "seats" INTEGER NOT NULL DEFAULT 1,
    "participants" JSONB NOT NULL,
    "status" "RegistrationStatus" NOT NULL DEFAULT 'PENDING',
    "orderId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GemItem" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "itemType" "GemItemType" NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "weight" DECIMAL(10,3),
    "weightUnit" TEXT NOT NULL DEFAULT 'ct',
    "colour" TEXT,
    "cut" TEXT,
    "shape" TEXT,
    "clarity" TEXT,
    "origin" TEXT,
    "treatment" TEXT,
    "metal" TEXT,
    "pricingMode" "PricingMode" NOT NULL DEFAULT 'ON_REQUEST',
    "price" DECIMAL(14,2),
    "currency" TEXT,
    "supplierCost" DECIMAL(14,2),
    "sourcingNotes" TEXT,
    "supplierId" TEXT,
    "availability" "Availability" NOT NULL DEFAULT 'AVAILABLE',
    "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "PublishStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GemItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleListing" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "listingType" "VehicleListingType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "make" TEXT,
    "model" TEXT,
    "year" INTEGER,
    "condition" TEXT,
    "mileageKm" INTEGER,
    "operatingHours" INTEGER,
    "fuelType" TEXT,
    "transmission" TEXT,
    "partNumber" TEXT,
    "compatibleWith" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "specifications" JSONB,
    "stock" INTEGER NOT NULL DEFAULT 1,
    "pricingMode" "PricingMode" NOT NULL DEFAULT 'ON_REQUEST',
    "price" DECIMAL(14,2),
    "currency" TEXT,
    "supplierCost" DECIMAL(14,2),
    "supplierId" TEXT,
    "availability" "Availability" NOT NULL DEFAULT 'AVAILABLE',
    "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "PublishStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VehicleListing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeProduct" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "direction" "TradeDirection" NOT NULL,
    "category" "TradeCategory" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "origin" TEXT,
    "specifications" JSONB,
    "packaging" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'kg',
    "minimumOrderQty" DECIMAL(14,3),
    "stockQty" DECIMAL(14,3),
    "requiresPermit" BOOLEAN NOT NULL DEFAULT false,
    "pricingMode" "PricingMode" NOT NULL DEFAULT 'ON_REQUEST',
    "price" DECIMAL(14,2),
    "currency" TEXT,
    "supplierCost" DECIMAL(14,2),
    "supplierId" TEXT,
    "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "PublishStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TradeProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "country" TEXT,
    "address" TEXT,
    "productsSupplied" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "paymentTerms" TEXT,
    "notes" TEXT,
    "divisions" "Division"[] DEFAULT ARRAY[]::"Division"[],
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shipment" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "direction" "TradeDirection" NOT NULL,
    "status" "ShipmentStatus" NOT NULL DEFAULT 'ORDER_CONFIRMED',
    "carrier" TEXT,
    "trackingNumber" TEXT,
    "origin" TEXT,
    "destination" TEXT,
    "incoterm" TEXT,
    "expectedDeparture" TIMESTAMP(3),
    "expectedArrival" TIMESTAMP(3),
    "actualArrival" TIMESTAMP(3),
    "isDelayed" BOOLEAN NOT NULL DEFAULT false,
    "delayReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipmentMilestone" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "status" "ShipmentStatus" NOT NULL,
    "location" TEXT,
    "note" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "ShipmentMilestone_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_reference_key" ON "Customer"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_email_key" ON "Customer"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_userId_key" ON "Customer"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Enquiry_reference_key" ON "Enquiry"("reference");

-- CreateIndex
CREATE INDEX "Enquiry_division_status_idx" ON "Enquiry"("division", "status");

-- CreateIndex
CREATE INDEX "Enquiry_assignedToId_idx" ON "Enquiry"("assignedToId");

-- CreateIndex
CREATE UNIQUE INDEX "Quotation_reference_key" ON "Quotation"("reference");

-- CreateIndex
CREATE INDEX "Quotation_division_status_idx" ON "Quotation"("division", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Order_reference_key" ON "Order"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "Order_quotationId_key" ON "Order"("quotationId");

-- CreateIndex
CREATE INDEX "Order_division_status_idx" ON "Order"("division", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_reference_key" ON "Payment"("reference");

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "Payment"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Document_storageKey_key" ON "Document"("storageKey");

-- CreateIndex
CREATE INDEX "Document_entityType_entityId_idx" ON "Document"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "Document_customerId_idx" ON "Document"("customerId");

-- CreateIndex
CREATE INDEX "Notification_customerId_idx" ON "Notification"("customerId");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SiteContent_key_key" ON "SiteContent"("key");

-- CreateIndex
CREATE UNIQUE INDEX "TourPackage_slug_key" ON "TourPackage"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "VisaCase_reference_key" ON "VisaCase"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "VisaCase_enquiryId_key" ON "VisaCase"("enquiryId");

-- CreateIndex
CREATE UNIQUE INDEX "TicketRequest_reference_key" ON "TicketRequest"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "TicketRequest_enquiryId_key" ON "TicketRequest"("enquiryId");

-- CreateIndex
CREATE UNIQUE INDEX "InsuranceRequest_reference_key" ON "InsuranceRequest"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "InsuranceRequest_enquiryId_key" ON "InsuranceRequest"("enquiryId");

-- CreateIndex
CREATE UNIQUE INDEX "Event_slug_key" ON "Event"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "EventRegistration_reference_key" ON "EventRegistration"("reference");

-- CreateIndex
CREATE INDEX "EventRegistration_eventId_status_idx" ON "EventRegistration"("eventId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "GemItem_sku_key" ON "GemItem"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "VehicleListing_sku_key" ON "VehicleListing"("sku");

-- CreateIndex
CREATE INDEX "VehicleListing_listingType_status_idx" ON "VehicleListing"("listingType", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TradeProduct_sku_key" ON "TradeProduct"("sku");

-- CreateIndex
CREATE INDEX "TradeProduct_direction_category_status_idx" ON "TradeProduct"("direction", "category", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_reference_key" ON "Supplier"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_reference_key" ON "Shipment"("reference");

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enquiry" ADD CONSTRAINT "Enquiry_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enquiry" ADD CONSTRAINT "Enquiry_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnquiryNote" ADD CONSTRAINT "EnquiryNote_enquiryId_fkey" FOREIGN KEY ("enquiryId") REFERENCES "Enquiry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnquiryNote" ADD CONSTRAINT "EnquiryNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_enquiryId_fkey" FOREIGN KEY ("enquiryId") REFERENCES "Enquiry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationItem" ADD CONSTRAINT "QuotationItem_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_processedById_fkey" FOREIGN KEY ("processedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisaCase" ADD CONSTRAINT "VisaCase_enquiryId_fkey" FOREIGN KEY ("enquiryId") REFERENCES "Enquiry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisaCase" ADD CONSTRAINT "VisaCase_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisaCase" ADD CONSTRAINT "VisaCase_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketRequest" ADD CONSTRAINT "TicketRequest_enquiryId_fkey" FOREIGN KEY ("enquiryId") REFERENCES "Enquiry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketRequest" ADD CONSTRAINT "TicketRequest_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketRequest" ADD CONSTRAINT "TicketRequest_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsuranceRequest" ADD CONSTRAINT "InsuranceRequest_enquiryId_fkey" FOREIGN KEY ("enquiryId") REFERENCES "Enquiry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsuranceRequest" ADD CONSTRAINT "InsuranceRequest_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsuranceRequest" ADD CONSTRAINT "InsuranceRequest_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventRegistration" ADD CONSTRAINT "EventRegistration_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventRegistration" ADD CONSTRAINT "EventRegistration_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GemItem" ADD CONSTRAINT "GemItem_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleListing" ADD CONSTRAINT "VehicleListing_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeProduct" ADD CONSTRAINT "TradeProduct_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentMilestone" ADD CONSTRAINT "ShipmentMilestone_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
