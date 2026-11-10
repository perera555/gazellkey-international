import { z } from "zod";
import { Division, LeadershipRole, PublishStatus } from "@/app/generated/prisma/enums";
import { toUpdateSchema } from "@/types/dto/common";

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();

// ── Directors, shareholders and managers (admin: Website > Leadership) ──
const TeamMemberBaseSchema = z.object({
  name: z.string().trim().min(2).max(120),
  roles: z.array(z.enum(LeadershipRole)).min(1, "Choose at least one role: director, shareholder, manager or team"),
  position: z.string().trim().min(2).max(120),
  division: z.enum(Division).nullable().optional(),
  department: optionalText(80), // IT Department, Travel Services ... (chosen or typed)
  email: z.union([z.email("Please enter a valid email address").trim().toLowerCase(), z.literal("")]).nullable().optional(),
  phone: optionalText(30), // kept only for managers
  bio: optionalText(1000),
  photo: optionalText(500),
  shareholding: z.number().min(0).max(100).nullable().optional(),
  sortOrder: z.number().int().min(0).max(10_000).default(100),
  status: z.enum(PublishStatus).default(PublishStatus.PUBLISHED),
});

export const TeamMemberCreateRequestSchema = TeamMemberBaseSchema;
export const TeamMemberUpdateRequestSchema = toUpdateSchema(TeamMemberBaseSchema);
