import { z } from "zod";
import {
  Division,
  PublishStatus,
  ReviewStatus,
} from "@/app/generated/prisma/enums";
import { idSchema } from "@/types/dto/common";

// Signed-in customer writes a review
export const ReviewCreateRequestSchema = z.object({
  division: z.enum(Division).default(Division.TRAVEL),
  tourId: idSchema.optional(),
  rating: z.number().int().min(1).max(5),
  title: z.string().trim().max(120).optional(),
  body: z.string().trim().min(10, "Please write at least a sentence").max(3000),
  tripDate: z.coerce.date().optional(),
  website: z.string().optional(), // honeypot: real people leave this empty
});

// Admin: hide a bad review (with a reason) or publish it again
export const ReviewModerateRequestSchema = z
  .object({
    status: z.enum(ReviewStatus),
    removedReason: z.string().trim().max(500).optional(),
  })
  .strict()
  .refine((data) => data.status != ReviewStatus.HIDDEN || data.removedReason, {
    message: "Please give a reason for removing the review",
    path: ["removedReason"],
  });

// Staff: gallery photo details (the file itself comes as multipart "file")
export const GalleryPhotoSchema = z.object({
  division: z.enum(Division).default(Division.TRAVEL),
  title: z.string().trim().min(2).max(120),
  caption: z.string().trim().max(500).optional(),
  place: z.string().trim().max(120).optional(),
  country: z.string().trim().max(100).optional(),
  takenAt: z.coerce.date().optional(),
  imageUrl: z
    .string()
    .trim()
    .max(1000)
    .refine((value) => value.startsWith("/") || /^https?:\/\//.test(value), {
      message: "Use a full https:// link or a site path like /images/photo.jpg",
    })
    .optional(),
  sortOrder: z.coerce.number().int().min(0).max(100000).default(0),
  status: z.enum(PublishStatus).default(PublishStatus.PUBLISHED),
});

export const GalleryPhotoUpdateSchema = z
  .object({
    division: z.enum(Division),
    title: z.string().trim().min(2).max(120),
    caption: z.string().trim().max(500).nullable(),
    place: z.string().trim().max(120).nullable(),
    country: z.string().trim().max(100).nullable(),
    takenAt: z.coerce.date().nullable(),
    sortOrder: z.coerce.number().int().min(0).max(100000),
    status: z.enum(PublishStatus),
  })
  .partial()
  .strict();
