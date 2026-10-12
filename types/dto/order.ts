import { z } from "zod";
import { OrderStatus, PaymentMethod } from "@/app/generated/prisma/enums";
import { idSchema, jsonObjectSchema, moneySchema } from "@/types/dto/common";

export const OrderUpdateRequestSchema = z
  .object({
    status: z.enum(OrderStatus).optional(),
    supplierId: idSchema.nullable().optional(),
    shippingTerms: z.string().trim().max(50).optional(),
    details: jsonObjectSchema.optional(),
  })
  .strict();

// Payment is requested only after the quotation is accepted (FR-SH-06),
// so a payment always belongs to an order.
export const PaymentCreateRequestSchema = z.object({
  orderId: idSchema,
  amount: moneySchema.positive(),
  method: z.enum(PaymentMethod),
  providerReference: z.string().trim().max(200).optional(), // bank slip no., gateway id
  note: z.string().trim().max(2000).optional(),
});

// Finance confirms or rejects a payment
export const PaymentUpdateRequestSchema = z.object({
  status: z.enum(["PAID", "FAILED"]),
  providerReference: z.string().trim().max(200).optional(),
  note: z.string().trim().max(2000).optional(),
});

export const RefundCreateRequestSchema = z.object({
  amount: moneySchema.positive(),
  reason: z.string().trim().min(3).max(2000),
  providerReference: z.string().trim().max(200).optional(),
});
