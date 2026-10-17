// End-to-end API test: runs the full Gazellekey business flow against a
// running server and checks the SRS rules.
//
//   1. npm run dev          (or: npx next dev -p 3100)
//   2. npm run test:api     (BASE_URL defaults to http://localhost:3000)
//
// Uses ADMIN_EMAIL / ADMIN_PASSWORD from .env. Creates test data with
// unique emails each run, so it is safe to run many times on a dev database.
// NEVER run it against the production database.
import "dotenv/config";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const RUN = Date.now().toString(36);
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

// A tiny API client that remembers its login cookie
function client(label) {
  let cookie = "";
  async function call(method, path, body, isForm = false) {
    const response = await fetch(BASE + path, {
      method,
      headers: {
        ...(cookie ? { cookie } : {}),
        ...(body && !isForm ? { "content-type": "application/json" } : {}),
      },
      body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
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
    label,
    get: (path) => call("GET", path),
    post: (path, body) => call("POST", path, body),
    put: (path, body) => call("PUT", path, body),
    del: (path) => call("DELETE", path),
    upload: (path, form) => call("POST", path, form, true),
    login: (email, password) => call("POST", "/api/auth/login", { email, password }),
  };
}

const future = (days) => new Date(Date.now() + days * 86400000).toISOString();

async function main() {
  console.log(`Testing ${BASE} (run ${RUN})\n`);

  const visitor = client("visitor");
  const admin = client("admin");
  const travelStaff = client("travel staff");
  const exportStaff = client("export staff");
  const finance = client("finance");
  const customer = client("customer");

  // ── Auth & users ──
  console.log("Auth & users");
  let r = await admin.login(process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD);
  check("admin can log in", r.status == 200, JSON.stringify(r.data));
  r = await visitor.login(process.env.ADMIN_EMAIL, "wrong-password");
  check("wrong password gives 401 with generic message", r.status == 401 && r.data.message == "Invalid email or password");

  const password = "Test-password-123";
  const makeUser = async (role, divisions, prefix) => {
    const email = `${prefix}.${RUN}@test.local`;
    const res = await admin.post("/api/users", {
      email, firstName: prefix, lastName: "Test", password, role, divisions,
    });
    check(`admin creates ${role} ${prefix}`, res.status == 201, JSON.stringify(res.data));
    return email;
  };
  const travelEmail = await makeUser("STAFF", ["TRAVEL", "EVENTS"], "travel");
  const exportEmail = await makeUser("STAFF", ["EXPORT"], "export");
  const financeEmail = await makeUser("FINANCE", [], "finance");
  await travelStaff.login(travelEmail, password);
  await exportStaff.login(exportEmail, password);
  await finance.login(financeEmail, password);

  const customerEmail = `customer.${RUN}@test.local`;
  r = await visitor.post("/api/auth/register", {
    email: customerEmail, firstName: "Nimal", lastName: "Perera", password, role: "ADMIN",
  });
  check("sign-up rejects a 'role' field", r.status == 400);
  r = await visitor.post("/api/auth/register", {
    email: customerEmail, firstName: "Nimal", lastName: "Perera", password,
  });
  check("customer can sign up", r.status == 201, JSON.stringify(r.data));
  await customer.login(customerEmail, password);
  r = await customer.get("/api/users");
  check("customer cannot list users (403)", r.status == 403);
  r = await customer.get("/api/auth/me");
  check("customer /me has a linked customer record", r.data.customer?.email == customerEmail);

  // ── Catalogues ──
  console.log("\nCatalogues");
  r = await admin.post("/api/gems", {
    sku: `GEM-${RUN}`.toUpperCase(), name: "Blue Sapphire", itemType: "GEMSTONE",
    category: "Sapphire", description: "Natural Ceylon blue sapphire", weight: 2.15,
    origin: "Sri Lanka", treatment: "Heated", pricingMode: "FIXED", price: 2500,
    currency: "USD", supplierCost: 1400, status: "PUBLISHED",
  });
  check("admin creates gem", r.status == 201, JSON.stringify(r.data));
  const gemId = r.data.data?.id;
  r = await visitor.get(`/api/gems/${gemId}`);
  check("visitor sees the gem", r.status == 200);
  check("visitor does NOT see supplierCost", r.data.data && !("supplierCost" in r.data.data));
  r = await admin.get(`/api/gems/${gemId}`);
  check("admin sees supplierCost", r.data.data?.supplierCost != undefined);
  r = await travelStaff.post("/api/gems", {
    sku: `GEMX-${RUN}`.toUpperCase(), name: "x", itemType: "GEMSTONE", category: "x", description: "xxxxxx",
  });
  check("travel staff cannot edit Gems catalogue (403)", r.status == 403);

  r = await admin.post("/api/trade/products", {
    sku: `TEA-${RUN}`.toUpperCase(), direction: "IMPORT", category: "TEA", name: "Tea", description: "Ceylon tea",
  });
  check("tea cannot be an IMPORT category (400)", r.status == 400);
  r = await exportStaff.post("/api/trade/products", {
    sku: `TEA-${RUN}`.toUpperCase(), direction: "EXPORT", category: "TEA", name: "Ceylon BOP Tea",
    description: "High-grown black tea", origin: "Nuwara Eliya", unit: "kg",
    minimumOrderQty: 500, status: "PUBLISHED",
  });
  check("export staff creates export tea", r.status == 201, JSON.stringify(r.data));
  const teaId = r.data.data?.id;

  r = await travelStaff.post("/api/travel/tours", {
    slug: `maldives-${RUN}`, title: "Maldives Escape", tourType: "OUTBOUND", destination: "Maldives",
    summary: "Five days of beaches and snorkelling", durationDays: 5, status: "PUBLISHED",
    itinerary: [{ day: 1, title: "Arrival" }],
  });
  check("travel staff creates a tour", r.status == 201, JSON.stringify(r.data));
  r = await visitor.get(`/api/travel/tours/maldives-${RUN}`);
  check("visitor finds tour by slug", r.status == 200);

  // ── Enquiry -> quotation -> order -> payment (Travel) ──
  console.log("\nEnquiry → quotation → order → payment");
  r = await customer.post("/api/enquiries", {
    division: "TRAVEL", serviceType: "OUTBOUND_TOUR", subject: "Maldives for 2 people",
    message: "We want the Maldives tour in December.", firstName: "Nimal", email: customerEmail,
    details: { travellers: 2 },
  });
  check("customer sends enquiry", r.status == 201 && r.data.reference?.startsWith("TRV-ENQ-"), JSON.stringify(r.data));
  const enquiryRef = r.data.reference;

  r = await visitor.post("/api/enquiries", {
    division: "TRAVEL", subject: "spam", message: "buy now buy now", firstName: "Bot",
    email: "bot@spam.local", website: "http://spam",
  });
  check("honeypot spam is accepted silently", r.status == 201 && !r.data.reference);

  r = await travelStaff.get(`/api/enquiries?search=${enquiryRef}`);
  const enquiry = r.data.data?.[0];
  check("travel staff sees the enquiry", enquiry?.reference == enquiryRef);
  r = await exportStaff.get(`/api/enquiries/${enquiry.id}`);
  check("export staff cannot open a Travel enquiry", r.status == 404);

  const me = (await travelStaff.get("/api/auth/me")).data.user;
  r = await travelStaff.put(`/api/enquiries/${enquiry.id}`, { assignedToId: me.id });
  check("assigning moves NEW → ASSIGNED", r.data.data?.status == "ASSIGNED", JSON.stringify(r.data));

  r = await travelStaff.post("/api/quotations", {
    enquiryId: enquiry.id, currency: "usd", validUntil: future(14), terms: "50% deposit",
    items: [
      { description: "Maldives Escape - adult", quantity: 2, unitPrice: 1199.99 },
      { description: "Airport transfer", quantity: 1, unitPrice: 80 },
    ],
  });
  check("staff creates quotation", r.status == 201, JSON.stringify(r.data));
  const quote = r.data.data;
  check("total is calculated exactly (2479.98)", Number(quote?.total) == 2479.98, quote?.total);

  r = await customer.get(`/api/quotations/${quote.id}`);
  check("customer cannot see a DRAFT quotation", r.status == 404);
  r = await customer.post(`/api/quotations/${quote.id}/respond`, { action: "ACCEPT" });
  check("customer cannot accept before it is sent", r.status == 409);

  r = await travelStaff.post(`/api/quotations/${quote.id}/send`);
  check("staff sends quotation", r.status == 200, JSON.stringify(r.data));
  r = await customer.get("/api/me/quotations");
  check("customer sees it in My quotations", r.data.data?.some((q) => q.id == quote.id));

  r = await customer.post(`/api/quotations/${quote.id}/respond`, { action: "ACCEPT" });
  check("customer accepts → order created", r.status == 201 && r.data.order?.reference?.startsWith("TRV-ORD-"), JSON.stringify(r.data));
  const orderId = r.data.order?.id;
  r = await customer.post(`/api/quotations/${quote.id}/respond`, { action: "ACCEPT" });
  check("accepting twice is refused (no double order)", r.status == 409);
  r = await travelStaff.get(`/api/enquiries/${enquiry.id}`);
  check("enquiry is now CONVERTED", r.data.data?.status == "CONVERTED");

  r = await travelStaff.post("/api/payments", { orderId, amount: 5000, method: "BANK_TRANSFER" });
  check("payment larger than balance is refused", r.status == 400);
  r = await travelStaff.post("/api/payments", { orderId, amount: 2479.98, method: "BANK_TRANSFER", providerReference: "SLIP-001" });
  check("staff records payment (PENDING)", r.status == 201 && r.data.data?.status == "PENDING", JSON.stringify(r.data));
  const paymentId = r.data.data?.id;
  r = await customer.get(`/api/payments/${paymentId}/receipt`);
  check("no receipt for a pending payment (409)", r.status == 409);
  r = await travelStaff.put(`/api/payments/${paymentId}`, { status: "PAID" });
  check("staff cannot confirm payments (403)", r.status == 403);
  r = await finance.put(`/api/payments/${paymentId}`, { status: "PAID" });
  check("finance confirms payment", r.data.data?.status == "PAID", JSON.stringify(r.data));
  r = await customer.get(`/api/orders/${orderId}`);
  check("fully paid order is CONFIRMED", r.data.data?.status == "CONFIRMED", r.data.data?.status);
  r = await customer.get(`/api/payments/${paymentId}/receipt`);
  check("customer downloads PDF receipt", r.status == 200 && String(r.data).startsWith("%PDF"), String(r.status));
  r = await finance.get(`/api/payments/${paymentId}/receipt`);
  check("finance can open the receipt", r.status == 200);
  r = await client("anonymous").get(`/api/payments/${paymentId}/receipt`);
  check("receipt needs a login (401)", r.status == 401);

  r = await finance.post(`/api/payments/${paymentId}/refunds`, { amount: 5000, reason: "Too much" });
  check("refund above paid amount is refused", r.status == 400);
  r = await finance.post(`/api/payments/${paymentId}/refunds`, { amount: 80, reason: "Transfer not needed" });
  check("finance makes partial refund", r.status == 201);
  r = await finance.get(`/api/payments/${paymentId}`);
  check("payment is PARTIALLY_REFUNDED", r.data.data?.status == "PARTIALLY_REFUNDED");

  // ── Travel cases ──
  console.log("\nTravel cases");
  r = await travelStaff.post("/api/travel/tickets", {
    enquiryId: enquiry.id, tripType: "RETURN",
    segments: [{ origin: "CMB", destination: "MLE", date: "2026-12-10" }],
    passengers: [{ fullName: "Nimal Perera" }, { fullName: "Kamala Perera" }],
  });
  check("staff opens ticket request", r.status == 201, JSON.stringify(r.data));
  const ticketId = r.data.data?.id;
  r = await travelStaff.put(`/api/travel/tickets/${ticketId}`, { status: "CONFIRMED" });
  check("ticket cannot be CONFIRMED without supplier reference (FR-TRV-06)", r.status == 400);
  r = await travelStaff.put(`/api/travel/tickets/${ticketId}`, { status: "CONFIRMED", supplierReference: "UL-PNR-77" });
  check("ticket confirmed with supplier reference", r.data.data?.status == "CONFIRMED");

  r = await travelStaff.post("/api/travel/visa-cases", {
    customerId: (await customer.get("/api/auth/me")).data.customer.id,
    destinationCountry: "Japan", visaType: "Tourist",
    applicants: [{ fullName: "Nimal Perera" }],
    checklist: [{ item: "Passport copy" }, { item: "Bank statement" }],
  });
  check("staff opens visa case", r.status == 201, JSON.stringify(r.data));
  const visaId = r.data.data?.id;

  // ── Documents ──
  console.log("\nDocuments");
  const pdf = new Blob(["%PDF-1.4\n% test passport\n"], { type: "application/pdf" });
  let form = new FormData();
  form.append("file", pdf, "passport.pdf");
  form.append("entityType", "VISA_CASE");
  form.append("entityId", visaId);
  form.append("type", "PASSPORT");
  form.append("title", "Passport copy");
  r = await customer.upload("/api/documents", form);
  check("customer uploads passport to own visa case", r.status == 201, JSON.stringify(r.data));
  check("passport is RESTRICTED automatically", r.data.data?.accessLevel == "RESTRICTED");
  const docId = r.data.data?.id;

  const fake = new Blob(["not really a pdf"], { type: "application/pdf" });
  form = new FormData();
  form.append("file", fake, "fake.pdf");
  form.append("entityType", "VISA_CASE");
  form.append("entityId", visaId);
  form.append("type", "OTHER");
  form.append("title", "Fake");
  r = await customer.upload("/api/documents", form);
  check("file with wrong content is rejected", r.status == 400);

  r = await customer.get(`/api/documents/${docId}/download`);
  check("customer can download own passport", r.status == 200);
  r = await finance.get(`/api/documents/${docId}/download`);
  check("finance cannot see passports", r.status == 404);
  r = await exportStaff.get(`/api/documents/${docId}/download`);
  check("other division staff cannot see it", r.status == 404);
  r = await travelStaff.get(`/api/documents/${docId}/download`);
  check("assigned travel staff can see it", r.status == 200);
  r = await admin.get(`/api/audit-logs?action=document.restricted_viewed&entityId=${visaId}`);
  check("restricted views are audit-logged", r.data.data?.length >= 2, `found ${r.data.data?.length}`);

  // ── Events & overbooking ──
  console.log("\nEvents");
  r = await travelStaff.post("/api/events", {
    slug: `tea-expo-${RUN}`, name: "Colombo Tea Expo", eventType: "EXHIBITION",
    description: "Annual tea exhibition in Colombo", venue: "BMICH", city: "Colombo",
    startDate: future(30), endDate: future(31), capacity: 3, fee: 25, currency: "USD",
    status: "PUBLISHED",
  });
  check("events staff creates paid event (3 seats)", r.status == 201, JSON.stringify(r.data));
  const eventId = r.data.data?.id;
  const register = (n) =>
    visitor.post(`/api/events/${eventId}/registrations`, {
      firstName: "Guest", email: `guest${n}.${RUN}@test.local`,
      participants: Array.from({ length: n }, (_, i) => ({ fullName: `Guest ${i + 1}` })),
    });
  r = await register(2);
  check("group registration (2 seats) pending payment", r.status == 201 && r.data.status == "PENDING", JSON.stringify(r.data));
  const results = await Promise.all([register(1), register(1), register(1)]);
  const ok = results.filter((x) => x.status == 201).length;
  check("3 people racing for the last seat: only 1 wins (NFR-08)", ok == 1, `winners=${ok}`);
  r = await visitor.get(`/api/events/${eventId}`);
  check("event shows 0 seats left", r.data.data?.seatsLeft == 0);

  // ── Export: order → shipment → milestones ──
  console.log("\nExport trade");
  r = await visitor.post("/api/enquiries", {
    division: "EXPORT", subject: "500kg BOP tea to Dubai", message: "Please quote CIF Jebel Ali.",
    firstName: "Ahmed", companyName: "Gulf Foods LLC", email: `buyer.${RUN}@test.local`,
    itemType: "TRADE_PRODUCT", itemId: teaId,
  });
  const exportEnquiry = (await exportStaff.get(`/api/enquiries?search=${r.data.reference}`)).data.data?.[0];
  check("export enquiry visible to export staff", !!exportEnquiry);
  r = await travelStaff.get(`/api/enquiries?search=${exportEnquiry.reference}`);
  check("travel staff list does not include it", r.data.data?.length == 0);
  r = await exportStaff.post("/api/quotations", {
    enquiryId: exportEnquiry.id, currency: "USD", validUntil: future(10), shippingTerms: "CIF",
    items: [{ description: "Ceylon BOP Tea", quantity: 500, unit: "kg", unitPrice: 6.4, itemType: "TRADE_PRODUCT", itemId: teaId }],
  });
  const exportQuote = r.data.data;
  await exportStaff.post(`/api/quotations/${exportQuote.id}/send`);
  r = await exportStaff.post(`/api/quotations/${exportQuote.id}/respond`, { action: "ACCEPT", note: "Accepted by email" });
  check("staff records acceptance for the buyer", r.status == 201, JSON.stringify(r.data));
  const exportOrderId = r.data.order?.id;
  r = await exportStaff.post("/api/shipments", { orderId: exportOrderId });
  check("shipment needs a confirmed order", r.status == 409);
  await exportStaff.put(`/api/orders/${exportOrderId}`, { status: "CONFIRMED" });
  r = await exportStaff.post("/api/shipments", { orderId: exportOrderId, carrier: "Maersk", origin: "Colombo", destination: "Jebel Ali" });
  check("shipment created with direction EXPORT", r.data.data?.direction == "EXPORT", JSON.stringify(r.data));
  const shipmentId = r.data.data?.id;
  r = await exportStaff.post(`/api/shipments/${shipmentId}/milestones`, { status: "DELAYED" });
  check("DELAYED needs a reason", r.status == 400);
  r = await exportStaff.post(`/api/shipments/${shipmentId}/milestones`, { status: "DELAYED", delayReason: "Port congestion" });
  check("delay recorded", r.data.data?.isDelayed == true);
  r = await gemHistoryCheck(admin, gemId);

  // ── Dashboard & reports ──
  console.log("\nDashboard & reports");
  r = await exportStaff.get("/api/dashboard");
  check("dashboard has separate counts", r.status == 200 && "paymentsToConfirm" in r.data.data.counts);
  check("export dashboard shows the delayed shipment", r.data.data.counts.delayedShipments >= 1);
  r = await finance.get("/api/reports?format=csv");
  check("finance exports CSV report", r.status == 200 && String(r.data).startsWith("report,division"));
  r = await travelStaff.get("/api/reports?division=EXPORT");
  check("staff cannot report on other divisions", r.status == 403);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

async function gemHistoryCheck(admin, gemId) {
  const r = await admin.get(`/api/gems/${gemId}`);
  check("gem detail includes history for staff", Array.isArray(r.data.data?.history?.enquiries));
  return r;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
