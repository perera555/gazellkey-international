import { z } from "zod";
import {
  Division,
  EnquiryStatus,
  EntityType,
  Priority,
} from "@/app/generated/prisma/enums";
import { idSchema, jsonObjectSchema } from "@/types/dto/common";

// Public enquiry form - works with or without signing in (FR-SH-02)
export const EnquiryCreateRequestSchema = z.object({
  division: z.enum(Division),
  serviceType: z.string().trim().max(50).optional(), // e.g. VISA, AIR_TICKET
  subject: z.string().trim().min(3).max(200),
  message: z.string().trim().min(5).max(5000),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().max(100).optional(),
  companyName: z.string().trim().max(200).optional(),
  email: z.email().trim().toLowerCase(),
  phone: z.string().trim().max(30).optional(),
  country: z.string().trim().max(100).optional(),
  itemType: z.enum(EntityType).optional(), // the listing the visitor asked about
  itemId: idSchema.optional(),
  details: jsonObjectSchema.optional(), // travel dates, passenger count ...
  website: z.string().optional(), // honeypot: real people leave this empty
});

// Staff update (assign, change status / priority)
export const EnquiryUpdateRequestSchema = z
  .object({
    status: z.enum(EnquiryStatus).optional(),
    priority: z.enum(Priority).optional(),
    assignedToId: idSchema.nullable().optional(),
    serviceType: z.string().trim().max(50).optional(),
  })
  .strict();

export const EnquiryNoteRequestSchema = z.object({
  body: z.string().trim().min(1).max(5000),
  isInternal: z.boolean().default(true),
});

export type EnquiryCreateRequest = z.infer<typeof EnquiryCreateRequestSchema>;
