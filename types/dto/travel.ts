import { z } from "zod";
import {
  InsuranceStatus,
  PricingMode,
  PublishStatus,
  TicketStatus,
  TourType,
  VisaStage,
} from "@/app/generated/prisma/enums";
import {
  currencySchema,
  idSchema,
  imageListSchema,
  moneySchema,
  slugSchema,
  toUpdateSchema,
} from "@/types/dto/common";

// ── Tour packages (FR-TRV-03) ──
const TourBaseSchema = z.object({
  slug: slugSchema,
  title: z.string().trim().min(3).max(200),
  tourType: z.enum(TourType),
  destination: z.string().trim().min(2).max(200),
  country: z.string().trim().max(100).optional(), // used by the country search
  summary: z.string().trim().min(10).max(5000),
  itinerary: z
    .array(
      z.object({
        day: z.number().int().positive(),
        title: z.string().trim().min(1).max(200),
        description: z.string().trim().max(3000).default(""),
      }),
    )
    .default([]),
  durationDays: z.number().int().positive().max(365),
  departureDates: z.array(z.coerce.date()).default([]),
  isCustomisable: z.boolean().default(false),
  inclusions: z.array(z.string().trim()).default([]),
  exclusions: z.array(z.string().trim()).default([]),
  minGroupSize: z.number().int().positive().optional(),
  maxGroupSize: z.number().int().positive().optional(),
  pricingMode: z.enum(PricingMode).default(PricingMode.ON_REQUEST),
  price: moneySchema.optional(),
  currency: currencySchema.optional(),
  images: imageListSchema.default([]),
  status: z.enum(PublishStatus).default(PublishStatus.DRAFT),
});

const priceRule = (data: {
  pricingMode?: PricingMode;
  price?: number;
  currency?: string;
}) =>
  data.pricingMode != PricingMode.FIXED ||
  (data.price != undefined && data.currency != undefined);
const priceRuleMessage = {
  message: "A FIXED price needs both price and currency",
  path: ["price"],
};

export const TourCreateRequestSchema = TourBaseSchema.refine(
  priceRule,
  priceRuleMessage,
);
export const TourUpdateRequestSchema = toUpdateSchema(TourBaseSchema);

// ── Visa cases (FR-TRV-01, FR-TRV-02) ──
const ApplicantSchema = z.object({
  fullName: z.string().trim().min(1).max(200),
  nationality: z.string().trim().max(100).optional(),
  dateOfBirth: z.string().trim().max(20).optional(),
});

const ChecklistItemSchema = z.object({
  item: z.string().trim().min(1).max(200),
  received: z.boolean().default(false),
});

export const VisaCaseCreateRequestSchema = z.object({
  enquiryId: idSchema.optional(),
  customerId: idSchema.optional(),
  destinationCountry: z.string().trim().min(2).max(100),
  visaType: z.string().trim().min(2).max(100),
  applicants: z.array(ApplicantSchema).min(1),
  checklist: z.array(ChecklistItemSchema).default([]),
  assignedToId: idSchema.optional(),
  notes: z.string().trim().max(5000).optional(),
});

export const VisaCaseUpdateRequestSchema = z
  .object({
    stage: z.enum(VisaStage).optional(),
    applicants: z.array(ApplicantSchema).min(1).optional(),
    checklist: z.array(ChecklistItemSchema).optional(),
    decision: z.string().trim().max(2000).optional(),
    notes: z.string().trim().max(5000).optional(),
    assignedToId: idSchema.nullable().optional(),
  })
  .strict();

// ── Air tickets (FR-TRV-05, FR-TRV-06) ──
const SegmentSchema = z.object({
  origin: z.string().trim().min(2).max(100),
  destination: z.string().trim().min(2).max(100),
  date: z.string().trim().min(8).max(30),
  flightNumber: z.string().trim().max(20).optional(),
});

const PassengerSchema = z.object({
  fullName: z.string().trim().min(1).max(200),
  type: z.enum(["ADULT", "CHILD", "INFANT"]).default("ADULT"),
});

export const TicketCreateRequestSchema = z.object({
  enquiryId: idSchema.optional(),
  customerId: idSchema.optional(),
  tripType: z.enum(["ONE_WAY", "RETURN", "MULTI_CITY"]),
  segments: z.array(SegmentSchema).min(1).max(10),
  passengers: z.array(PassengerSchema).min(1).max(50),
  cabinClass: z.string().trim().max(30).optional(),
  assignedToId: idSchema.optional(),
  notes: z.string().trim().max(5000).optional(),
});

export const TicketUpdateRequestSchema = z
  .object({
    status: z.enum(TicketStatus).optional(),
    segments: z.array(SegmentSchema).min(1).max(10).optional(),
    passengers: z.array(PassengerSchema).min(1).max(50).optional(),
    cabinClass: z.string().trim().max(30).optional(),
    fareAmount: moneySchema.optional(),
    currency: currencySchema.optional(),
    airline: z.string().trim().max(100).optional(),
    supplierReference: z.string().trim().max(100).optional(),
    pnr: z.string().trim().max(20).optional(),
    ticketNumbers: z.array(z.string().trim()).optional(),
    notes: z.string().trim().max(5000).optional(),
    assignedToId: idSchema.nullable().optional(),
  })
  .strict();

// ── Travel insurance (FR-TRV-07) ──
const InsuranceBaseSchema = z.object({
  enquiryId: idSchema.optional(),
  customerId: idSchema.optional(),
  travellers: z
    .array(
      z.object({
        fullName: z.string().trim().min(1).max(200),
        dateOfBirth: z.string().trim().max(20).optional(),
      }),
    )
    .min(1),
  destination: z.string().trim().min(2).max(200),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  coverageType: z.string().trim().max(100).optional(),
  assignedToId: idSchema.optional(),
  notes: z.string().trim().max(5000).optional(),
});

export const InsuranceCreateRequestSchema = InsuranceBaseSchema.refine(
  (data) => data.endDate >= data.startDate,
  { message: "endDate must be on or after startDate", path: ["endDate"] },
);

export const InsuranceUpdateRequestSchema = z
  .object({
    status: z.enum(InsuranceStatus).optional(),
    travellers: InsuranceBaseSchema.shape.travellers.optional(),
    destination: z.string().trim().min(2).max(200).optional(),
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
    coverageType: z.string().trim().max(100).optional(),
    premium: moneySchema.optional(),
    currency: currencySchema.optional(),
    insurer: z.string().trim().max(100).optional(),
    policyNumber: z.string().trim().max(100).optional(),
    notes: z.string().trim().max(5000).optional(),
    assignedToId: idSchema.nullable().optional(),
  })
  .strict();
