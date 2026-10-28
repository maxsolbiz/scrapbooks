import { describe, it, expect } from "vitest";
import { roundFils } from "@/lib/invoices";
import { roundHalfUpDiv, RATE_SCALE, vatForLine, multiplyFilsByDecimal } from "@/lib/money";

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

