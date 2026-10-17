import { Prisma } from "@/app/generated/prisma/client";
import {
  Availability,
  EntityType,
  PublishStatus,
} from "@/app/generated/prisma/enums";
import { ApiError } from "@/utils/handleError";

// Stock of catalogue items bought in the online shop (lib/shop.ts).
// Orders made from quotations do not touch stock; staff manage that by hand.
//
//   checkout started  -> stock held (gem RESERVED, vehicle / trade / shop stock lowered)
//   paid              -> held items become SOLD
//   expired/cancelled -> stock given back

export const SHOP_ORDER_SOURCE = "ONLINE_SHOP";

type Tx = Prisma.TransactionClient;

type StockLine = {
  itemType: EntityType | null;
  itemId: string | null;
  quantity: Prisma.Decimal | number;
  description: string;
};

export function isShopOrder(order: { details: Prisma.JsonValue | null }) {
  const details = order.details;
  return (
    details != null &&
    typeof details == "object" &&
    !Array.isArray(details) &&
    details.source == SHOP_ORDER_SOURCE
  );
}

// Holds the stock of one cart line. Conditional updates, so two customers
// can never both get the last piece.
export async function reserveStock(tx: Tx, line: StockLine) {
  if (line.itemId == null) {
    return;
  }
  const quantity = Number(line.quantity);
  const published = { id: line.itemId, status: PublishStatus.PUBLISHED };

  if (line.itemType == EntityType.GEM_ITEM) {
    const held = await tx.gemItem.updateMany({
      where: { ...published, availability: Availability.AVAILABLE },
      data: { availability: Availability.RESERVED },
    });
    if (held.count == 0) {
      throw new ApiError(409, `${line.description} is no longer available.`);
    }
  } else if (line.itemType == EntityType.VEHICLE_LISTING) {
    const held = await tx.vehicleListing.updateMany({
      where: {
        ...published,
        availability: Availability.AVAILABLE,
        stock: { gte: quantity },
      },
      data: { stock: { decrement: quantity } },
    });
    if (held.count == 0) {
      throw new ApiError(409, `Not enough stock of ${line.description}.`);
    }
    // the last one is held for this customer until they pay
    await tx.vehicleListing.updateMany({
      where: { id: line.itemId, stock: { lte: 0 } },
      data: { availability: Availability.RESERVED },
    });
  } else if (line.itemType == EntityType.SHOP_PRODUCT) {
    const held = await tx.shopProduct.updateMany({
      where: { ...published, stockQty: { gte: quantity } },
      data: { stockQty: { decrement: quantity } },
    });
    if (held.count == 0) {
      throw new ApiError(409, `Not enough stock of ${line.description}.`);
    }
  } else if (line.itemType == EntityType.TRADE_PRODUCT) {
    // no stock figure = stock is not counted for this product
    const held = await tx.tradeProduct.updateMany({
      where: {
        ...published,
        OR: [{ stockQty: null }, { stockQty: { gte: quantity } }],
      },
      data: { stockQty: { decrement: quantity } },
    });
    if (held.count == 0) {
      throw new ApiError(409, `Not enough stock of ${line.description}.`);
    }
  }
}

// Gives back the stock of a cancelled / expired online order
async function releaseStock(tx: Tx, line: StockLine) {
  if (line.itemId == null) {
    return;
  }
  const quantity = Number(line.quantity);
  const held = { in: [Availability.RESERVED, Availability.SOLD] };

  if (line.itemType == EntityType.GEM_ITEM) {
    await tx.gemItem.updateMany({
      where: { id: line.itemId, availability: held },
      data: { availability: Availability.AVAILABLE },
    });
  } else if (line.itemType == EntityType.VEHICLE_LISTING) {
    await tx.vehicleListing.updateMany({
      where: { id: line.itemId },
      data: { stock: { increment: quantity } },
    });
    await tx.vehicleListing.updateMany({
      where: { id: line.itemId, stock: { gt: 0 }, availability: held },
      data: { availability: Availability.AVAILABLE },
    });
  } else if (line.itemType == EntityType.SHOP_PRODUCT) {
    await tx.shopProduct.updateMany({
      where: { id: line.itemId },
      data: { stockQty: { increment: quantity } },
    });
  } else if (line.itemType == EntityType.TRADE_PRODUCT) {
    await tx.tradeProduct.updateMany({
      where: { id: line.itemId, stockQty: { not: null } },
      data: { stockQty: { increment: quantity } },
    });
  }
}

async function markSold(tx: Tx, line: StockLine) {
  if (line.itemId == null) {
    return;
  }
  if (line.itemType == EntityType.GEM_ITEM) {
    await tx.gemItem.updateMany({
      where: { id: line.itemId, availability: Availability.RESERVED },
      data: { availability: Availability.SOLD },
    });
  } else if (line.itemType == EntityType.VEHICLE_LISTING) {
    await tx.vehicleListing.updateMany({
      where: {
        id: line.itemId,
        stock: { lte: 0 },
        availability: Availability.RESERVED,
      },
      data: { availability: Availability.SOLD },
    });
  }
}

async function shopOrderItems(tx: Tx, orderId: string) {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });
  return order != null && isShopOrder(order) ? order.items : [];
}

// Call in the transaction that moves the order to CANCELLED (once only)
export async function releaseOrderStock(tx: Tx, orderId: string) {
  for (const item of await shopOrderItems(tx, orderId)) {
    await releaseStock(tx, item);
  }
}

// Call in the transaction that marks the order fully paid
export async function markOrderItemsSold(tx: Tx, orderId: string) {
  for (const item of await shopOrderItems(tx, orderId)) {
    await markSold(tx, item);
  }
}
