import { z } from "zod";
import {
  AppointmentMode,
  AppointmentStatus,
  Division,
} from "@/app/generated/prisma/enums";
import { idSchema } from "@/types/dto/common";

// Public booking form - works with or without signing in.
// startAt must be one of the free slots from GET /api/appointments/slots.
export const AppointmentCreateRequestSchema = z.object({
  division: z.enum(Division),
  serviceType: z.string().trim().max(50).optional(),
  subject: z.string().trim().min(3).max(200),
  message: z.string().trim().max(5000).optional(),
  mode: z.enum(AppointmentMode).default(AppointmentMode.IN_PERSON),
  startAt: z.coerce.date(),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().max(100).optional(),
  companyName: z.string().trim().max(200).optional(),
  email: z.email().trim().toLowerCase(),
  phone: z.string().trim().max(30).optional(),
  country: z.string().trim().max(100).optional(),
  enquiryId: idSchema.optional(), // booked from an existing enquiry
  website: z.string().optional(), // honeypot: real people leave this empty
});

// Staff: confirm, reschedule, assign, add the meeting details
export const AppointmentUpdateRequestSchema = z
  .object({
    status: z.enum(AppointmentStatus).optional(),
    startAt: z.coerce.date().optional(), // reschedule
    durationMinutes: z.number().int().min(15).max(480).optional(),
    mode: z.enum(AppointmentMode).optional(),
    assignedToId: idSchema.nullable().optional(),
    location: z.string().trim().max(300).nullable().optional(),
    meetingLink: z.url().trim().max(500).nullable().optional(),
    staffNotes: z.string().trim().max(5000).nullable().optional(),
    cancelReason: z.string().trim().max(1000).optional(),
  })
  .strict();

// Customer (own appointment) or staff
export const AppointmentCancelRequestSchema = z.object({
  reason: z.string().trim().max(1000).optional(),
});

export type AppointmentCreateRequest = z.infer<
  typeof AppointmentCreateRequestSchema
>;
