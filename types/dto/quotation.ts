import { z } from "zod";
import { Division, EntityType } from "@/app/generated/prisma/enums";
import {
  currencySchema,
  idSchema,
  moneySchema,
  toUpdateSchema,
} from "@/types/dto/common";

export const QuotationItemSchema = z.object({
  description: z.string().trim().min(1).max(500),
  itemType: z.enum(EntityType).optional(),
  itemId: idSchema.optional(),
  quantity: z.number().positive(),
  unit: z.string().trim().max(20).default("unit"),
  unitPrice: moneySchema,
});

const QuotationBaseSchema = z.object({
  enquiryId: idSchema.optional(),
  customerId: idSchema.optional(),
  division: z.enum(Division).optional(), // taken from the enquiry when missing
  currency: currencySchema,
  validUntil: z.coerce.date(),
  terms: z.string().trim().max(5000).optional(),
  shippingTerms: z.string().trim().max(50).optional(),
  notes: z.string().trim().max(5000).optional(),
  discount: moneySchema.default(0),
  tax: moneySchema.default(0),
  items: z.array(QuotationItemSchema).min(1, "At least one line item is required").max(100),
});

export const QuotationCreateRequestSchema = QuotationBaseSchema.refine(
  (data) => data.enquiryId || (data.customerId && data.division),
  { message: "Provide an enquiryId, or a customerId together with a division" },
).refine((data) => data.validUntil > new Date(), {
  message: "validUntil must be in the future",
  path: ["validUntil"],
});

// Only DRAFT quotations can be edited
export const QuotationUpdateRequestSchema = toUpdateSchema(
  QuotationBaseSchema.omit({
    enquiryId: true,
    customerId: true,
    division: true,
  }),
);

// The customer's answer (FR-SH-05 / workflow step 5)
export const QuotationResponseRequestSchema = z.object({
  action: z.enum(["ACCEPT", "REJECT", "REQUEST_CHANGES"]),
  note: z.string().trim().max(2000).optional(),
});

export type QuotationCreateRequest = z.infer<typeof QuotationCreateRequestSchema>;
