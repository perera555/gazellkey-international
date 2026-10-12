import { z } from "zod";
import {
  DocumentAccess,
  DocumentType,
  EntityType,
} from "@/app/generated/prisma/enums";
import { idSchema } from "@/types/dto/common";

// Sent as multipart/form-data together with the "file" field
export const DocumentUploadRequestSchema = z.object({
  entityType: z.enum(EntityType),
  entityId: idSchema,
  type: z.enum(DocumentType),
  title: z.string().trim().min(1).max(200),
  accessLevel: z.enum(DocumentAccess).optional(),
});

export const SiteContentRequestSchema = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.record(z.string(), z.any()),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional(),
});
