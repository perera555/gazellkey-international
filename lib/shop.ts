import prisma from "@/lib/prisma";
import Stripe from "stripe";
import { Prisma } from "@/app/generated/prisma/client";
import {
  Availability,
  Division,
  EntityType,
  OrderStatus,
  PaymentMethod,
  PaymentProvider,
  PaymentStatus,
  PricingMode,
  PublishStatus,
  Role,
} from "@/app/generated/prisma/enums";
import { findOrCreateCustomer, getCustomerForUser } from "@/lib/customers";
import { notifyCustomer } from "@/lib/notifications";
import { addPaymentToOrder } from "@/lib/payments";
import {
  findPayHerePayments,
  isPayHereEnabled,
  PAYHERE_CURRENCIES,
  payHereCheckoutForm,
} from "@/lib/payhere";
import { releaseOrderStock, reserveStock, SHOP_ORDER_SOURCE } from "@/lib/stock";
import {
  centsToStripeAmount,
  getStripe,
  isStripeEnabled,
  stripeAmountToCents,
  toStripeAmount,
  websiteUrl,
} from "@/lib/stripe";
import { divisionOf } from "@/lib/trade";
import { CheckoutRequest, ShopPaymentMethod } from "@/types/dto/shop";
import { RequestUserType } from "@/types/requestUser";
import { audit } from "@/utils/audit";
import { ApiError } from "@/utils/handleError";
import { fromCents, toCents } from "@/utils/money";
import { divisionReference, nextReference } from "@/utils/reference";

// Online shop: retail shop products, plus fixed-price gems, vehicles /
// spare parts and trade products.
//
//   1. POST /api/shop/checkout - cart priced from the database, stock held,
//      one PENDING order + payment per division, then by payment method:
//        PAYHERE        -> browser posts a signed form to PayHere's page
//        STRIPE         -> browser goes to Stripe Checkout
//        BANK_TRANSFER  -> customer is shown our bank details
//   2. paid -> payments PAID, orders CONFIRMED, items SOLD
//        PAYHERE: POST /api/shop/payhere/notify   STRIPE: POST /api/shop/webhook
//        BANK_TRANSFER: Finance confirms in the admin portal
//   3. not paid in time -> payments FAILED, orders CANCELLED, stock given back
//
// All payments of one checkout share a checkoutReference (CHK-2026-00001),
// which is also the order id sent to PayHere / Stripe.

// Card checkouts hold stock this long (PayHere pages never expire by themselves)
const CARD_HOLD_MINUTES = 60;
// Stripe's own session lifetime (its minimum is 30 minutes)
const STRIPE_SESSION_MINUTES = 30;

function bankHoldDays() {
  const days = Number(process.env.BANK_TRANSFER_HOLD_DAYS ?? 3);
  return Number.isFinite(days) && days > 0 ? days : 3;
}

// Our bank account for transfers, from .env. null = bank transfer not offered.
// Each value is shown on its own line on the website and in the email.
export function bankTransferDetails() {
  const value = (name: string) => process.env[name]?.trim() || null;
  const details = {
    accountName: value("BANK_ACCOUNT_NAME"),
    accountNumber: value("BANK_ACCOUNT_NUMBER"),
    bankName: value("BANK_NAME"),
    branch: value("BANK_BRANCH"),
    swiftCode: value("BANK_SWIFT_CODE"), // for transfers from abroad
    bankAddress: value("BANK_ADDRESS"),
    note: value("BANK_TRANSFER_NOTE"),
  };
  if (!details.accountName || !details.accountNumber || !details.bankName) {
    return null;
  }
  return details;
}

type BankDetails = NonNullable<ReturnType<typeof bankTransferDetails>>;

function bankDetailsText(details: BankDetails) {
  return [
    `Account name: ${details.accountName}`,
    `Account number: ${details.accountNumber}`,
    `Bank: ${details.bankName}`,
    details.branch ? `Branch: ${details.branch}` : null,
    details.swiftCode ? `SWIFT / BIC (from abroad): ${details.swiftCode}` : null,
    details.bankAddress ? `Bank address: ${details.bankAddress}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

type MethodOption = {
  id: ShopPaymentMethod;
  label: string;
  description: string;
  currencies: string[] | null; // null = every currency
};

// Payment methods shown at checkout (GET /api/shop/options)
export function shopOptions() {
  const methods: MethodOption[] = [];
  if (isPayHereEnabled()) {
    methods.push({
      id: "PAYHERE",
      label: "Card or mobile wallet (PayHere)",
      description:
        "Visa, Mastercard and Amex from any country, plus eZ Cash, Genie and other Sri Lankan wallets.",
      currencies: PAYHERE_CURRENCIES,
    });
  }
  if (isStripeEnabled()) {
    methods.push({
      id: "STRIPE",
      label: "International card (Stripe)",
      description: "Visa, Mastercard, Amex and other cards, Apple Pay and Google Pay.",
      currencies: null,
    });
  }
  const bank = bankTransferDetails();
  if (bank) {
    methods.push({
      id: "BANK_TRANSFER",
      label: "Bank transfer",
      description: `Local or international (SWIFT) transfer. We hold your items for ${bankHoldDays()} days while the money arrives.`,
      currencies: null,
    });
  }
  return { methods: methods };
}

const PROVIDER_OF: Record<ShopPaymentMethod, PaymentProvider | null> = {
  PAYHERE: PaymentProvider.PAYHERE,
  STRIPE: PaymentProvider.STRIPE,
  BANK_TRANSFER: null,
};

function methodOf(payment: { provider: PaymentProvider | null }): ShopPaymentMethod {
  return payment.provider ?? "BANK_TRANSFER";
}

// ─────────────────────────── Pricing the cart ───────────────────────────

type CartLine = {
  itemType: EntityType;
  itemId: string;
  division: Division;
  description: string;
  unit: string;
  quantity: number;
  unitPrice: Prisma.Decimal;
  currency: string;
  lineCents: number;
  image: string | undefined;
};

type CartItem = CheckoutRequest["items"][number];

function notListed() {
  return new ApiError(404, "An item in your cart is no longer listed. Please remove it.");
}

function notForSale(name: string) {
  return new ApiError(
    409,
    `${name} cannot be bought online. Please send us an enquiry for a price.`,
  );
}

function cartLine(
  item: CartItem,
  details: {
    division: Division;
    description: string;
    unit: string;
    price: Prisma.Decimal;
    currency: string;
    images: string[];
  },
): CartLine {
  return {
    itemType: item.itemType,
    itemId: item.itemId,
    division: details.division,
    description: details.description,
    unit: details.unit,
    quantity: item.quantity,
    unitPrice: details.price,
    currency: details.currency.toUpperCase(),
    lineCents: Math.round(item.quantity * toCents(details.price)),
    // Stripe only shows images from public https URLs
    image: details.images.find((image) => image.startsWith("https://")),
  };
}

// Reads the real price and checks that the item can be sold right now
async function priceItem(item: CartItem): Promise<CartLine> {
  if (item.itemType == EntityType.SHOP_PRODUCT) {
    const product = await prisma.shopProduct.findUnique({ where: { id: item.itemId } });
    if (product == null || product.status != PublishStatus.PUBLISHED) {
      throw notListed();
    }
    if (product.stockQty < 1) {
      throw new ApiError(409, `${product.name} is out of stock.`);
    }
    if (!Number.isInteger(item.quantity)) {
      throw new ApiError(400, `The quantity of ${product.name} must be a whole number.`);
    }
    if (item.quantity > product.stockQty) {
      throw new ApiError(409, `Only ${product.stockQty} of ${product.name} in stock.`);
    }
    return cartLine(item, {
      division: product.division,
      description: `${product.name} (${product.sku})`,
      unit: product.unit,
      price: product.price,
      currency: product.currency,
      images: product.images,
    });
  }

  if (item.itemType == EntityType.GEM_ITEM) {
    const gem = await prisma.gemItem.findUnique({ where: { id: item.itemId } });
    if (gem == null || gem.status != PublishStatus.PUBLISHED) {
      throw notListed();
    }
    if (gem.pricingMode != PricingMode.FIXED || gem.price == null || !gem.currency) {
      throw notForSale(gem.name);
    }
    if (gem.availability != Availability.AVAILABLE) {
      throw new ApiError(409, `${gem.name} is no longer available.`);
    }
    if (item.quantity != 1) {
      throw new ApiError(400, `${gem.name} is a single piece. The quantity must be 1.`);
    }
    return cartLine(item, {
      division: Division.GEMS,
      description: `${gem.name} (${gem.sku})`,
      unit: "piece",
      price: gem.price,
      currency: gem.currency,
      images: gem.images,
    });
  }

  if (item.itemType == EntityType.VEHICLE_LISTING) {
    const listing = await prisma.vehicleListing.findUnique({
      where: { id: item.itemId },
    });
    if (listing == null || listing.status != PublishStatus.PUBLISHED) {
      throw notListed();
    }
    if (
      listing.pricingMode != PricingMode.FIXED ||
      listing.price == null ||
      !listing.currency
    ) {
      throw notForSale(listing.title);
    }
    if (listing.availability != Availability.AVAILABLE || listing.stock < 1) {
      throw new ApiError(409, `${listing.title} is no longer available.`);
    }
    if (!Number.isInteger(item.quantity)) {
      throw new ApiError(400, `The quantity of ${listing.title} must be a whole number.`);
    }
    if (item.quantity > listing.stock) {
      throw new ApiError(409, `Only ${listing.stock} of ${listing.title} in stock.`);
    }
    return cartLine(item, {
      division: Division.VEHICLES,
      description: `${listing.title} (${listing.sku})`,
      unit: "unit",
      price: listing.price,
      currency: listing.currency,
      images: listing.images,
    });
  }

  const product = await prisma.tradeProduct.findUnique({
    where: { id: item.itemId },
  });
  if (product == null || product.status != PublishStatus.PUBLISHED) {
    throw notListed();
  }
  if (
    product.pricingMode != PricingMode.FIXED ||
    product.price == null ||
    !product.currency
  ) {
    throw notForSale(product.name);
  }
  if (Math.round(item.quantity * 1000) != item.quantity * 1000) {
    throw new ApiError(400, `The quantity of ${product.name} can have at most 3 decimals.`);
  }
  if (
    product.minimumOrderQty != null &&
    item.quantity < Number(product.minimumOrderQty)
  ) {
    throw new ApiError(
      400,
      `The minimum order of ${product.name} is ${Number(product.minimumOrderQty)} ${product.unit}.`,
    );
  }
  if (product.stockQty != null && item.quantity > Number(product.stockQty)) {
    throw new ApiError(
      409,
      `Only ${Number(product.stockQty)} ${product.unit} of ${product.name} in stock.`,
    );
  }
  return cartLine(item, {
    division: divisionOf(product.direction),
    description: `${product.name} (${product.sku})`,
    unit: product.unit,
    price: product.price,
    currency: product.currency,
    images: product.images,
  });
}

async function priceCart(items: CartItem[]) {
  // the same item twice -> one line with the quantities added up
  const merged = new Map<string, CartItem>();
  for (const item of items) {
    const key = `${item.itemType}:${item.itemId}`;
    const existing = merged.get(key);
    merged.set(
      key,
      existing
        ? { ...existing, quantity: existing.quantity + item.quantity }
        : item,
    );
  }

  const lines: CartLine[] = [];
  for (const item of merged.values()) {
    lines.push(await priceItem(item));
  }
  return lines;
}

function stripeLineItem(
  line: CartLine,
): Stripe.Checkout.SessionCreateParams.LineItem {
  // Stripe quantities are whole numbers; 2.5 kg is sent as one line of 2.5 kg
  const whole = Number.isInteger(line.quantity);
  return {
    quantity: whole ? line.quantity : 1,
    price_data: {
      currency: line.currency.toLowerCase(),
      unit_amount: whole
        ? toStripeAmount(line.unitPrice, line.currency)
        : centsToStripeAmount(line.lineCents, line.currency),
      product_data: {
        name: whole
          ? line.description
          : `${line.description} - ${line.quantity} ${line.unit}`,
        images: line.image ? [line.image] : undefined,
      },
    },
  };
}

// ─────────────────────────── Starting a checkout ───────────────────────────

export type CheckoutStart =
  | { redirect: string; checkoutReference: string; orders: string[] }
  | {
      form: { action: string; fields: Record<string, string> };
      checkoutReference: string;
      orders: string[];
    };

export async function startCheckout(
  user: RequestUserType,
  request: CheckoutRequest,
): Promise<CheckoutStart> {
  if (user.role != Role.CUSTOMER) {
    throw new ApiError(403, "Please sign in with a customer account to buy online.");
  }
  const method = request.paymentMethod;
  const option = shopOptions().methods.find((each) => each.id == method);
  if (option == undefined) {
    throw new ApiError(400, "This payment method is not available. Please choose another one.");
  }

  // free the stock of checkouts nobody finished, so it can be bought now
  await expireStaleCheckouts().catch((error) => console.error("Checkout sweep failed", error));

  const lines = await priceCart(request.items);
  const currency = lines[0].currency;
  if (lines.some((line) => line.currency != currency)) {
    throw new ApiError(
      400,
      "Items priced in different currencies must be paid separately. Please check out one currency at a time.",
    );
  }
  if (option.currencies != null && !option.currencies.includes(currency)) {
    throw new ApiError(
      400,
      `${option.label} accepts ${option.currencies.join(" or ")} only. Please choose another payment method.`,
    );
  }

  const delivery = request.delivery;
  const { checkoutReference, customer, orders, totalCents } = await prisma.$transaction(
    async (tx) => {
      let customer = await findOrCreateCustomer(
        {
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          userId: user.id,
        },
        tx,
      );
      // fill in contact details the customer record does not have yet
      if (!customer.phone || !customer.country || !customer.address) {
        customer = await tx.customer.update({
          where: { id: customer.id },
          data: {
            phone: customer.phone ?? delivery.phone,
            country: customer.country ?? delivery.country,
            address: customer.address ?? `${delivery.address}, ${delivery.city}`,
          },
        });
      }
      const checkoutReference = await nextReference("CHK", tx);

      for (const line of lines) {
        await reserveStock(tx, line);
      }

      // orders belong to one division, so a mixed cart makes several orders
      const byDivision = new Map<Division, CartLine[]>();
      for (const line of lines) {
        byDivision.set(line.division, [...(byDivision.get(line.division) ?? []), line]);
      }

      const orders = [];
      let totalCents = 0;
      for (const [division, divisionLines] of byDivision) {
        const orderCents = divisionLines.reduce((sum, line) => sum + line.lineCents, 0);
        totalCents += orderCents;
        const order = await tx.order.create({
          data: {
            reference: await divisionReference(division, "ORD", tx),
            division: division,
            customerId: customer.id,
            currency: currency,
            total: fromCents(orderCents),
            details: {
              source: SHOP_ORDER_SOURCE,
              checkout: checkoutReference,
              paymentMethod: method,
              delivery: delivery,
            },
            items: {
              create: divisionLines.map((line, index) => ({
                description: line.description,
                itemType: line.itemType,
                itemId: line.itemId,
                quantity: line.quantity,
                unit: line.unit,
                unitPrice: line.unitPrice,
                lineTotal: fromCents(line.lineCents),
                sortOrder: index,
              })),
            },
          },
        });
        await tx.payment.create({
          data: {
            reference: await nextReference("PAY", tx),
            orderId: order.id,
            customerId: customer.id,
            amount: order.total,
            currency: currency,
            method: method == "BANK_TRANSFER" ? PaymentMethod.BANK_TRANSFER : PaymentMethod.CARD_ONLINE,
            provider: PROVIDER_OF[method],
            checkoutReference: checkoutReference,
            note:
              method == "BANK_TRANSFER"
                ? `Online shop - bank transfer, reference ${checkoutReference}`
                : `Online shop - card payment (${option.label})`,
          },
        });
        orders.push(order);
      }
      return { checkoutReference, customer, orders, totalCents };
    },
  );

  const references = orders.map((order) => order.reference);
  const successUrl = `${websiteUrl()}/checkout/success?checkout=${checkoutReference}`;
  const cancelUrl = `${websiteUrl()}/cart?cancelled=${checkoutReference}`;

  await audit({
    userId: user.id,
    action: "checkout.started",
    entityType: "PAYMENT",
    details: { checkoutReference, orders: references, currency, paymentMethod: method },
  });

  if (method == "BANK_TRANSFER") {
    const bank = bankTransferDetails()!;
    await notifyCustomer({
      customer: customer,
      subject: `Order ${references.join(", ")} - bank transfer details`,
      body:
        `Dear ${customer.firstName},\n\nThank you for your order. Please transfer ${currency} ${fromCents(totalCents).toFixed(2)} ` +
        `within ${bankHoldDays()} days and write ${checkoutReference} as the payment reference.\n\n` +
        `${bankDetailsText(bank)}\n\n` +
        (bank.note ? `${bank.note}\n\n` : "") +
        `We hold your items until then. When the money arrives we confirm your order and your receipt is ready under My account > Payments.`,
      entityType: EntityType.ORDER,
      entityId: orders[0].id,
    });
    return { redirect: successUrl, checkoutReference, orders: references };
  }

  if (method == "PAYHERE") {
    const form = payHereCheckoutForm({
      orderId: checkoutReference,
      items: `Gazellekey order ${references.join(", ")}`,
      currency: currency,
      amountCents: totalCents,
      customer: {
        firstName: user.firstName,
        lastName: user.lastName,
        email: customer.email,
        phone: delivery.phone,
        address: delivery.address,
        city: delivery.city,
        country: delivery.country,
      },
      returnUrl: successUrl,
      cancelUrl: cancelUrl,
      // must be reachable from the internet (not localhost) - see .env.example
      notifyUrl: process.env.PAYHERE_NOTIFY_URL || `${websiteUrl()}/api/shop/payhere/notify`,
    });
    return { form, checkoutReference, orders: references };
  }

  // STRIPE
  let session: Stripe.Checkout.Session;
  try {
    session = await getStripe().checkout.sessions.create(
      {
        mode: "payment",
        customer_email: customer.email,
        client_reference_id: checkoutReference,
        metadata: { checkout: checkoutReference },
        payment_intent_data: { metadata: { checkout: checkoutReference } },
        line_items: lines.map(stripeLineItem),
        success_url: successUrl,
        cancel_url: cancelUrl,
        expires_at: Math.floor(Date.now() / 1000) + STRIPE_SESSION_MINUTES * 60,
      },
      { idempotencyKey: checkoutReference },
    );
  } catch (error) {
    console.error("Stripe checkout could not be created", error);
    await cancelCheckout(checkoutReference, "Stripe could not open the payment page");
    // e.g. "Amount must be at least 50 cents" is useful to show; key errors are not
    const detail =
      error instanceof Stripe.errors.StripeInvalidRequestError ? ` ${error.message}` : "";
    throw new ApiError(502, `The card payment could not be started.${detail}`);
  }
  await prisma.payment.updateMany({
    where: { checkoutReference: checkoutReference },
    data: { providerReference: session.id },
  });
  return { redirect: session.url!, checkoutReference, orders: references };
}

// ─────────────────────────── Paid ───────────────────────────

type GatewayPayment = {
  provider: PaymentProvider;
  amountCents: number;
  currency: string;
  providerReference: string; // used for refunds
};

// A gateway says the checkout is paid. Safe to call more than once
// (gateways repeat notifications, and the thank-you page checks too).
export async function completeCheckout(checkoutReference: string, paid: GatewayPayment) {
  const payments = await prisma.payment.findMany({
    where: { checkoutReference: checkoutReference },
    include: { order: { include: { items: true } }, customer: true },
    orderBy: { createdAt: "asc" },
  });
  if (payments.length == 0 || payments.some((payment) => payment.provider != paid.provider)) {
    return; // not from this shop, or not paid through this gateway
  }

  const currency = payments[0].currency;
  const expectedCents = payments.reduce((sum, payment) => sum + toCents(payment.amount), 0);
  if (paid.amountCents != expectedCents || paid.currency.toUpperCase() != currency) {
    // leave the payments PENDING for Finance to check with the gateway
    console.error(`Paid amount does not match checkout ${checkoutReference}`);
    await audit({
      action: "payment.amount_mismatch",
      entityType: "PAYMENT",
      entityId: payments[0].id,
      details: {
        checkoutReference,
        expected: fromCents(expectedCents),
        paid: fromCents(paid.amountCents),
        paidCurrency: paid.currency,
        provider: paid.provider,
      },
    });
    return;
  }

  const paidNow: typeof payments = [];
  for (const payment of payments) {
    if (payment.status == PaymentStatus.PENDING) {
      const changed = await prisma.$transaction(async (tx) => {
        const result = await tx.payment.updateMany({
          where: { id: payment.id, status: PaymentStatus.PENDING },
          data: {
            status: PaymentStatus.PAID,
            providerReference: paid.providerReference,
            paidAt: new Date(),
          },
        });
        if (result.count == 1) {
          await addPaymentToOrder(tx, payment);
        }
        return result.count == 1;
      });
      if (changed) {
        paidNow.push(payment);
      }
    } else if (
      payment.status == PaymentStatus.FAILED &&
      payment.order.status == OrderStatus.CANCELLED
    ) {
      // paid after we gave up waiting: take the order back if the items are still free
      if (await reviveOrder(payment, paid.providerReference)) {
        paidNow.push(payment);
      }
    }
  }

  for (const payment of paidNow) {
    await audit({
      action: "payment.confirmed",
      entityType: "PAYMENT",
      entityId: payment.id,
      details: {
        amount: Number(payment.amount),
        currency,
        provider: paid.provider,
        providerReference: paid.providerReference,
      },
    });
  }

  if (paidNow.length > 0) {
    const customer = paidNow[0].customer;
    const references = paidNow.map((payment) => payment.order.reference).join(", ");
    const total = fromCents(paidNow.reduce((sum, payment) => sum + toCents(payment.amount), 0));
    await notifyCustomer({
      customer: customer,
      subject: `Payment received - order ${references}`,
      body: `Dear ${customer.firstName},\n\nThank you for your order. We received your card payment of ${currency} ${total.toFixed(2)} for ${references}. Your receipt is ready to download under My account > Payments: ${websiteUrl()}/account/payments\n\nWe will contact you about delivery.`,
      entityType: EntityType.ORDER,
      entityId: paidNow[0].orderId,
    });
  }
}

async function reviveOrder(
  payment: Prisma.PaymentGetPayload<{ include: { order: { include: { items: true } } } }>,
  providerReference: string,
) {
  try {
    await prisma.$transaction(async (tx) => {
      const reopened = await tx.order.updateMany({
        where: { id: payment.orderId, status: OrderStatus.CANCELLED },
        data: { status: OrderStatus.PENDING },
      });
      const repaid = await tx.payment.updateMany({
        where: { id: payment.id, status: PaymentStatus.FAILED },
        data: { status: PaymentStatus.PAID, providerReference, paidAt: new Date() },
      });
      if (reopened.count == 0 || repaid.count == 0) {
        throw new ApiError(409, "Order changed");
      }
      for (const item of payment.order.items) {
        await reserveStock(tx, item); // throws when the item was sold meanwhile
      }
      await addPaymentToOrder(tx, payment);
    });
    return true;
  } catch (error) {
    // Money arrived but the items are gone: Finance must refund it
    await audit({
      action: "payment.paid_after_cancel",
      entityType: "PAYMENT",
      entityId: payment.id,
      details: {
        checkoutReference: payment.checkoutReference,
        providerReference,
        reason: error instanceof Error ? error.message : String(error),
      },
    });
    console.error(`Payment ${payment.reference} arrived after its order was cancelled - refund needed`);
    return false;
  }
}

// Stripe: a paid Checkout Session (webhook or thank-you page)
export async function completeStripeSession(session: Stripe.Checkout.Session) {
  const checkoutReference = session.metadata?.checkout;
  if (!checkoutReference || session.payment_status != "paid" || !session.currency) {
    return;
  }
  const paymentIntent =
    typeof session.payment_intent == "string"
      ? session.payment_intent
      : (session.payment_intent?.id ?? session.id);
  await completeCheckout(checkoutReference, {
    provider: PaymentProvider.STRIPE,
    amountCents: stripeAmountToCents(session.amount_total ?? -1, session.currency),
    currency: session.currency,
    providerReference: paymentIntent,
  });
}

// ─────────────────────────── Not paid ───────────────────────────

// The checkout ended without payment (expired, failed, gateway down):
// payments FAILED, orders CANCELLED, held stock given back. Safe to repeat.
export async function cancelCheckout(checkoutReference: string, reason: string) {
  const cancelledOrderIds = await prisma.$transaction(async (tx) => {
    const payments = await tx.payment.findMany({
      where: { checkoutReference: checkoutReference, status: PaymentStatus.PENDING },
    });
    const orderIds: string[] = [];
    for (const payment of payments) {
      const changed = await tx.payment.updateMany({
        where: { id: payment.id, status: PaymentStatus.PENDING },
        data: { status: PaymentStatus.FAILED, note: reason },
      });
      if (changed.count == 0) {
        continue;
      }
      const cancelled = await tx.order.updateMany({
        where: { id: payment.orderId, status: OrderStatus.PENDING },
        data: { status: OrderStatus.CANCELLED },
      });
      if (cancelled.count == 1) {
        await releaseOrderStock(tx, payment.orderId);
        orderIds.push(payment.orderId);
      }
    }
    return orderIds;
  });

  for (const orderId of cancelledOrderIds) {
    await audit({
      action: "order.checkout_cancelled",
      entityType: "ORDER",
      entityId: orderId,
      details: { checkoutReference, reason },
    });
  }
  return cancelledOrderIds.length;
}

// Asks the gateway whether a still-pending checkout was paid meanwhile
// (in case its notification is late, or cannot reach a dev machine).
// Best effort: gateway errors are logged, not thrown.
async function syncCheckout(checkoutReference: string) {
  const pending = await prisma.payment.findFirst({
    where: { checkoutReference, status: PaymentStatus.PENDING },
  });
  if (pending == null || pending.provider == null) {
    return;
  }
  try {
    if (pending.provider == PaymentProvider.STRIPE && pending.providerReference?.startsWith("cs_")) {
      const session = await getStripe().checkout.sessions.retrieve(pending.providerReference);
      if (session.payment_status == "paid") {
        await completeStripeSession(session);
      } else if (session.status == "expired") {
        await cancelCheckout(checkoutReference, "Checkout expired");
      }
    } else if (pending.provider == PaymentProvider.PAYHERE) {
      const records = await findPayHerePayments(checkoutReference);
      const received = records?.find((record) => record.status == "RECEIVED");
      if (received) {
        await completeCheckout(checkoutReference, {
          provider: PaymentProvider.PAYHERE,
          amountCents: toCents(received.amount),
          currency: received.currency,
          providerReference: String(received.payment_id),
        });
      }
    }
  } catch (error) {
    console.error(`Could not check checkout ${checkoutReference} with the gateway`, error);
  }
}

// Cancels checkouts that were not paid in time and gives their stock back:
// card checkouts after CARD_HOLD_MINUTES, bank transfers after the hold days.
// Runs before every checkout and before staff change a shop order.
export async function expireStaleCheckouts() {
  const now = Date.now();
  const stale = await prisma.payment.findMany({
    where: {
      status: PaymentStatus.PENDING,
      checkoutReference: { not: null },
      OR: [
        { provider: { not: null }, createdAt: { lt: new Date(now - CARD_HOLD_MINUTES * 60_000) } },
        { provider: null, createdAt: { lt: new Date(now - bankHoldDays() * 86_400_000) } },
      ],
    },
    include: { customer: true, order: true },
    distinct: ["checkoutReference"],
    take: 50,
  });

  for (const payment of stale) {
    const checkoutReference = payment.checkoutReference!;
    await syncCheckout(checkoutReference); // maybe it was paid after all
    if (payment.provider == PaymentProvider.STRIPE && payment.providerReference?.startsWith("cs_")) {
      // close the Stripe page so it cannot be paid any more
      await getStripe().checkout.sessions.expire(payment.providerReference).catch(() => undefined);
    }
    const cancelled = await cancelCheckout(
      checkoutReference,
      payment.provider == null ? "Bank transfer not received in time" : "Not paid in time",
    );
    if (cancelled > 0 && payment.provider == null) {
      await notifyCustomer({
        customer: payment.customer,
        subject: `Order ${payment.order.reference} cancelled - payment not received`,
        body: `Dear ${payment.customer.firstName},\n\nWe did not receive your bank transfer for checkout ${checkoutReference} within ${bankHoldDays()} days, so the order was cancelled and the items released. If you already paid, please reply with your transfer slip and we will sort it out.`,
        entityType: EntityType.ORDER,
        entityId: payment.orderId,
      });
    }
  }
}

// ─────────────────────────── For the customer ───────────────────────────

async function ownedCheckout(user: RequestUserType, checkoutReference: string) {
  const notFound = new ApiError(404, "Checkout not found.");
  if (!/^CHK-\d{4}-\d{5,}$/.test(checkoutReference)) {
    throw notFound;
  }
  const customer = await getCustomerForUser(user.id);
  if (customer == null) {
    throw notFound;
  }
  const mine = { checkoutReference, customerId: customer.id };
  if ((await prisma.payment.count({ where: mine })) == 0) {
    throw notFound;
  }
  return mine;
}

// The customer left the card payment page ("back" / cancel link): release
// the held items at once instead of after CARD_HOLD_MINUTES.
export async function abandonCheckout(user: RequestUserType, checkoutReference: string) {
  const mine = await ownedCheckout(user, checkoutReference);
  await syncCheckout(checkoutReference); // paid in another tab?
  const pending = await prisma.payment.findFirst({
    where: { ...mine, status: PaymentStatus.PENDING },
  });
  if (pending == null || pending.provider == null) {
    return; // paid, already closed, or a bank transfer (nothing to abandon)
  }
  if (pending.provider == PaymentProvider.STRIPE && pending.providerReference?.startsWith("cs_")) {
    try {
      await getStripe().checkout.sessions.expire(pending.providerReference);
    } catch (error) {
      // Stripe refuses when the session is already complete (paid): keep it
      console.error("Stripe session could not be expired", error);
      return;
    }
  }
  await cancelCheckout(checkoutReference, "Customer left the payment page");
}

// For the website's thank-you page: the result of one checkout of the
// signed-in customer (and our bank details for a bank transfer)
export async function getCheckoutResult(user: RequestUserType, checkoutReference: string) {
  const mine = await ownedCheckout(user, checkoutReference);
  await syncCheckout(checkoutReference);

  const payments = await prisma.payment.findMany({
    where: mine,
    orderBy: { createdAt: "asc" },
    include: {
      order: {
        select: {
          id: true,
          reference: true,
          division: true,
          status: true,
          total: true,
          currency: true,
          items: {
            orderBy: { sortOrder: "asc" },
            select: { itemType: true, itemId: true, description: true, quantity: true, unit: true, lineTotal: true },
          },
        },
      },
    },
  });

  const status = payments.every((payment) => payment.status == PaymentStatus.PAID)
    ? "PAID"
    : payments.some((payment) => payment.status == PaymentStatus.FAILED)
      ? "FAILED"
      : "PENDING";
  const paymentMethod = methodOf(payments[0]);

  return {
    checkoutReference,
    status,
    paymentMethod,
    currency: payments[0].currency,
    total: fromCents(payments.reduce((sum, payment) => sum + toCents(payment.amount), 0)),
    // bank transfer still to be made: where to send the money, and until when
    bankTransfer:
      paymentMethod == "BANK_TRANSFER" && status == "PENDING"
        ? {
            ...bankTransferDetails(),
            payBefore: new Date(payments[0].createdAt.getTime() + bankHoldDays() * 86_400_000),
          }
        : null,
    orders: payments.map((payment) => ({
      ...payment.order,
      paymentId: payment.id, // receipt: /api/payments/{paymentId}/receipt
      paymentReference: payment.reference,
      paymentStatus: payment.status,
    })),
  };
}
