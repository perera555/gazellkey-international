import { createHash, timingSafeEqual } from "node:crypto";
import { ApiError } from "@/utils/handleError";

// PayHere (Sri Lanka): card payments from Sri Lankan and foreign customers
// (Visa, Mastercard, Amex) plus local wallets, paid out to a Sri Lankan bank.
// Docs: https://support.payhere.lk/api-&-mobile-sdk/checkout-api
//
//   PAYHERE_MERCHANT_ID / PAYHERE_MERCHANT_SECRET  - checkout (required)
//   PAYHERE_APP_ID / PAYHERE_APP_SECRET            - status check + refunds (optional)
//   PAYHERE_SANDBOX="false"                        - live payments

// PayHere checkout only takes these two currencies
export const PAYHERE_CURRENCIES = ["LKR", "USD"];

export function isPayHereEnabled() {
  return Boolean(process.env.PAYHERE_MERCHANT_ID && process.env.PAYHERE_MERCHANT_SECRET);
}

function baseUrl() {
  return process.env.PAYHERE_SANDBOX == "false"
    ? "https://www.payhere.lk" // "www" is required by PayHere
    : "https://sandbox.payhere.lk";
}

function credentials() {
  const merchantId = process.env.PAYHERE_MERCHANT_ID;
  const merchantSecret = process.env.PAYHERE_MERCHANT_SECRET;
  if (!merchantId || !merchantSecret) {
    throw new ApiError(503, "PayHere payments are not set up yet. Please choose another way to pay.");
  }
  return { merchantId, merchantSecret };
}

function md5Upper(text: string) {
  return createHash("md5").update(text).digest("hex").toUpperCase();
}

// 1234.5 -> "1234.50" (two decimals, no thousands separator, as PayHere wants)
export function payHereAmount(cents: number) {
  return (cents / 100).toFixed(2);
}

// Values PayHere refuses: emojis, tags. Keep plain text, limited length.
function plain(value: string | null | undefined, max = 100) {
  return (value ?? "").replace(/[<>]/g, "").replace(/[^\x20-\x7E -ɏ]/g, "").trim().slice(0, max);
}

export type PayHereCheckout = {
  orderId: string; // our checkout reference
  items: string;
  currency: string;
  amountCents: number;
  customer: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    address: string;
    city: string;
    country: string;
  };
  returnUrl: string;
  cancelUrl: string;
  notifyUrl: string;
};

// The fields of the form the browser POSTs to PayHere's payment page.
// The hash (with the merchant secret) is made here, never in the browser.
export function payHereCheckoutForm(checkout: PayHereCheckout) {
  const { merchantId, merchantSecret } = credentials();
  const amount = payHereAmount(checkout.amountCents);
  const hash = md5Upper(
    merchantId + checkout.orderId + amount + checkout.currency + md5Upper(merchantSecret),
  );
  const customer = checkout.customer;

  return {
    action: `${baseUrl()}/pay/checkout`,
    fields: {
      merchant_id: merchantId,
      return_url: checkout.returnUrl,
      cancel_url: checkout.cancelUrl,
      notify_url: checkout.notifyUrl,
      first_name: plain(customer.firstName, 50),
      last_name: plain(customer.lastName, 50) || "-",
      email: customer.email,
      phone: plain(customer.phone, 20),
      address: plain(customer.address, 100),
      city: plain(customer.city, 50),
      country: plain(customer.country, 50),
      order_id: checkout.orderId,
      items: plain(checkout.items, 100),
      currency: checkout.currency,
      amount: amount,
      custom_1: checkout.orderId,
      hash: hash,
    } as Record<string, string>,
  };
}

// Checks the md5sig PayHere sends to notify_url, so nobody can fake a payment
export function verifyPayHereNotification(form: Record<string, string>) {
  const { merchantId, merchantSecret } = credentials();
  if (form.merchant_id != merchantId) {
    return false;
  }
  const expected = md5Upper(
    form.merchant_id +
      form.order_id +
      form.payhere_amount +
      form.payhere_currency +
      form.status_code +
      md5Upper(merchantSecret),
  );
  const received = Buffer.from(String(form.md5sig ?? "").toUpperCase());
  return received.length == expected.length && timingSafeEqual(received, Buffer.from(expected));
}

// ── Merchant API (OAuth): status check and refunds ──
// Needs a Business App: PayHere portal > Settings > Business Apps,
// with the "Payment Retrieval" and "Refund" permissions.

export function isPayHereApiEnabled() {
  return Boolean(process.env.PAYHERE_APP_ID && process.env.PAYHERE_APP_SECRET);
}

let token: { value: string; expiresAt: number } | null = null;

async function accessToken() {
  if (token && token.expiresAt > Date.now() + 30_000) {
    return token.value;
  }
  const appId = process.env.PAYHERE_APP_ID;
  const appSecret = process.env.PAYHERE_APP_SECRET;
  if (!appId || !appSecret) {
    throw new ApiError(503, "PayHere API is not set up (PAYHERE_APP_ID / PAYHERE_APP_SECRET).");
  }
  const response = await fetch(`${baseUrl()}/merchant/v1/oauth/token`, {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`${appId}:${appSecret}`).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) {
    throw new ApiError(502, "PayHere refused the API login. Check PAYHERE_APP_ID / PAYHERE_APP_SECRET.");
  }
  token = {
    value: body.access_token,
    expiresAt: Date.now() + Number(body.expires_in ?? 300) * 1000,
  };
  return token.value;
}

export type PayHereRecord = {
  payment_id: number | string;
  order_id: string;
  status: string; // RECEIVED, REFUNDED, CHARGEBACKED ...
  currency: string;
  amount: number | string;
};

// The payments PayHere has for one order id, [] when there are none.
// null when the API is not set up.
export async function findPayHerePayments(orderId: string): Promise<PayHereRecord[] | null> {
  if (!isPayHereApiEnabled()) {
    return null;
  }
  const response = await fetch(
    `${baseUrl()}/merchant/v1/payment/search?order_id=${encodeURIComponent(orderId)}`,
    { headers: { authorization: `Bearer ${await accessToken()}`, "content-type": "application/json" } },
  );
  const body = await response.json().catch(() => ({}));
  return Array.isArray(body.data) ? body.data : [];
}

// Refunds (part of) a payment back to the customer's card. Returns PayHere's refund number.
export async function refundPayHerePayment(
  paymentId: string,
  description: string,
  amountCents?: number, // undefined = full refund
) {
  const response = await fetch(`${baseUrl()}/merchant/v1/payment/refund`, {
    method: "POST",
    headers: { authorization: `Bearer ${await accessToken()}`, "content-type": "application/json" },
    body: JSON.stringify({
      payment_id: paymentId,
      description: plain(description, 200) || "Refund",
      ...(amountCents != undefined ? { amount: payHereAmount(amountCents) } : {}),
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (body.status != 1) {
    throw new ApiError(502, `PayHere could not refund this payment: ${body.msg ?? "unknown error"}`);
  }
  return String(body.data);
}
