import { z } from "zod";
import {
  EventType,
  PublishStatus,
  RegistrationStatus,
} from "@/app/generated/prisma/enums";
import {
  currencySchema,
  imageListSchema,
  moneySchema,
  slugSchema,
  toUpdateSchema,
} from "@/types/dto/common";

// FR-EVT-01, FR-EVT-02
const EventBaseSchema = z.object({
  slug: slugSchema,
  name: z.string().trim().min(3).max(200),
  eventType: z.enum(EventType),
  description: z.string().trim().min(10).max(10000),
  venue: z.string().trim().min(2).max(300),
  city: z.string().trim().max(100).optional(),
  country: z.string().trim().max(100).optional(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  organiser: z.string().trim().max(200).optional(),
  capacity: z.number().int().positive().nullable().optional(), // null = unlimited
  registrationOpen: z.boolean().default(true),
  fee: moneySchema.nullable().optional(), // null = free
  currency: currencySchema.optional(),
  terms: z.string().trim().max(10000).optional(),
  images: imageListSchema.default([]),
  status: z.enum(PublishStatus).default(PublishStatus.DRAFT),
});

export const EventCreateRequestSchema = EventBaseSchema.refine(
  (data) => data.endDate >= data.startDate,
  { message: "endDate must be on or after startDate", path: ["endDate"] },
).refine((data) => data.fee == null || data.currency != undefined, {
  message: "A paid event needs a currency",
  path: ["currency"],
});

export const EventUpdateRequestSchema = toUpdateSchema(EventBaseSchema);

// FR-EVT-03, FR-EVT-07 (group bookings = several seats/participants)
export const EventRegistrationRequestSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().max(100).optional(),
  companyName: z.string().trim().max(200).optional(),
  email: z.email().trim().toLowerCase(),
  phone: z.string().trim().max(30).optional(),
  country: z.string().trim().max(100).optional(),
  participants: z
    .array(
      z.object({
        fullName: z.string().trim().min(1).max(200),
        email: z.email().optional(),
        phone: z.string().trim().max(30).optional(),
      }),
    )
    .min(1)
    .max(100),
  notes: z.string().trim().max(2000).optional(),
});

export const EventRegistrationUpdateRequestSchema = z.object({
  status: z.enum(RegistrationStatus),
  notes: z.string().trim().max(2000).optional(),
});
