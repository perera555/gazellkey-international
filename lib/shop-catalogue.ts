import prisma from "@/lib/prisma";
import { Prisma } from "@/app/generated/prisma/client";
import {
  Availability,
  EntityType,
  PricingMode,
  PublishStatus,
  TradeDirection,
} from "@/app/generated/prisma/enums";
import { ShopKind, ShopSort } from "@/types/dto/shop";

// Everything the website's Shop page sells, in one list:
//   - retail shop products (always a fixed price)
//   - fixed-price gems, vehicles / spare parts and import / export products
//
// The shop is small (hundreds of items, not millions), so each table is read
// once and filtering, sorting and paging happen here. That lets one page mix
// all kinds and sort them together by price or discount.

const PER_KIND_LIMIT = 500;

export type ShopItem = {
  itemType: EntityType;
  itemId: string;
  kind: ShopKind;
  sku: string;
  name: string;
  category: string;
  brand: string | null;
  summary: string | null;
  image: string | null;
  price: number;
  compareAtPrice: number | null; // only while a sale is running
  discountPercent: number;
  saleEndsAt: string | null;
  currency: string;
  unit: string;
  stock: number | null; // null = not counted
  minQuantity: number;
  wholeNumbers: boolean;
  featured: boolean;
  createdAt: string;
};

export type ShopFilters = {
  search?: string;
  kind?: ShopKind;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  currency?: string;
  onSale?: boolean;
  inStock?: boolean;
  sort: ShopSort;
};

// "SPORTS_ITEMS" -> "Sports items"
function enumLabel(value: string) {
  const text = value.toLowerCase().replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// The "was" price counts only while it is higher and the sale has not ended
export function activeSale(product: {
  price: Prisma.Decimal | number;
  compareAtPrice: Prisma.Decimal | number | null;
  saleEndsAt: Date | null;
}) {
  const price = Number(product.price);
  const was = product.compareAtPrice == null ? null : Number(product.compareAtPrice);
  const running = product.saleEndsAt == null || product.saleEndsAt.getTime() > Date.now();
  if (was == null || was <= price || !running) {
    return { compareAtPrice: null, discountPercent: 0, saleEndsAt: null };
  }
  return {
    compareAtPrice: was,
    discountPercent: Math.round(((was - price) / was) * 100),
    saleEndsAt: product.saleEndsAt?.toISOString() ?? null,
  };
}

const noSale = { compareAtPrice: null, discountPercent: 0, saleEndsAt: null };

async function loadItems(kind?: ShopKind): Promise<ShopItem[]> {
  const wants = (each: ShopKind) => kind == undefined || kind == each;
  const fixed = {
    status: PublishStatus.PUBLISHED,
    pricingMode: PricingMode.FIXED,
    price: { not: null },
    currency: { not: null },
  };

  const [products, gems, vehicles, trade] = await Promise.all([
    wants("SHOP")
      ? prisma.shopProduct.findMany({
          where: { status: PublishStatus.PUBLISHED },
          take: PER_KIND_LIMIT,
          orderBy: { createdAt: "desc" },
        })
      : [],
    wants("GEMS")
      ? prisma.gemItem.findMany({
          where: { ...fixed, availability: Availability.AVAILABLE },
          take: PER_KIND_LIMIT,
          orderBy: { createdAt: "desc" },
        })
      : [],
    wants("VEHICLES")
      ? prisma.vehicleListing.findMany({
          where: { ...fixed, availability: Availability.AVAILABLE, stock: { gt: 0 } },
          take: PER_KIND_LIMIT,
          orderBy: { createdAt: "desc" },
        })
      : [],
    wants("IMPORT") || wants("EXPORT")
      ? prisma.tradeProduct.findMany({
          where: {
            ...fixed,
            direction:
              kind == "IMPORT"
                ? TradeDirection.IMPORT
                : kind == "EXPORT"
                  ? TradeDirection.EXPORT
                  : undefined,
          },
          take: PER_KIND_LIMIT,
          orderBy: { createdAt: "desc" },
        })
      : [],
  ]);

  return [
    ...products.map(
      (product): ShopItem => ({
        itemType: EntityType.SHOP_PRODUCT,
        itemId: product.id,
        kind: "SHOP",
        sku: product.sku,
        name: product.name,
        category: product.category,
        brand: product.brand,
        summary: product.summary,
        image: product.images[0] ?? null,
        price: Number(product.price),
        ...activeSale(product),
        currency: product.currency,
        unit: product.unit,
        stock: product.stockQty,
        minQuantity: 1,
        wholeNumbers: true,
        featured: product.featured,
        createdAt: product.createdAt.toISOString(),
      }),
    ),
    ...gems.map(
      (gem): ShopItem => ({
        itemType: EntityType.GEM_ITEM,
        itemId: gem.id,
        kind: "GEMS",
        sku: gem.sku,
        name: gem.name,
        category: gem.category,
        brand: null,
        summary: [gem.weight ? `${Number(gem.weight)} ${gem.weightUnit}` : null, gem.origin]
          .filter(Boolean)
          .join(" · ") || null,
        image: gem.images[0] ?? null,
        price: Number(gem.price),
        ...noSale,
        currency: gem.currency!,
        unit: "piece",
        stock: 1,
        minQuantity: 1,
        wholeNumbers: true,
        featured: false,
        createdAt: gem.createdAt.toISOString(),
      }),
    ),
    ...vehicles.map(
      (listing): ShopItem => ({
        itemType: EntityType.VEHICLE_LISTING,
        itemId: listing.id,
        kind: "VEHICLES",
        sku: listing.sku,
        name: listing.title,
        category: enumLabel(listing.listingType),
        brand: listing.make,
        summary: listing.partNumber ? `Part no. ${listing.partNumber}` : listing.condition,
        image: listing.images[0] ?? null,
        price: Number(listing.price),
        ...noSale,
        currency: listing.currency!,
        unit: "unit",
        stock: listing.stock,
        minQuantity: 1,
        wholeNumbers: true,
        featured: false,
        createdAt: listing.createdAt.toISOString(),
      }),
    ),
    ...trade.map(
      (product): ShopItem => ({
        itemType: EntityType.TRADE_PRODUCT,
        itemId: product.id,
        kind: product.direction == TradeDirection.IMPORT ? "IMPORT" : "EXPORT",
        sku: product.sku,
        name: product.name,
        category: enumLabel(product.category),
        brand: null,
        summary: product.origin ? `From ${product.origin}` : product.packaging,
        image: product.images[0] ?? null,
        price: Number(product.price),
        ...activeSale({ price: product.price!, compareAtPrice: product.compareAtPrice, saleEndsAt: null }),
        currency: product.currency!,
        unit: product.unit,
        stock: product.stockQty == null ? null : Number(product.stockQty),
        minQuantity: product.minimumOrderQty == null ? 1 : Number(product.minimumOrderQty),
        wholeNumbers: false,
        featured: false,
        createdAt: product.createdAt.toISOString(),
      }),
    ),
  ];
}

const SORTERS: Record<ShopSort, (a: ShopItem, b: ShopItem) => number> = {
  featured: (a, b) =>
    Number(b.featured) - Number(a.featured) ||
    b.discountPercent - a.discountPercent ||
    b.createdAt.localeCompare(a.createdAt),
  newest: (a, b) => b.createdAt.localeCompare(a.createdAt),
  "price-asc": (a, b) => a.price - b.price,
  "price-desc": (a, b) => b.price - a.price,
  discount: (a, b) => b.discountPercent - a.discountPercent || a.price - b.price,
};

export async function getShopCatalogue(
  filters: ShopFilters,
  page: { skip: number; take: number },
) {
  const all = await loadItems(filters.kind);
  const search = filters.search?.toLowerCase();

  // categories of the chosen kind, before the other filters narrow them down
  const categoryCounts = new Map<string, number>();
  for (const item of all) {
    categoryCounts.set(item.category, (categoryCounts.get(item.category) ?? 0) + 1);
  }

  const matching = all
    .filter((item) => {
      if (search) {
        const text = [item.name, item.sku, item.category, item.brand, item.summary]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!text.includes(search)) {
          return false;
        }
      }
      if (filters.category && item.category.toLowerCase() != filters.category.toLowerCase()) {
        return false;
      }
      if (filters.currency && item.currency != filters.currency) {
        return false;
      }
      if (filters.minPrice != undefined && item.price < filters.minPrice) {
        return false;
      }
      if (filters.maxPrice != undefined && item.price > filters.maxPrice) {
        return false;
      }
      if (filters.onSale && item.discountPercent == 0) {
        return false;
      }
      if (filters.inStock && item.stock != null && item.stock <= 0) {
        return false;
      }
      return true;
    })
    .sort(SORTERS[filters.sort]);

  return {
    items: matching.slice(page.skip, page.skip + page.take),
    totalCount: matching.length,
    categories: [...categoryCounts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    currencies: [...new Set(all.map((item) => item.currency))].sort(),
  };
}
