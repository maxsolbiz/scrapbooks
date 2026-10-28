import { describe, it, expect } from "vitest";
import { roundHalfUpDiv, RATE_SCALE, vatForLine, multiplyFilsByDecimal, vatOf } from "@/lib/money";

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

describe("RATE_SCALE", () => {
  it("is 10^8", () => {
    expect(RATE_SCALE).toBe(100_000_000n);
  });
});

describe("roundHalfUpDiv", () => {
  it("halves round up (away from zero)", () => {
    expect(roundHalfUpDiv(1n, 2n)).toBe(1n); // 0.5 -> 1
    expect(roundHalfUpDiv(3n, 2n)).toBe(2n); // 1.5 -> 2
  });

  it("below half rounds down", () => {
    expect(roundHalfUpDiv(1n, 3n)).toBe(0n); // 0.333 -> 0
    expect(roundHalfUpDiv(2n, 5n)).toBe(0n); // 0.4 -> 0
  });

  it("exact division is unchanged", () => {
    expect(roundHalfUpDiv(4n, 2n)).toBe(2n);
    expect(roundHalfUpDiv(100n, 10n)).toBe(10n);
  });

  it("negatives round half away from zero", () => {
    expect(roundHalfUpDiv(-1n, 2n)).toBe(-1n); // -0.5 -> -1
    expect(roundHalfUpDiv(-3n, 2n)).toBe(-2n); // -1.5 -> -2
    expect(roundHalfUpDiv(-1n, 3n)).toBe(0n); // -0.333 -> 0
  });

  it("zero yields zero", () => {
    expect(roundHalfUpDiv(0n, 5n)).toBe(0n);
  });

  it("handles large bigint values (no floats)", () => {
    const large = 9007199254740993n; // > 2^53
    expect(roundHalfUpDiv(large * 2n, 2n)).toBe(large);
    expect(roundHalfUpDiv(large * 2n + 1n, 2n)).toBe(large + 1n); // .5 -> up
  });

  it("denominator zero throws", () => {
    expect(() => roundHalfUpDiv(1n, 0n)).toThrow(/Denominator must be positive/);
  });

  it("negative denominator throws", () => {
    expect(() => roundHalfUpDiv(1n, -1n)).toThrow(/Denominator must be positive/);
  });
});

describe("vatForLine", () => {
  it("rounds half up at 5% VAT", () => {
    expect(vatForLine(10n, 0.05)).toBe(1n); // 0.5 -> 1 (truncation would give 0)
    expect(vatForLine(8n, 0.05)).toBe(0n); // 0.4 -> 0
    expect(vatForLine(30n, 0.05)).toBe(2n); // 1.5 -> 2
    expect(vatForLine(99n, 0.05)).toBe(5n); // 4.95 -> 5
  });

  it("exact division is unchanged", () => {
    expect(vatForLine(20n, 0.05)).toBe(1n); // 1.0
    expect(vatForLine(100n, 0.05)).toBe(5n); // 5.0
  });

  it("negative values round half away from zero", () => {
    expect(vatForLine(-10n, 0.05)).toBe(-1n);
    expect(vatForLine(-8n, 0.05)).toBe(0n);
  });

  it("zero value yields zero vat", () => {
    expect(vatForLine(0n, 0.05)).toBe(0n);
  });

  it("uses integer math only (no float drift)", () => {
    expect(vatForLine(123456789n, 0.075)).toBe(9259259n); // 9,259,259.175 -> 9,259,259
  });
});

describe("client/server VAT parity", () => {
  // Client: multiply(toFils(rate), qty) then vatOf(value, vatRateStr)
  // Server: multiplyFilsByDecimal(rateFils, qty) then vatForLine(value, vatRate)
  // Both use the same integer math; this test pins the parity for line sets
  // that include .5-fil VAT fractions.
  it.each([
    // [rateFils, qty, vatRate, expectedVat, expectedTotal]
    [10n, "1", 0.05, 1n, 11n], // 0.5 -> 1 (half-up)
    [8n, "1", 0.05, 0n, 8n], // 0.4 -> 0
    [30n, "1", 0.05, 2n, 32n], // 1.5 -> 2
    [99n, "1", 0.05, 5n, 104n], // 4.95 -> 5
    [2000n, "1", 0.05, 100n, 2100n], // 100.0 -> 100
    [1000n, "2.5", 0.05, 125n, 2625n], // qty 2.5, value 2500, vat 125
    [2650n, "35.5", 0.05, 4704n, 98779n], // Copper Scrap: 94075 + 4704 = 98779
    [120000n, "1.2", 0.05, 7200n, 151200n], // Old Iron: 144000 + 7200 = 151200
  ])("rate %s fils x qty %s @ %s VAT -> vat=%s total=%s", (rateFils, qty, vatRate, expectedVat, expectedTotal) => {
    const value = multiplyFilsByDecimal(rateFils, qty);
    const vat = vatForLine(value, vatRate);
    expect(vat).toBe(expectedVat);
    expect(value + vat).toBe(expectedTotal);
  });

  it("multi-line invoice totals match sum of per-line half-up VAT", () => {
    const lines = [
      { rateFils: 10n, qty: "1", vatRate: 0.05 }, // vat 1
      { rateFils: 30n, qty: "1", vatRate: 0.05 }, // vat 2
      { rateFils: 99n, qty: "1", vatRate: 0.05 }, // vat 5
    ];
    let subtotal = 0n;
    let vatTotal = 0n;
    for (const l of lines) {
      const value = multiplyFilsByDecimal(l.rateFils, l.qty);
      const vat = vatForLine(value, l.vatRate);
      subtotal += value;
      vatTotal += vat;
    }
    expect(subtotal).toBe(139n); // 10 + 30 + 99
    expect(vatTotal).toBe(8n); // 1 + 2 + 5
    expect(subtotal + vatTotal).toBe(147n);
  });
});

describe("client vatOf vs server vatForLine parity", () => {
  // Client vatOf (now half-up via vatForLine) must match server vatForLine
  // for the same line, so the invoice preview never disagrees with the posted total.
  it.each([
    [10n, "0.05", 1n], // 0.5 -> 1
    [8n, "0.05", 0n], // 0.4 -> 0
    [30n, "0.05", 2n], // 1.5 -> 2
    [99n, "0.05", 5n], // 4.95 -> 5
    [10n, "5", 1n], // percent form 5% -> 0.5 -> 1
    [10n, "0.075", 1n], // 0.75 -> 1
    [100n, "0.075", 8n], // 7.5 -> 8 (half up)
    [1000n, "20", 200n], // 20% -> 200
  ])("client vatOf(%s, %s) == server vatForLine(%s, %s) = %s", (value, vatRateStr, expectedVat) => {
    const fraction = parseFloat(vatRateStr) <= 1 ? parseFloat(vatRateStr) : parseFloat(vatRateStr) / 100;
    const clientVat = vatOf(value, vatRateStr);
    const serverVat = vatForLine(value, fraction);
    expect(clientVat).toBe(serverVat);
    expect(clientVat).toBe(expectedVat);
  });
});

