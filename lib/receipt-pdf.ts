import { PDFDocument, PDFFont, StandardFonts, rgb } from "pdf-lib";
import {
  clean,
  CONTENT_WIDTH,
  date,
  GOLD,
  GREY,
  labelOf,
  LIGHT,
  MARGIN,
  money,
  NAVY,
  NAVY_DARK,
  PAGE_HEIGHT,
  PAGE_WIDTH,
  quantity,
  TEXT,
  wrap,
} from "@/lib/quotation-pdf";

// Payment receipt (A4) for a PAID payment: online card payments and
// payments Finance confirmed. Same look as the quotation PDF.

export type PaymentForReceipt = {
  reference: string;
  amount: unknown;
  currency: string;
  method: string;
  provider: string | null; // STRIPE, PAYHERE
  status: string;
  providerReference: string | null;
  refundedAmount: unknown;
  paidAt: Date | null;
  createdAt: Date;
  order: {
    reference: string;
    division: string;
    total: unknown;
    amountPaid: unknown;
    items: { description: string; quantity: unknown; unit: string; unitPrice: unknown; lineTotal: unknown }[];
  };
  customer: {
    reference: string;
    firstName: string;
    lastName: string | null;
    companyName: string | null;
    email: string;
    phone: string | null;
    country: string | null;
  };
};

const GATEWAY_NAMES: Record<string, string> = { STRIPE: "Stripe", PAYHERE: "PayHere" };

const METHOD_LABELS: Record<string, string> = {
  CARD_ONLINE: "Card (online)",
  BANK_TRANSFER: "Bank transfer",
  CASH: "Cash",
  OTHER: "Other",
};

export async function buildReceiptPdf(payment: PaymentForReceipt) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const currency = payment.currency;
  const gateway = payment.provider ? GATEWAY_NAMES[payment.provider] ?? payment.provider : null;

  pdf.setTitle(`Receipt ${payment.reference}`);
  pdf.setAuthor("Gazellekey International (Pvt) Ltd");
  pdf.setSubject("Payment receipt");
  pdf.setCreationDate(new Date());

  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
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

  // ── Header band ──
  page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 120, width: PAGE_WIDTH, height: 120, color: NAVY_DARK });
  page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 124, width: PAGE_WIDTH, height: 4, color: GOLD });
  page.drawCircle({ x: MARGIN + 18, y: PAGE_HEIGHT - 60, size: 18, color: GOLD });
  text("G", MARGIN + 11.5, PAGE_HEIGHT - 67, { font: bold, size: 20, color: NAVY_DARK });
  text("GAZELLEKEY", MARGIN + 46, PAGE_HEIGHT - 58, { font: bold, size: 20, color: rgb(1, 1, 1) });
  text("INTERNATIONAL (PVT) LTD", MARGIN + 46, PAGE_HEIGHT - 72, { size: 8, color: GOLD });
  rightText("PAYMENT RECEIPT", PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 55, bold, 15, rgb(1, 1, 1));
  rightText(payment.reference, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 73, regular, 11, GOLD);
  text("Travel  |  Events  |  Gems  |  Vehicles  |  Import  |  Export", MARGIN, PAGE_HEIGHT - 102, {
    size: 8,
    color: rgb(0.75, 0.8, 0.87),
  });

  // ── Received from / payment details ──
  y = PAGE_HEIGHT - 158;
  const customer = payment.customer;
  const customerName = [customer.firstName, customer.lastName].filter(Boolean).join(" ");
  text("RECEIVED FROM", MARGIN, y, { font: bold, size: 8, color: GREY });
  text("PAYMENT DETAILS", MARGIN + CONTENT_WIDTH / 2 + 10, y, { font: bold, size: 8, color: GREY });
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
    ["Receipt no.", payment.reference],
    ["Date paid", date(payment.paidAt ?? payment.createdAt)],
    ["Order", payment.order.reference],
    ["Division", labelOf(payment.order.division)],
    ["Method", gateway ? `Card (online, ${gateway})` : (METHOD_LABELS[payment.method] ?? labelOf(payment.method))],
    ...(payment.providerReference
      ? ([["Transaction ref.", payment.providerReference]] as [string, string][])
      : []),
  ];
  const factsTop = y;
  left.forEach((line, index) => {
    text(line, MARGIN, factsTop - index * 14, { font: index == 0 ? bold : regular, size: index == 0 ? 12 : 10 });
  });
  right.forEach(([label, value], index) => {
    text(label, MARGIN + CONTENT_WIDTH / 2 + 10, factsTop - index * 14, { size: 10, color: GREY });
    // long Stripe ids are shrunk to fit the column
    const size = bold.widthOfTextAtSize(clean(value), 10) > 150 ? 7.5 : 10;
    rightText(value, PAGE_WIDTH - MARGIN, factsTop - index * 14, bold, size);
  });
  y = factsTop - Math.max(left.length, right.length) * 14 - 20;

  // ── Amount paid ──
  page.drawRectangle({ x: MARGIN, y: y - 46, width: CONTENT_WIDTH, height: 58, color: NAVY });
  text("AMOUNT PAID", MARGIN + 18, y - 12, { font: bold, size: 10, color: rgb(1, 1, 1) });
  text(
    payment.status == "PAID" ? "Thank you for your payment." : `Status: ${labelOf(payment.status)}`,
    MARGIN + 18,
    y - 28,
    { size: 9, color: rgb(0.75, 0.8, 0.87) },
  );
  rightText(money(payment.amount, currency), PAGE_WIDTH - MARGIN - 18, y - 24, bold, 20, GOLD);
  y -= 76;

  // ── Order lines ──
  const col = {
    description: MARGIN + 10,
    quantity: MARGIN + CONTENT_WIDTH - 230,
    unitPrice: MARGIN + CONTENT_WIDTH - 110,
    total: MARGIN + CONTENT_WIDTH - 10,
  };
  const descriptionWidth = col.quantity - col.description - 60;
  text(`ORDER ${payment.order.reference}`, MARGIN, y, { font: bold, size: 9, color: NAVY });
  y -= 20;
  page.drawRectangle({ x: MARGIN, y: y - 8, width: CONTENT_WIDTH, height: 24, color: NAVY });
  text("DESCRIPTION", col.description, y, { font: bold, size: 8, color: rgb(1, 1, 1) });
  rightText("QTY", col.quantity, y, bold, 8, rgb(1, 1, 1));
  rightText("UNIT PRICE", col.unitPrice, y, bold, 8, rgb(1, 1, 1));
  rightText("AMOUNT", col.total, y, bold, 8, rgb(1, 1, 1));
  y -= 26;

  // a receipt is one page: very long orders are summed up
  const maxRows = 14;
  payment.order.items.slice(0, maxRows).forEach((item, index) => {
    const lines = wrap(item.description, regular, 10, descriptionWidth).slice(0, 2);
    const rowHeight = lines.length * 13 + 10;
    if (index % 2 == 1) {
      page.drawRectangle({ x: MARGIN, y: y - rowHeight + 13, width: CONTENT_WIDTH, height: rowHeight, color: LIGHT });
    }
    lines.forEach((line, lineIndex) => text(line, col.description, y - lineIndex * 13));
    rightText(`${quantity(item.quantity)} ${item.unit}`, col.quantity, y);
    rightText(money(item.unitPrice, currency), col.unitPrice, y);
    rightText(money(item.lineTotal, currency), col.total, y, bold);
    y -= rowHeight;
  });
  if (payment.order.items.length > maxRows) {
    text(`... and ${payment.order.items.length - maxRows} more item(s)`, col.description, y, { color: GREY });
    y -= 18;
  }

  // ── Order balance ──
  y -= 6;
  page.drawLine({ start: { x: MARGIN, y: y + 8 }, end: { x: PAGE_WIDTH - MARGIN, y: y + 8 }, thickness: 0.6, color: GREY });
  y -= 8;
  const totalsX = PAGE_WIDTH - MARGIN - 220;
  const balance = Number(String(payment.order.total)) - Number(String(payment.order.amountPaid));
  const totalRow = (label: string, value: string, font = regular) => {
    text(label, totalsX, y, { color: GREY });
    rightText(value, col.total, y, font);
    y -= 16;
  };
  totalRow("Order total", money(payment.order.total, currency));
  totalRow("Paid to date", money(payment.order.amountPaid, currency));
  totalRow("Balance due", money(Math.max(balance, 0), currency), bold);
  if (Number(String(payment.refundedAmount)) > 0) {
    totalRow("Refunded from this payment", money(payment.refundedAmount, currency));
  }

  // ── Note ──
  y -= 20;
  for (const line of wrap(
    gateway
      ? `Paid online through ${gateway}. Your card details were handled by ${gateway} and are never stored by Gazellekey. Quote the transaction reference above if you contact us about this payment.`
      : "This receipt confirms that we received the payment above.",
    regular,
    9,
    CONTENT_WIDTH,
  )) {
    text(line, MARGIN, y, { size: 9, color: GREY });
    y -= 12;
  }

  // ── Footer ──
  page.drawLine({ start: { x: MARGIN, y: 44 }, end: { x: PAGE_WIDTH - MARGIN, y: 44 }, thickness: 0.5, color: GOLD });
  text(
    `Gazellekey International (Pvt) Ltd  |  Receipt ${payment.reference}  |  Computer-generated, no signature needed`,
    MARGIN,
    30,
    { size: 8, color: GREY },
  );

  return pdf.save();
}
