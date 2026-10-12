// Money is calculated in cents to avoid floating point errors like 0.1 + 0.2.
// Every amount is stored together with its own currency (NFR-10).

export function toCents(amount: number | { toString(): string }) {
  return Math.round(Number(amount.toString()) * 100);
}

export function fromCents(cents: number) {
  return cents / 100;
}

type LineInput = { quantity: number; unitPrice: number };

export function calculateTotals<T extends LineInput>(
  items: T[],
  discount = 0,
  tax = 0,
) {
  const lines = items.map((item) => ({
    ...item,
    lineTotal: fromCents(Math.round(item.quantity * toCents(item.unitPrice))),
  }));
  const subtotalCents = lines.reduce(
    (sum, line) => sum + toCents(line.lineTotal),
    0,
  );
  const totalCents = subtotalCents - toCents(discount) + toCents(tax);

  return {
    lines: lines,
    subtotal: fromCents(subtotalCents),
    total: fromCents(Math.max(totalCents, 0)),
  };
}
