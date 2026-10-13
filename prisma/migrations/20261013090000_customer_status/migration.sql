-- Customers are soft deleted: INACTIVE instead of removing the row
-- (orders, payments and documents keep pointing at them).
ALTER TABLE "Customer" ADD COLUMN "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE';
