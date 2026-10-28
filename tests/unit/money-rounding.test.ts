import { describe, it, expect } from "vitest";
import { roundFils } from "@/lib/invoices";
import { multiplyFilsByDecimal } from "@/lib/money";

describe("roundFils (current behavior: truncates)", () => {
  // At 5% (rate 0.05), vat = value * 5 / 100 fils:
  it.each([
    [8n, 0.05, 0n], // 0.4 -> truncates to 0
    [10n, 0.05, 0n], // 0.5 -> truncates to 0
    [12n, 0.05, 0n], // 0.6 -> truncates to 0
    [18n, 0.05, 0n], // 0.9 -> truncates to 0
    [20n, 0.05, 1n], // 1.0 -> exactly 1
    [30n, 0.05, 1n], // 1.5 -> truncates to 1
    [46n, 0.05, 2n], // 2.3 -> truncates to 2
    [99n, 0.05, 4n], // 4.95 -> truncates to 4
    [2000n, 0.05, 100n], // 100.0 -> exactly 100
  ])("5%% VAT: %s fils -> %s fils", (value, rate, expected) => {
    expect(roundFils(value, rate)).toBe(expected);
  });

  it("exact division is unchanged", () => {
    expect(roundFils(100n, 0.05)).toBe(5n); // 5.0
    expect(roundFils(400n, 0.25)).toBe(100n); // 100.0
  });

  it("zero value yields zero vat", () => {
    expect(roundFils(0n, 0.05)).toBe(0n);
  });

  it("rate 0 yields zero vat", () => {
    expect(roundFils(1234n, 0)).toBe(0n);
  });

  it("100% rate keeps the value", () => {
    expect(roundFils(777n, 1)).toBe(777n);
  });
});

describe("multiplyFilsByDecimal (current behavior: truncates)", () => {
  it.each([
    [1000n, "1", 1000n],
    [1000n, "1.5", 1500n], // exact
    [1000n, "0.333", 333n], // 0.33333... -> truncates to 333
    [1000n, "2.005", 2005n], // exact
    [333n, "0.333", 110n], // 110.889 -> truncates to 110
  ])("rate %s fils x qty %s -> %s fils", (rate, qty, expected) => {
    expect(multiplyFilsByDecimal(rate, qty)).toBe(expected);
  });

  it("rejects non-numeric quantity", () => {
    expect(() => multiplyFilsByDecimal(100n, "abc")).toThrow(/Invalid quantity/);
    expect(() => multiplyFilsByDecimal(100n, "-1")).toThrow(/Invalid quantity/);
  });
});
