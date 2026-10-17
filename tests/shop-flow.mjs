// Online shop API test: cart checkout, stock holding, PayHere and bank transfer.
//
//   1. npm run dev
//   2. npm run test:shop    (BASE_URL defaults to http://localhost:3000)
//
// Uses ADMIN_EMAIL / ADMIN_PASSWORD from .env and creates its own test items.
// PayHere checks run when PAYHERE_MERCHANT_ID / _SECRET are set (the test
// signs fake PayHere notifications with the secret, no money moves), bank
// transfer checks when BANK_ACCOUNT_NAME / _NUMBER / BANK_NAME are set.
// NEVER run it against production.
import "dotenv/config";
import { createHash } from "node:crypto";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const RUN = Date.now().toString(36);
const PAYHERE = Boolean(process.env.PAYHERE_MERCHANT_ID && process.env.PAYHERE_MERCHANT_SECRET);
const BANK = Boolean(process.env.BANK_ACCOUNT_NAME && process.env.BANK_ACCOUNT_NUMBER && process.env.BANK_NAME);
let passed = 0;
let failed = 0;

function check(name, condition, extra = "") {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name} ${extra}`);
  }
}

function client() {
  let cookie = "";
  async function call(method, path, body, form) {
    const response = await fetch(BASE + path, {
      method,
      headers: {
        ...(cookie ? { cookie } : {}),
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : form,
    });
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) {
      cookie = setCookie.split(";")[0];
    }
    const type = response.headers.get("content-type") || "";
    const data = type.includes("json") ? await response.json() : await response.text();
    return { status: response.status, data };
  }
  return {
    get: (path) => call("GET", path),
    post: (path, body) => call("POST", path, body),
    postForm: (path, fields) => call("POST", path, undefined, new URLSearchParams(fields)),
    put: (path, body) => call("PUT", path, body),
    del: (path) => call("DELETE", path),
    login: (email, password) => call("POST", "/api/auth/login", { email, password }),
  };
}

const md5Upper = (text) => createHash("md5").update(text).digest("hex").toUpperCase();

// A notification as PayHere sends it to notify_url, signed with our secret
function payHereNotification(orderId, amount, currency, statusCode, secret = process.env.PAYHERE_MERCHANT_SECRET) {
  const merchantId = process.env.PAYHERE_MERCHANT_ID;
  return {
    merchant_id: merchantId,
    order_id: orderId,
    payment_id: `32${Date.now()}`,
    payhere_amount: amount,
    payhere_currency: currency,
    status_code: String(statusCode),
    method: "VISA",
    md5sig: md5Upper(merchantId + orderId + amount + currency + statusCode + md5Upper(secret)),
  };
}

const delivery = { phone: "+44 20 7946 0958", address: "10 Downing Street", city: "London", country: "United Kingdom" };

async function main() {
  console.log(`Testing ${BASE} (run ${RUN}, PayHere ${PAYHERE ? "on" : "off"}, bank ${BANK ? "on" : "off"})\n`);
  const admin = client();
  const customer = client();
  const password = "Test-password-123";

  let r = await admin.login(process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD);
  check("admin can log in", r.status == 200);

  const makeGem = async (name, extra) => {
    const res = await admin.post("/api/gems", {
      sku: `${name}-${RUN}`.toUpperCase(), name: `Test ${name}`, itemType: "GEMSTONE",
      category: "Sapphire", description: "Test gem for the shop", status: "PUBLISHED", ...extra,
    });
    return res.data.data?.id;
  };
  const gemId = await makeGem("SHOPGEM", { pricingMode: "FIXED", price: 120, currency: "USD" });
  const gem2Id = await makeGem("BANKGEM", { pricingMode: "FIXED", price: 45000, currency: "LKR" });
  const eurGemId = await makeGem("EURGEM", { pricingMode: "FIXED", price: 99, currency: "EUR" });
  const askGemId = await makeGem("ASKGEM", {});
  check("admin creates test gems", gemId && gem2Id && eurGemId && askGemId);

  r = await admin.post("/api/trade/products", {
    sku: `SHOPTEA-${RUN}`.toUpperCase(), direction: "EXPORT", category: "TEA", name: "Shop Tea",
    description: "Test tea for the shop", unit: "kg", minimumOrderQty: 2, stockQty: 10,
    pricingMode: "FIXED", price: 8.5, currency: "USD", status: "PUBLISHED",
  });
  check("admin creates fixed-price tea with stock", r.status == 201, JSON.stringify(r.data));
  const teaId = r.data.data?.id;

  const email = `shopper.${RUN}@test.local`;
  await client().post("/api/auth/register", { email, firstName: "Shop", lastName: "Per", password });
  r = await customer.login(email, password);
  check("customer logs in", r.status == 200);

  const gem = { itemType: "GEM_ITEM", itemId: gemId, quantity: 1 };
  const order = (items, paymentMethod) => ({ items, paymentMethod, delivery });

  console.log("\nCheckout rules");
  r = await client().get("/api/shop/options");
  const methods = (r.data.data?.methods ?? []).map((method) => method.id);
  check("options list the methods set up in .env",
    methods.includes("PAYHERE") == PAYHERE && methods.includes("BANK_TRANSFER") == BANK, JSON.stringify(methods));
  r = await client().post("/api/shop/checkout", order([gem], "BANK_TRANSFER"));
  check("checkout needs a login (401)", r.status == 401);
  r = await admin.post("/api/shop/checkout", order([gem], "BANK_TRANSFER"));
  check("staff accounts cannot shop (403)", r.status == 403);
  r = await customer.post("/api/shop/checkout", { ...order([gem], "BANK_TRANSFER"), delivery: { ...delivery, phone: "" } });
  check("delivery phone is required (400)", r.status == 400);
  if (!process.env.STRIPE_SECRET_KEY) {
    r = await customer.post("/api/shop/checkout", order([gem], "STRIPE"));
    check("a method that is not set up is refused (400)", r.status == 400);
  }

  if (PAYHERE) {
    console.log("\nPayHere");
    r = await customer.post("/api/shop/checkout", order([{ itemType: "GEM_ITEM", itemId: eurGemId, quantity: 1 }], "PAYHERE"));
    check("PayHere refuses EUR prices (LKR / USD only)", r.status == 400, JSON.stringify(r.data));
    r = await customer.post("/api/shop/checkout", order([{ ...gem, quantity: 2 }], "PAYHERE"));
    check("a gem is one piece (400)", r.status == 400);
    r = await customer.post("/api/shop/checkout", order([{ itemType: "GEM_ITEM", itemId: askGemId, quantity: 1 }], "PAYHERE"));
    check("price-on-request items cannot be bought (409)", r.status == 409);
    r = await customer.post("/api/shop/checkout", order([{ itemType: "TRADE_PRODUCT", itemId: teaId, quantity: 1 }], "PAYHERE"));
    check("below minimum order is refused (400)", r.status == 400);
    r = await customer.post("/api/shop/checkout", order([{ itemType: "TRADE_PRODUCT", itemId: teaId, quantity: 11 }], "PAYHERE"));
    check("more than stock is refused (409)", r.status == 409);

    r = await customer.post("/api/shop/checkout", order([gem, { itemType: "TRADE_PRODUCT", itemId: teaId, quantity: 2.5 }], "PAYHERE"));
    const form = r.data.data?.form;
    check("foreign customer gets a signed PayHere form", r.status == 201 && form?.action?.includes("payhere.lk") && form?.fields?.hash?.length == 32, JSON.stringify(r.data));
    check("one order per division (gems + export)", r.data.data?.orders?.length == 2);
    check("amount is the database price: 120 + 2.5 x 8.50 = 141.25 USD", form?.fields?.amount == "141.25" && form?.fields?.currency == "USD", form?.fields?.amount);
    check("PayHere gets the delivery country", form?.fields?.country == "United Kingdom");
    const ref = r.data.data?.checkoutReference;

    r = await admin.get(`/api/gems/${gemId}`);
    check("gem is RESERVED while the customer pays", r.data.data?.availability == "RESERVED");
    r = await admin.get(`/api/trade/products/${teaId}`);
    check("tea stock lowered by 2.5 kg", Number(r.data.data?.stockQty) == 7.5, r.data.data?.stockQty);
    r = await customer.post("/api/shop/checkout", order([gem], "PAYHERE"));
    check("nobody else can buy the held gem (409)", r.status == 409);

    const customerId = (await customer.get("/api/auth/me")).data.customer?.id;
    r = await admin.get(`/api/payments?customerId=${customerId}`);
    const payment = r.data.data?.find((each) => each.checkoutReference == ref);
    check("pending PayHere payment is listed", payment?.status == "PENDING" && payment?.provider == "PAYHERE");
    r = await admin.put(`/api/payments/${payment?.id}`, { status: "PAID" });
    check("card payments cannot be confirmed by hand (409)", r.status == 409);
    r = await admin.put(`/api/orders/${payment?.order?.id}`, { status: "CANCELLED" });
    check("order cannot be changed while the customer pays (409)", r.status == 409);

    const notify = (fields) => client().postForm("/api/shop/payhere/notify", fields);
    r = await notify(payHereNotification(ref, "141.25", "USD", 2, "wrong-secret"));
    check("forged notification is rejected (400)", r.status == 400);
    r = await notify(payHereNotification(ref, "1.00", "USD", 2));
    r = await customer.get(`/api/shop/checkout?checkout=${ref}`);
    check("wrong amount does not mark it paid", r.data.data?.status == "PENDING", r.data.data?.status);
    r = await notify(payHereNotification(ref, "141.25", "USD", 2));
    check("PayHere success notification accepted", r.status == 200, JSON.stringify(r.data));
    r = await customer.get(`/api/shop/checkout?checkout=${ref}`);
    check("checkout is PAID", r.data.data?.status == "PAID", JSON.stringify(r.data));
    check("orders are CONFIRMED", r.data.data?.orders?.every((each) => each.status == "CONFIRMED"));
    r = await admin.get(`/api/gems/${gemId}`);
    check("gem is SOLD", r.data.data?.availability == "SOLD");
    r = await customer.get(`/api/payments/${payment?.id}/receipt`);
    check("receipt PDF is ready", r.status == 200 && String(r.data).startsWith("%PDF"));
    r = await notify(payHereNotification(ref, "141.25", "USD", 2));
    check("repeated notification changes nothing", r.status == 200);

    // customer goes back from PayHere's page
    r = await customer.post("/api/shop/checkout", order([{ itemType: "TRADE_PRODUCT", itemId: teaId, quantity: 3 }], "PAYHERE"));
    const ref2 = r.data.data?.checkoutReference;
    r = await customer.del(`/api/shop/checkout?checkout=${ref2}`);
    check("customer leaves PayHere's page", r.status == 200);
    r = await admin.get(`/api/trade/products/${teaId}`);
    check("tea stock is given back (7.5 kg)", Number(r.data.data?.stockQty) == 7.5, r.data.data?.stockQty);
    r = await customer.get(`/api/shop/checkout?checkout=${ref2}`);
    check("that checkout is FAILED", r.data.data?.status == "FAILED");
  }

  if (BANK) {
    console.log("\nBank transfer");
    r = await customer.post("/api/shop/checkout", order([{ itemType: "GEM_ITEM", itemId: gem2Id, quantity: 1 }], "BANK_TRANSFER"));
    check("bank transfer order placed", r.status == 201 && r.data.data?.redirect?.includes("/checkout/success?checkout="), JSON.stringify(r.data));
    const ref = r.data.data?.checkoutReference;
    r = await customer.get(`/api/shop/checkout?checkout=${ref}`);
    const bank = r.data.data?.bankTransfer;
    check("customer sees bank details line by line", bank?.accountName == process.env.BANK_ACCOUNT_NAME && bank?.accountNumber == process.env.BANK_ACCOUNT_NUMBER && bank?.bankName == process.env.BANK_NAME, JSON.stringify(bank));
    check("pay-before date is given", Boolean(bank?.payBefore));
    r = await admin.get(`/api/gems/${gem2Id}`);
    check("gem is held while the transfer arrives", r.data.data?.availability == "RESERVED");

    const customerId = (await customer.get("/api/auth/me")).data.customer?.id;
    r = await admin.get(`/api/payments?customerId=${customerId}&method=BANK_TRANSFER`);
    const payment = r.data.data?.find((each) => each.checkoutReference == ref);
    check("pending bank transfer is listed for Finance", payment?.status == "PENDING" && payment?.provider == null);
    r = await admin.put(`/api/payments/${payment?.id}`, { status: "PAID", providerReference: "SLIP-TEST" });
    check("Finance confirms the transfer", r.status == 200 && r.data.data?.status == "PAID", JSON.stringify(r.data));
    r = await customer.get(`/api/shop/checkout?checkout=${ref}`);
    check("order is CONFIRMED", r.data.data?.orders?.[0]?.status == "CONFIRMED");
    r = await admin.get(`/api/gems/${gem2Id}`);
    check("gem is SOLD", r.data.data?.availability == "SOLD");
    r = await customer.get(`/api/payments/${payment?.id}/receipt`);
    check("receipt PDF is ready", r.status == 200 && String(r.data).startsWith("%PDF"));
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
