-- Online shop: links the payments of one Stripe checkout (lib/shop.ts)
ALTER TABLE "Payment" ADD COLUMN "checkoutReference" TEXT;

-- CreateIndex
CREATE INDEX "Payment_checkoutReference_idx" ON "Payment"("checkoutReference");
