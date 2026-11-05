import { z } from "zod";
import {
  AppointmentMode,
  InterviewResult,
  InterviewStage,
  JobApplicationStatus,
  JobInterviewMode,
  PublishStatus,
} from "@/app/generated/prisma/enums";
import { currencySchema, imageListSchema, moneySchema, slugSchema, toUpdateSchema } from "@/types/dto/common";
import { dayStringSchema } from "@/types/dto/rental";

const lineList = z.array(z.string().trim().min(1).max(300)).max(30).default([]);
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
const optionalInt = (min: number, max: number) => z.number().int().min(min).max(max).nullable().optional();

// ── Job vacancies (admin: Catalogue > Job vacancies) ──
const JobVacancyBaseSchema = z.object({
  slug: slugSchema,
  title: z.string().trim().min(2).max(200),
  category: z.string().trim().min(2).max(100),
  country: z.string().trim().min(2).max(100),
  region: z.string().trim().min(2).max(60),
  city: optionalText(100),
  employer: optionalText(200),
  positions: z.number().int().min(1).max(10_000).default(1),
  salaryMin: moneySchema.nullable().optional(),
  salaryMax: moneySchema.nullable().optional(),
  salaryCurrency: currencySchema.default("USD"),
  salaryPeriod: z.string().trim().min(2).max(20).default("month"),
  contractMonths: optionalInt(1, 120),
  visaType: optionalText(200),
  description: z.string().trim().min(5).max(10000),
  requirements: lineList,
  benefits: lineList,
  documentsNeeded: lineList,
  ageMin: optionalInt(16, 80),
  ageMax: optionalInt(16, 80),
  gender: optionalText(20),
  experienceYears: optionalInt(0, 50),
  interviewMode: z.enum(JobInterviewMode).nullable().optional(),
  interviewAt: z.coerce.date().nullable().optional(),
  interviewPlace: optionalText(300),
  interviewNotes: optionalText(2000),
  deadline: z.coerce.date().nullable().optional(), // last day to apply (date part is kept)
  featured: z.boolean().default(false),
  images: imageListSchema.default([]),
  status: z.enum(PublishStatus).default(PublishStatus.DRAFT),
});

export const JobVacancyCreateRequestSchema = JobVacancyBaseSchema;
export const JobVacancyUpdateRequestSchema = toUpdateSchema(JobVacancyBaseSchema);

// ── Application from the website (multipart form, signed in) ──
export const JobApplicationCreateRequestSchema = z.object({
  vacancyId: z.uuid("Invalid job"),
  firstName: z.string().trim().min(1, "Please enter your first name").max(100),
  lastName: z.string().trim().max(100).optional(),
  phone: z.string().trim().min(6, "Please enter a phone number we can call").max(30),
  dateOfBirth: dayStringSchema.optional(),
  passportNumber: z.string().trim().toUpperCase().max(20).optional(),
  passportExpiry: dayStringSchema.optional(),
  experienceYears: z.coerce.number().int().min(0).max(50).optional(),
  currentJob: z.string().trim().max(200).optional(),
  message: z.string().trim().max(3000).optional(),
  email: z.email("Please enter a valid email address").trim().toLowerCase().optional(), // guests only
  website: z.string().optional(), // honeypot: real people leave this empty
});

// ── Staff: move the application along ──
export const JobApplicationUpdateRequestSchema = z
  .object({
    status: z.enum(JobApplicationStatus).optional(),
    staffNotes: z.string().trim().max(5000).nullable().optional(),
    rejectReason: z.string().trim().max(500).optional(),
  })
  .strict();

// ── Staff: invite to an interview ──
export const JobInterviewCreateRequestSchema = z.object({
  stage: z.enum(InterviewStage),
  mode: z.enum(AppointmentMode).default(AppointmentMode.IN_PERSON),
  scheduledAt: z.coerce.date(),
  location: z.string().trim().max(500).optional(),
  interviewer: z.string().trim().max(200).optional(),
  instructions: z.string().trim().max(2000).optional(),
});

// ── Staff: record the result or reschedule ──
export const JobInterviewUpdateRequestSchema = z
  .object({
    result: z.enum(InterviewResult).optional(),
    scheduledAt: z.coerce.date().optional(),
    location: z.string().trim().max(500).nullable().optional(),
    interviewer: z.string().trim().max(200).nullable().optional(),
    instructions: z.string().trim().max(2000).nullable().optional(),
    feedback: z.string().trim().max(3000).nullable().optional(),
  })
  .strict();
