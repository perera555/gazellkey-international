import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";

// Builds the quotation PDF (A4) that staff download and customers receive.
// Travel quotations also print the trip details from the enquiry.

export type QuotationForPdf = {
  reference: string;
  division: string;
  status: string;
  currency: string;
  subtotal: unknown;
  discount: unknown;
  tax: unknown;
  total: unknown;
  validUntil: Date;
  terms: string | null;
  notes: string | null;
  shippingTerms: string | null;
  createdAt: Date;
  sentAt: Date | null;
  items: { description: string; quantity: unknown; unit: string; unitPrice: unknown; lineTotal: unknown }[];
  customer: {
    reference: string;
    firstName: string;
    lastName: string | null;
    companyName: string | null;
    email: string;
    phone: string | null;
    country: string | null;
  };
  createdBy: { firstName: string; lastName: string; email: string };
  enquiry: { reference: string; subject: string; serviceType: string | null; details: unknown } | null;
};

const DIVISION_TITLES: Record<string, string> = {
  TRAVEL: "Travel Quotation",
  EVENTS: "Event Quotation",
  GEMS: "Gems & Jewellery Quotation",
  VEHICLES: "Vehicles & Machinery Quotation",
  IMPORT: "Import Quotation",
  EXPORT: "Export Quotation",
};

// Colours, page size and helpers are shared with the receipt (lib/receipt-pdf.ts)
export const NAVY = rgb(0.043, 0.145, 0.271); // #0b2545
export const NAVY_DARK = rgb(0.027, 0.102, 0.188); // #071a30
export const GOLD = rgb(0.788, 0.635, 0.153); // #c9a227
const TRAVEL_BLUE = rgb(0.118, 0.533, 0.898); // #1e88e5
export const GREY = rgb(0.4, 0.45, 0.52);
export const LIGHT = rgb(0.953, 0.965, 0.98); // #f3f6fa
export const TEXT = rgb(0.1, 0.14, 0.2);

export const PAGE_WIDTH = 595.28; // A4
export const PAGE_HEIGHT = 841.89;
export const MARGIN = 48;
export const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

// The built-in PDF fonts only cover Latin-1, so other characters are
// replaced (curly quotes -> straight quotes, others -> "?").
export function clean(value: unknown) {
  return String(value ?? "")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/•/g, "*")
    .replace(/\t/g, "  ")
    .replace(/[^\n\x20-\x7E\xA0-\xFF]/g, "?");
}

export function money(amount: unknown, currency: string) {
  const value = Number(String(amount ?? 0));
  return `${currency} ${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function quantity(amount: unknown) {
  return Number(String(amount ?? 0)).toLocaleString("en-US", { maximumFractionDigits: 3 });
}

export function date(value: Date | null) {
  return value ? value.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "";
}

// "passengerCount" / "travel_date" -> "Passenger count" / "Travel date"
export function labelOf(key: string) {
  const words = key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function detailText(value: unknown): string {
  if (value == null || value === "") {
    return "";
  }
  if (Array.isArray(value)) {
    return value.map(detailText).filter(Boolean).join(", ");
  }
  if (typeof value == "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, inner]) => `${labelOf(key)}: ${detailText(inner)}`)
      .join("; ");
  }
  if (typeof value == "boolean") {
    return value ? "Yes" : "No";
  }
  // ISO dates from the enquiry form read better as "12 October 2026"
  if (typeof value == "string" && /^\d{4}-\d{2}-\d{2}(T|$)/.test(value)) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return date(parsed);
    }
  }
  return String(value);
}

export function wrap(text: string, font: PDFFont, size: number, width: number) {
  const lines: string[] = [];
  for (const paragraph of clean(text).split("\n")) {
    let line = "";
    for (const word of paragraph.split(" ")) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= width) {
        line = next;
        continue;
      }
      if (line) {
        lines.push(line);
      }
      // a single word longer than the width is cut into pieces
      let rest = word;
      while (font.widthOfTextAtSize(rest, size) > width && rest.length > 1) {
        let cut = rest.length - 1;
        while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > width) {
          cut--;
        }
        lines.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      line = rest;
    }
    lines.push(line);
  }
  return lines;
}

export async function buildQuotationPdf(quotation: QuotationForPdf) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const title = DIVISION_TITLES[quotation.division] ?? "Quotation";
  const isTravel = quotation.division == "TRAVEL";

  pdf.setTitle(`${title} ${quotation.reference}`);
  pdf.setAuthor("Gazellekey International (Pvt) Ltd");
  pdf.setSubject(title);
  pdf.setCreationDate(new Date());

  let page: PDFPage = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = 0;

  const text = (
    value: string,
    x: number,
    top: number,
    options: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb> } = {},
  ) => {
    page.drawText(clean(value), {
      x: x,
      y: top,
      font: options.font ?? regular,
      size: options.size ?? 10,
      color: options.color ?? TEXT,
    });
  };
  const rightText = (value: string, right: number, top: number, font = regular, size = 10, color = TEXT) => {
    const cleaned = clean(value);
    text(cleaned, right - font.widthOfTextAtSize(cleaned, size), top, { font, size, color });
  };

  // New page with a slim header when content runs over
  const newPage = () => {
    page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 36, width: PAGE_WIDTH, height: 36, color: NAVY });
    text("GAZELLEKEY INTERNATIONAL", MARGIN, PAGE_HEIGHT - 23, { font: bold, size: 10, color: rgb(1, 1, 1) });
    rightText(`${title} ${quotation.reference} (continued)`, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 23, regular, 9, GOLD);
    y = PAGE_HEIGHT - 64;
  };
  const ensureSpace = (needed: number) => {
    if (y - needed < 58) {
      // the footer line sits at y = 44
      newPage();
    }
  };

  // ── Header band ──
  page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 120, width: PAGE_WIDTH, height: 120, color: NAVY_DARK });
  page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 124, width: PAGE_WIDTH, height: 4, color: isTravel ? TRAVEL_BLUE : GOLD });
  page.drawCircle({ x: MARGIN + 18, y: PAGE_HEIGHT - 60, size: 18, color: GOLD });
  text("G", MARGIN + 11.5, PAGE_HEIGHT - 67, { font: bold, size: 20, color: NAVY_DARK });
  text("GAZELLEKEY", MARGIN + 46, PAGE_HEIGHT - 58, { font: bold, size: 20, color: rgb(1, 1, 1) });
  text("INTERNATIONAL (PVT) LTD", MARGIN + 46, PAGE_HEIGHT - 72, { size: 8, color: GOLD });
  rightText(title.toUpperCase(), PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 55, bold, 15, rgb(1, 1, 1));
  rightText(quotation.reference, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 73, regular, 11, GOLD);
  text("Travel  |  Events  |  Gems  |  Vehicles  |  Import  |  Export", MARGIN, PAGE_HEIGHT - 102, {
    size: 8,
    color: rgb(0.75, 0.8, 0.87),
  });

  // ── Customer and quotation facts ──
  y = PAGE_HEIGHT - 158;
  const customer = quotation.customer;
  const customerName = [customer.firstName, customer.lastName].filter(Boolean).join(" ");
  text("PREPARED FOR", MARGIN, y, { font: bold, size: 8, color: GREY });
  text("QUOTATION DETAILS", MARGIN + CONTENT_WIDTH / 2 + 10, y, { font: bold, size: 8, color: GREY });
  y -= 16;
  const left = [
    customerName,
    customer.companyName,
    customer.email,
    customer.phone,
    customer.country,
    `Customer ref: ${customer.reference}`,
  ].filter((line): line is string => Boolean(line));
  const right: [string, string][] = [
    ["Date", date(quotation.sentAt ?? quotation.createdAt)],
    ["Valid until", date(quotation.validUntil)],
    ["Status", labelOf(quotation.status)],
    ["Prepared by", `${quotation.createdBy.firstName} ${quotation.createdBy.lastName}`],
    ...(quotation.enquiry ? ([["Enquiry", quotation.enquiry.reference]] as [string, string][]) : []),
  ];
  const factsTop = y;
  left.forEach((line, index) => {
    text(line, MARGIN, factsTop - index * 14, { font: index == 0 ? bold : regular, size: index == 0 ? 12 : 10 });
  });
  right.forEach(([label, value], index) => {
    text(label, MARGIN + CONTENT_WIDTH / 2 + 10, factsTop - index * 14, { size: 10, color: GREY });
    rightText(value, PAGE_WIDTH - MARGIN, factsTop - index * 14, bold, 10);
  });
  y = factsTop - Math.max(left.length, right.length) * 14 - 14;

  // ── Trip details (travel) ──
  const details =
    quotation.enquiry?.details && typeof quotation.enquiry.details == "object"
      ? Object.entries(quotation.enquiry.details as Record<string, unknown>)
          .map(([key, value]) => [labelOf(key), detailText(value)] as [string, string])
          .filter(([, value]) => value != "")
      : [];
  if (isTravel && (quotation.enquiry || details.length > 0)) {
    const rows: [string, string][] = [
      ...(quotation.enquiry ? ([["Trip", quotation.enquiry.subject]] as [string, string][]) : []),
      ...(quotation.enquiry?.serviceType ? ([["Service", labelOf(quotation.enquiry.serviceType)]] as [string, string][]) : []),
      ...details,
    ];
    const lineHeights = rows.map(([, value]) => wrap(value, regular, 10, CONTENT_WIDTH - 150).length);
    const boxHeight = 30 + lineHeights.reduce((sum, lines) => sum + lines * 13 + 4, 0);
    ensureSpace(boxHeight + 10);
    page.drawRectangle({
      x: MARGIN,
      y: y - boxHeight,
      width: CONTENT_WIDTH,
      height: boxHeight,
      color: rgb(0.91, 0.95, 0.99),
      borderColor: TRAVEL_BLUE,
      borderWidth: 0.8,
    });
    page.drawRectangle({ x: MARGIN, y: y - boxHeight, width: 4, height: boxHeight, color: TRAVEL_BLUE });
    text("TRIP DETAILS", MARGIN + 16, y - 18, { font: bold, size: 9, color: TRAVEL_BLUE });
    let rowY = y - 36;
    rows.forEach(([label, value], index) => {
      text(label, MARGIN + 16, rowY, { size: 10, color: GREY });
      wrap(value, regular, 10, CONTENT_WIDTH - 150).forEach((line, lineIndex) => {
        text(line, MARGIN + 140, rowY - lineIndex * 13, { size: 10, font: lineIndex == 0 ? bold : regular });
      });
      rowY -= lineHeights[index] * 13 + 4;
    });
    y -= boxHeight + 22;
  }

  // ── Line items ──
  const col = {
    description: MARGIN + 10,
    quantity: MARGIN + CONTENT_WIDTH - 230,
    unitPrice: MARGIN + CONTENT_WIDTH - 110,
    total: MARGIN + CONTENT_WIDTH - 10,
  };
  const descriptionWidth = col.quantity - col.description - 60;
  const tableHeader = () => {
    page.drawRectangle({ x: MARGIN, y: y - 8, width: CONTENT_WIDTH, height: 24, color: NAVY });
    text("DESCRIPTION", col.description, y, { font: bold, size: 8, color: rgb(1, 1, 1) });
    rightText("QTY", col.quantity, y, bold, 8, rgb(1, 1, 1));
    rightText("UNIT PRICE", col.unitPrice, y, bold, 8, rgb(1, 1, 1));
    rightText("AMOUNT", col.total, y, bold, 8, rgb(1, 1, 1));
    y -= 26;
  };
  ensureSpace(60);
  tableHeader();

  quotation.items.forEach((item, index) => {
    const lines = wrap(item.description, regular, 10, descriptionWidth);
    const rowHeight = lines.length * 13 + 10;
    if (y - rowHeight < 70) {
      newPage();
      tableHeader();
    }
    if (index % 2 == 1) {
      page.drawRectangle({ x: MARGIN, y: y - rowHeight + 13, width: CONTENT_WIDTH, height: rowHeight, color: LIGHT });
    }
    lines.forEach((line, lineIndex) => text(line, col.description, y - lineIndex * 13));
    rightText(`${quantity(item.quantity)} ${item.unit}`, col.quantity, y);
    rightText(money(item.unitPrice, quotation.currency), col.unitPrice, y);
    rightText(money(item.lineTotal, quotation.currency), col.total, y, bold);
    y -= rowHeight;
  });

  // ── Totals ──
  const extraRows = (Number(String(quotation.discount)) > 0 ? 1 : 0) + (Number(String(quotation.tax)) > 0 ? 1 : 0);
  ensureSpace(60 + extraRows * 16);
  y -= 6;
  page.drawLine({ start: { x: MARGIN, y: y + 8 }, end: { x: PAGE_WIDTH - MARGIN, y: y + 8 }, thickness: 0.6, color: GREY });
  const totalsX = PAGE_WIDTH - MARGIN - 220;
  const totalRow = (label: string, value: string) => {
    text(label, totalsX, y, { color: GREY });
    rightText(value, col.total, y);
    y -= 16;
  };
  y -= 8;
  totalRow("Subtotal", money(quotation.subtotal, quotation.currency));
  if (Number(String(quotation.discount)) > 0) {
    totalRow("Discount", `- ${money(quotation.discount, quotation.currency)}`);
  }
  if (Number(String(quotation.tax)) > 0) {
    totalRow("Tax", money(quotation.tax, quotation.currency));
  }
  y -= 8; // room between the last row and the total bar
  page.drawRectangle({ x: totalsX - 12, y: y - 12, width: PAGE_WIDTH - MARGIN - totalsX + 12, height: 30, color: NAVY });
  text("TOTAL", totalsX, y, { font: bold, size: 11, color: rgb(1, 1, 1) });
  rightText(money(quotation.total, quotation.currency), col.total, y, bold, 13, GOLD);
  y -= 40;

  // ── Terms and notes ──
  const block = (heading: string, body: string | null) => {
    if (!body) {
      return;
    }
    const lines = wrap(body, regular, 9.5, CONTENT_WIDTH);
    ensureSpace(30);
    text(heading, MARGIN, y, { font: bold, size: 9, color: NAVY });
    y -= 15;
    for (const line of lines) {
      ensureSpace(14);
      text(line, MARGIN, y, { size: 9.5 });
      y -= 13;
    }
    y -= 10;
  };
  block("NOTES", quotation.notes);
  block("SHIPPING TERMS", quotation.shippingTerms);
  block(
    "TERMS & CONDITIONS",
    quotation.terms ??
      (isTravel
        ? "Prices are per the travellers and dates above and depend on availability at the time of booking. Airfares and hotel rates may change until tickets are issued and bookings confirmed. Visa approval is decided by the embassy."
        : null),
  );
  block(
    "HOW TO ACCEPT",
    `Accept this quotation from your Gazellekey account before ${date(quotation.validUntil)}, or reply to ${quotation.createdBy.email}.`,
  );

  // ── Footer on every page ──
  const pages = pdf.getPages();
  pages.forEach((each, index) => {
    each.drawLine({ start: { x: MARGIN, y: 44 }, end: { x: PAGE_WIDTH - MARGIN, y: 44 }, thickness: 0.5, color: GOLD });
    each.drawText(clean(`Gazellekey International (Pvt) Ltd  |  ${quotation.reference}  |  Valid until ${date(quotation.validUntil)}`), {
      x: MARGIN,
      y: 30,
      size: 8,
      font: regular,
      color: GREY,
    });
    const label = `Page ${index + 1} of ${pages.length}`;
    each.drawText(label, {
      x: PAGE_WIDTH - MARGIN - regular.widthOfTextAtSize(label, 8),
      y: 30,
      size: 8,
      font: regular,
      color: GREY,
    });
  });

  return pdf.save();
}
