import { z } from "zod";
import {
  Availability,
  GemItemType,
  PricingMode,
  PublishStatus,
  TradeCategory,
  TradeDirection,
  VehicleListingType,
} from "@/app/generated/prisma/enums";
import {
  currencySchema,
  idSchema,
  imageListSchema,
  jsonObjectSchema,
  moneySchema,
  toUpdateSchema,
} from "@/types/dto/common";

const skuSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9-]{3,40}$/, "SKU may contain A-Z, 0-9 and dashes");

// Shared fields of every sellable listing
const pricingFields = {
  pricingMode: z.enum(PricingMode).default(PricingMode.ON_REQUEST),
  price: moneySchema.optional(),
  currency: currencySchema.optional(),
  supplierCost: moneySchema.optional(), // restricted
  supplierId: idSchema.nullable().optional(), // restricted
  images: imageListSchema.default([]),
  status: z.enum(PublishStatus).default(PublishStatus.DRAFT),
};

const fixedPriceRule = (data: {
  pricingMode?: PricingMode;
  price?: number;
  currency?: string;
}) =>
  data.pricingMode != PricingMode.FIXED ||
  (data.price != undefined && data.currency != undefined);
const fixedPriceMessage = {
  message: "A FIXED price needs both price and currency",
  path: ["price"],
};

// ── Gems & Jewellery (FR-GEM-01 .. 08) ──
const GemBaseSchema = z.object({
  sku: skuSchema,
  name: z.string().trim().min(2).max(200),
  itemType: z.enum(GemItemType),
  category: z.string().trim().min(2).max(100),
  description: z.string().trim().min(5).max(10000),
  weight: z.number().positive().optional(),
  weightUnit: z.string().trim().max(10).default("ct"),
  colour: z.string().trim().max(50).optional(),
  cut: z.string().trim().max(50).optional(),
  shape: z.string().trim().max(50).optional(),
  clarity: z.string().trim().max(50).optional(),
  origin: z.string().trim().max(100).optional(),
  treatment: z.string().trim().max(200).optional(),
  metal: z.string().trim().max(100).optional(),
  sourcingNotes: z.string().trim().max(5000).optional(), // restricted
  availability: z.enum(Availability).default(Availability.AVAILABLE),
  ...pricingFields,
});

export const GemCreateRequestSchema = GemBaseSchema.refine(
  fixedPriceRule,
  fixedPriceMessage,
);
export const GemUpdateRequestSchema = toUpdateSchema(GemBaseSchema);

// ── Vehicles & Machinery (FR-VEH-01 .. 06) ──
const VehicleBaseSchema = z.object({
  sku: skuSchema,
  listingType: z.enum(VehicleListingType),
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().min(5).max(10000),
  make: z.string().trim().max(100).optional(),
  model: z.string().trim().max(100).optional(),
  year: z
    .number()
    .int()
    .min(1950)
    .max(new Date().getFullYear() + 1)
    .optional(),
  condition: z.string().trim().max(100).optional(),
  mileageKm: z.number().int().nonnegative().optional(),
  operatingHours: z.number().int().nonnegative().optional(),
  fuelType: z.string().trim().max(50).optional(),
  transmission: z.string().trim().max(50).optional(),
  partNumber: z.string().trim().max(100).optional(),
  compatibleWith: z.array(z.string().trim()).default([]),
  specifications: jsonObjectSchema.optional(),
  stock: z.number().int().nonnegative().default(1),
  availability: z.enum(Availability).default(Availability.AVAILABLE),
  ...pricingFields,
});

export const VehicleCreateRequestSchema = VehicleBaseSchema.refine(
  fixedPriceRule,
  fixedPriceMessage,
);
export const VehicleUpdateRequestSchema = toUpdateSchema(VehicleBaseSchema);

// ── Import / Export products (FR-IMP-01, FR-EXP-01) ──
export const IMPORT_CATEGORIES: TradeCategory[] = [
  TradeCategory.SPORTS_ITEMS,
  TradeCategory.SHOES,
  TradeCategory.CLOTHES,
  TradeCategory.FANCY_ITEMS,
  TradeCategory.ELECTRICAL_ITEMS,
  TradeCategory.COMPUTERS_HARDWARE_PHONES,
  TradeCategory.FOOD_ITEMS,
  TradeCategory.POWER_HAND_TOOLS,
];

export const EXPORT_CATEGORIES: TradeCategory[] = [
  TradeCategory.COFFEE,
  TradeCategory.CHOCOLATE,
  TradeCategory.TEA,
  TradeCategory.SPICES,
  TradeCategory.FRUITS_VEGETABLES,
];

export function categoryMatchesDirection(
  direction: TradeDirection,
  category: TradeCategory,
) {
  const allowed =
    direction == TradeDirection.IMPORT ? IMPORT_CATEGORIES : EXPORT_CATEGORIES;
  return allowed.includes(category);
}

const TradeProductBaseSchema = z.object({
  sku: skuSchema,
  direction: z.enum(TradeDirection),
  category: z.enum(TradeCategory),
  name: z.string().trim().min(2).max(200),
  description: z.string().trim().min(5).max(10000),
  origin: z.string().trim().max(100).optional(),
  specifications: jsonObjectSchema.optional(),
  packaging: z.string().trim().max(200).optional(),
  unit: z.string().trim().max(20).default("kg"),
  minimumOrderQty: z.number().positive().optional(),
  stockQty: z.number().nonnegative().optional(),
  requiresPermit: z.boolean().default(false),
  // labelled ("was") price, shown crossed out next to the fixed price
  compareAtPrice: moneySchema.nullable().optional(),
  ...pricingFields,
});

export function compareAtPriceValid(price: number | null | undefined, compareAtPrice: number | null | undefined) {
  return compareAtPrice == null || (price != null && compareAtPrice > price);
}
export const compareAtPriceMessage = "The labelled price must be higher than the price";

export const TradeProductCreateRequestSchema = TradeProductBaseSchema.refine(
  fixedPriceRule,
  fixedPriceMessage,
).refine((data) => categoryMatchesDirection(data.direction, data.category), {
  message: "This category does not belong to the selected direction",
  path: ["category"],
}).refine((data) => compareAtPriceValid(data.price, data.compareAtPrice), {
  message: compareAtPriceMessage,
  path: ["compareAtPrice"],
});

export const TradeProductUpdateRequestSchema = toUpdateSchema(TradeProductBaseSchema);
