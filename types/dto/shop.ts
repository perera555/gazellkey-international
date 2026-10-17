import { z } from "zod";
import { Division, EntityType, PublishStatus } from "@/app/generated/prisma/enums";
import {
  currencySchema,
  idSchema,
  imageListSchema,
  jsonObjectSchema,
  moneySchema,
  toUpdateSchema,
} from "@/types/dto/common";

// Catalogue items that can be bought online (fixed price only)
export const SHOP_ITEM_TYPES = [
  EntityType.SHOP_PRODUCT,
  EntityType.GEM_ITEM,
  EntityType.VEHICLE_LISTING,
  EntityType.TRADE_PRODUCT,
] as const;

// ── Retail shop products (managed in the admin under Catalogue > Shop products) ──
const ShopProductBaseSchema = z.object({
  sku: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{3,40}$/, "SKU may contain A-Z, 0-9 and dashes"),
  name: z.string().trim().min(2).max(200),
  category: z.string().trim().min(2).max(100),
  brand: z.string().trim().max(100).optional(),
  summary: z.string().trim().max(300).optional(),
  description: z.string().trim().min(5).max(10000),
  highlights: z.array(z.string().trim().min(1).max(200)).max(12).default([]),
  specifications: jsonObjectSchema.optional(),
  unit: z.string().trim().min(1).max(20).default("item"),
  price: moneySchema.positive(),
  compareAtPrice: moneySchema.nullable().optional(),
  saleEndsAt: z.coerce.date().nullable().optional(),
  currency: currencySchema,
  stockQty: z.number().int().nonnegative().default(0),
  division: z.enum(Division).default(Division.IMPORT),
  featured: z.boolean().default(false),
  images: imageListSchema.default([]),
  status: z.enum(PublishStatus).default(PublishStatus.DRAFT),
});

const compareAtRule = (data: { price?: number; compareAtPrice?: number | null }) =>
  data.compareAtPrice == null || data.price == undefined || data.compareAtPrice > data.price;
const compareAtMessage = {
  message: "The original price must be higher than the selling price",
  path: ["compareAtPrice"],
};

export const ShopProductCreateRequestSchema = ShopProductBaseSchema.refine(
  compareAtRule,
  compareAtMessage,
);
export const ShopProductUpdateRequestSchema = toUpdateSchema(ShopProductBaseSchema);

// GET /api/shop/catalogue - what the website's Shop page can ask for
export const SHOP_SORTS = ["featured", "newest", "price-asc", "price-desc", "discount"] as const;
export type ShopSort = (typeof SHOP_SORTS)[number];

// "Kind" filter on the Shop page: retail products or one of the divisions
export const SHOP_KINDS = ["SHOP", "GEMS", "VEHICLES", "IMPORT", "EXPORT"] as const;
export type ShopKind = (typeof SHOP_KINDS)[number];

// How the customer pays (only the ones set up in .env are offered,
// see GET /api/shop/options)
export const SHOP_PAYMENT_METHODS = ["PAYHERE", "STRIPE", "BANK_TRANSFER"] as const;
export type ShopPaymentMethod = (typeof SHOP_PAYMENT_METHODS)[number];

// The cart sends only what and how many. Prices, names and stock are
// always read from the database, never taken from the browser.
export const CheckoutRequestSchema = z.object({
  items: z
    .array(
      z.object({
        itemType: z.enum(SHOP_ITEM_TYPES),
        itemId: idSchema,
        quantity: z.number().positive().max(1_000_000),
      }),
    )
    .min(1, "Your cart is empty.")
    .max(50, "A cart can hold at most 50 different items."),
  paymentMethod: z.enum(SHOP_PAYMENT_METHODS),
  // where to deliver; PayHere also needs it for the card payment
  delivery: z.object({
    phone: z.string().trim().min(6, "Please enter a phone number").max(30)
      .regex(/^\+?[0-9 ()-]+$/, "Phone may contain digits, spaces, + ( ) -"),
    address: z.string().trim().min(3, "Please enter the delivery address").max(200),
    city: z.string().trim().min(2, "Please enter the city").max(80),
    country: z.string().trim().min(2, "Please enter the country").max(80),
  }),
});

export type CheckoutRequest = z.infer<typeof CheckoutRequestSchema>;
