/**
 * Money helpers — all amounts are stored as BigInt fils (1 AED = 100 fils).
 * UI passes decimal strings like "1250.75"; we convert to fils.
 */

export const FILS_PER_UNIT = 100;

export function filsToDecimalString(fils: bigint, decimals = 2): string {
  const negative = fils < 0n;
  const abs = negative ? -fils : fils;
  const whole = abs / BigInt(FILS_PER_UNIT);
  const part = abs % BigInt(FILS_PER_UNIT);
  const padded = part.toString().padStart(2, "0").slice(0, decimals);
  const sign = negative ? "-" : "";
  return `${sign}${whole.toString()}.${padded}`;
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

export function formatAED(fils: bigint, withCurrency = false): string {
  const str = filsToDecimalString(fils);
  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(parseFloat(str));
  return withCurrency ? `AED ${formatted}` : formatted;
}

export function multiplyFilsByDecimal(rateFils: bigint, qty: string | number): bigint {
  // qty is a decimal string like "12.5" — multiply without floats using 3 dp
  const qtyStr = String(qty).trim();
  if (!/^\d+(\.\d+)?$/.test(qtyStr)) throw new Error(`Invalid quantity: ${qtyStr}`);
  const [whole, part = ""] = qtyStr.split(".");
  const qtyThousandths = BigInt(whole) * 1000n + BigInt((part + "000").slice(0, 3));
  return (rateFils * qtyThousandths) / 1000n;
}
