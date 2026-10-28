/**
 * Money helpers — all amounts are stored as BigInt fils (1 AED = 100 fils).
 * UI passes decimal strings like "1250.75"; we convert to fils.
 */

export const FILS_PER_UNIT = 100;

/** Format fils as a locale-aware decimal string with thousands separators. */
export function filsToDecimalString(fils: bigint, decimals = 2): string {
  const negative = fils < 0n;
  const abs = negative ? -fils : fils;
  const whole = abs / BigInt(FILS_PER_UNIT);
  const part = abs % BigInt(FILS_PER_UNIT);
  const padded = part.toString().padStart(2, "0").slice(0, decimals);
  const sign = negative ? "-" : "";
  // Use Intl.NumberFormat for thousands separators
  const wholeFormatted = new Intl.NumberFormat("en-US").format(whole);
  return `${sign}${wholeFormatted}.${padded}`;
}

/** Parse a user-entered decimal string into fils without float arithmetic. */
export function decimalStringToFils(value: string): bigint {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("Empty amount");
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) throw new Error(`Invalid amount: ${value}`);
  const negative = trimmed.startsWith("-");
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [wholeStr, partStr = ""] = unsigned.split(".");
  if (partStr.length > FILS_PER_UNIT.toString().length - 1) {
    throw new Error(`Too many decimal places: ${value}`);
  }
  const whole = BigInt(wholeStr || "0") * BigInt(FILS_PER_UNIT);
  const part = BigInt((partStr + "0").slice(0, 2) || "0");
  const fils = whole + part;
  return negative ? -fils : fils;
}

/** Scale for vat-rate integer math: 1 rate unit = 10^8. A rate of 0.05 scales to 5,000,000. */
export const RATE_SCALE = 100_000_000n;

/** Divide two positive-ish bigints rounding half away from zero (school rounding).
 * Throws when the denominator is zero or negative. No floats anywhere. */
export function roundHalfUpDiv(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new Error("Denominator must be positive");
  const absNum = numerator < 0n ? -numerator : numerator;
  const quotient = absNum / denominator;
  const remainder = absNum % denominator;
  const roundedUp = remainder * 2n >= denominator;
  const magnitude = roundedUp ? quotient + 1n : quotient;
  return numerator < 0n ? -magnitude : magnitude;
}

/** VAT for one line, rounded half away from zero: valueFils * vatRate / RATE_SCALE, no floats.
 * P1.4 (D4, reviewer default): new invoices can differ from the old truncation by up to 1 fil per
 * line; existing stored invoices are untouched. */
export function vatForLine(valueFils: bigint, vatRate: number): bigint {
  const scaled = BigInt(Math.round(vatRate * Number(RATE_SCALE)));
  return roundHalfUpDiv(valueFils * scaled, RATE_SCALE);
}

/** VAT for one line from a form-input vatRate string ("0.05" or "5").
 * Delegates to vatForLine so client and server always agree. */
export function vatOf(valueFils: bigint, vatRate: string): bigint {
  const n = parseFloat(vatRate || "0");
  if (Number.isNaN(n) || n <= 0) return 0n;
  const fraction = n <= 1 ? n : n / 100;
  return vatForLine(valueFils, fraction);
}

/** Format fils as AED with thousands separators and exactly 2 decimals. */
export function formatAED(fils: bigint, withCurrency = false): string {
  const formatted = filsToDecimalString(fils);
  return withCurrency ? `AED ${formatted}` : formatted;
}

/** Multiply rate (fils) by qty (decimal string) without floats. */
export function multiplyFilsByDecimal(rateFils: bigint, qty: string | number): bigint {
  const qtyStr = String(qty).trim();
  if (!/^\d+(\.\d+)?$/.test(qtyStr)) throw new Error(`Invalid quantity: ${qtyStr}`);
  const [whole, part = ""] = qtyStr.split(".");
  const qtyThousandths = BigInt(whole) * 1000n + BigInt((part + "000").slice(0, 3));
  return (rateFils * qtyThousandths) / 1000n;
}

/** Multiply rate (fils) by qty (decimal string) without floats.
 * Lenient version: invalid or empty qty returns 0n instead of throwing.
 * Delegates to multiplyFilsByDecimal for all valid input.
 */
export function multiplyFilsLenient(rateFils: bigint, qty: string): bigint {
  const q = qty.trim();
  if (!q || !/^\d+(\.\d{1,3})?$/.test(q)) return 0n;
  return multiplyFilsByDecimal(rateFils, q);
}

/** Local fmt helper for inline use: bigint -> formatted string with commas. */
export function fmt(fils: bigint): string {
  return formatAED(fils);
}
