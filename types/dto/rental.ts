import { z } from "zod";
import { PublishStatus, RentalEventType, RentalStatus } from "@/app/generated/prisma/enums";
import {
  currencySchema,
  idSchema,
  imageListSchema,
  jsonObjectSchema,
  moneySchema,
  toUpdateSchema,
} from "@/types/dto/common";

// Longest hire one booking can cover
export const MAX_RENTAL_DAYS = 30;

// "2026-11-14" - a calendar day (no time, no time zone)
export const dayStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-11-14")
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), "Not a real date");

// ── Rental items (admin: Catalogue > Rental items) ──
const RentalItemBaseSchema = z.object({
  sku: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{3,40}$/, "SKU may contain A-Z, 0-9 and dashes"),
  name: z.string().trim().min(2).max(200),
  category: z.string().trim().min(2).max(100),
  description: z.string().trim().min(5).max(10000),
  highlights: z.array(z.string().trim().min(1).max(200)).max(12).default([]),
  specifications: jsonObjectSchema.optional(),
  unit: z.string().trim().min(1).max(20).default("piece"),
  pricePerDay: moneySchema.positive(),
  currency: currencySchema.default("LKR"),
  quantityOwned: z.number().int().min(1).max(100_000),
  minQuantity: z.number().int().min(1).max(100_000).default(1),
  deposit: moneySchema.nullable().optional(),
  featured: z.boolean().default(false),
  images: imageListSchema.default([]),
  status: z.enum(PublishStatus).default(PublishStatus.DRAFT),
});

export const RentalItemCreateRequestSchema = RentalItemBaseSchema;
export const RentalItemUpdateRequestSchema = toUpdateSchema(RentalItemBaseSchema);

// ── Booking request from the website (signed in or not) ──
export const RentalBookingCreateRequestSchema = z
  .object({
    eventType: z.enum(RentalEventType),
    startDate: dayStringSchema,
    endDate: dayStringSchema,
    venue: z.string().trim().min(3, "Please enter the venue address").max(300),
    city: z.string().trim().min(2, "Please enter the city").max(80),
    guests: z.number().int().min(1).max(100_000).optional(),
    needsDelivery: z.boolean().default(true),
    needsSetup: z.boolean().default(false),
    message: z.string().trim().max(3000).optional(),
    items: z
      .array(z.object({ rentalItemId: idSchema, quantity: z.number().int().min(1).max(100_000) }))
      .min(1, "Please choose at least one item.")
      .max(40),
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().max(100).optional(),
    companyName: z.string().trim().max(200).optional(),
    email: z.email().trim().toLowerCase(),
    phone: z
      .string()
      .trim()
      .min(6, "Please enter a phone number so we can arrange delivery")
      .max(30),
    website: z.string().optional(), // honeypot: real people leave this empty
  })
  .refine((data) => data.endDate >= data.startDate, {
    message: "The last day must be on or after the first day",
    path: ["endDate"],
  });

export type RentalBookingCreateRequest = z.infer<typeof RentalBookingCreateRequestSchema>;

// ── Staff: confirm, deliver, return, cancel, price ──
export const RentalBookingUpdateRequestSchema = z
  .object({
    status: z.enum(RentalStatus).optional(),
    quotedTotal: moneySchema.nullable().optional(),
    staffNotes: z.string().trim().max(5000).nullable().optional(),
    cancelReason: z.string().trim().max(500).optional(),
  })
  .strict();
