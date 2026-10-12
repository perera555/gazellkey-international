import { z } from "zod";
import { CustomerType } from "@/app/generated/prisma/enums";

export const CustomerCreateRequestSchema = z.object({
  type: z.enum(CustomerType).optional(),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().max(100).optional(),
  companyName: z.string().trim().max(200).optional(),
  email: z.email().trim().toLowerCase(),
  phone: z.string().trim().max(30).optional(),
  country: z.string().trim().max(100).optional(),
  address: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(5000).optional(),
});

export const CustomerUpdateRequestSchema = CustomerCreateRequestSchema.partial();

export type CustomerCreateRequest = z.infer<typeof CustomerCreateRequestSchema>;
