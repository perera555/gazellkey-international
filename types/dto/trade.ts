import { z } from "zod";
import {
  Division,
  RecordStatus,
  ShipmentStatus,
  TradeDirection,
} from "@/app/generated/prisma/enums";
import { idSchema, toUpdateSchema } from "@/types/dto/common";

// FR-IMP-02, FR-VEH-05
export const SupplierCreateRequestSchema = z.object({
  name: z.string().trim().min(2).max(200),
  contactName: z.string().trim().max(200).optional(),
  email: z.email().trim().toLowerCase().optional(),
  phone: z.string().trim().max(30).optional(),
  country: z.string().trim().max(100).optional(),
  address: z.string().trim().max(500).optional(),
  productsSupplied: z.array(z.string().trim()).default([]),
  paymentTerms: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(5000).optional(),
  divisions: z.array(z.enum(Division)).min(1),
  status: z.enum(RecordStatus).default(RecordStatus.ACTIVE),
});

export const SupplierUpdateRequestSchema = toUpdateSchema(SupplierCreateRequestSchema);

// FR-IMP-06, FR-EXP-05
export const ShipmentCreateRequestSchema = z.object({
  orderId: idSchema,
  direction: z.enum(TradeDirection).optional(), // taken from the order's division
  carrier: z.string().trim().max(100).optional(),
  trackingNumber: z.string().trim().max(100).optional(),
  origin: z.string().trim().max(200).optional(),
  destination: z.string().trim().max(200).optional(),
  incoterm: z.string().trim().max(20).optional(),
  expectedDeparture: z.coerce.date().optional(),
  expectedArrival: z.coerce.date().optional(),
});

export const ShipmentUpdateRequestSchema = ShipmentCreateRequestSchema.omit({
  orderId: true,
  direction: true,
})
  .extend({ actualArrival: z.coerce.date().optional() })
  .partial()
  .strict();

// A milestone moves the shipment to a new status and keeps the history
export const ShipmentMilestoneRequestSchema = z.object({
  status: z.enum(ShipmentStatus),
  location: z.string().trim().max(200).optional(),
  note: z.string().trim().max(2000).optional(),
  occurredAt: z.coerce.date().optional(),
  delayReason: z.string().trim().max(2000).optional(), // required for DELAYED
});
