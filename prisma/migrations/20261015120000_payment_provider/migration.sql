-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('STRIPE', 'PAYHERE');

-- Card gateway of online shop payments (lib/shop.ts)
ALTER TABLE "Payment" ADD COLUMN "provider" "PaymentProvider";

-- Card payments made before this column existed all went through Stripe
UPDATE "Payment" SET "provider" = 'STRIPE' WHERE "checkoutReference" IS NOT NULL AND "method" = 'CARD_ONLINE';
