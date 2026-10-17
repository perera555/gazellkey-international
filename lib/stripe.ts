import Stripe from "stripe";
import { ApiError } from "@/utils/handleError";
import { toCents } from "@/utils/money";

// Online card payments go through Stripe Checkout (a payment page hosted by
// Stripe). Card numbers never reach this server (FR-SH-07); we only keep
// Stripe's references. Keys: Stripe dashboard > Developers > API keys.
let client: Stripe | null = null;

export function isStripeEnabled() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new ApiError(
      503,
      "Online card payments are not set up yet. Please contact us to pay.",
    );
  }
  client ??= new Stripe(key);
  return client;
}

// Customer website, where Stripe sends the customer back after paying
export function websiteUrl() {
  return (process.env.WEBSITE_URL ?? "http://localhost:3002").replace(/\/$/, "");
}

// Stripe wants amounts in the smallest unit (cents). A few currencies
// have no minor unit, e.g. JPY 500 is sent as 500, not 50000.
const ZERO_DECIMAL_CURRENCIES = new Set([
  "BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA",
  "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF",
]);

export function centsToStripeAmount(cents: number, currency: string) {
  return ZERO_DECIMAL_CURRENCIES.has(currency.toUpperCase())
    ? Math.round(cents / 100)
    : cents;
}

// Stripe's smallest unit -> our cents
export function stripeAmountToCents(amount: number, currency: string) {
  return ZERO_DECIMAL_CURRENCIES.has(currency.toUpperCase()) ? amount * 100 : amount;
}

export function toStripeAmount(
  amount: number | { toString(): string },
  currency: string,
) {
  return centsToStripeAmount(toCents(amount), currency);
}
