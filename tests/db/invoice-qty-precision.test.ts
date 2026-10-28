import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { createInvoice } from "@/lib/invoices";
import { truncateAll } from "./helpers";
import { seedTestData, type TestContext } from "./seed";

let ctx: TestContext;

beforeEach(async () => {
  await truncateAll(prisma); // shared worker state — every DB test file starts here
  ctx = await seedTestData(prisma);
});

describe("createInvoice qty precision (F12)", () => {
  // qty "1.0005" is passed to multiplyFilsByDecimal as a string.
  // multiplyFilsByDecimal truncates to 3 decimal places (takes first 3 digits of fractional part),
  // so 1.0005 → qtyThousandths = 1000 → lineValueFils = rateFils * 1000 / 1000 = rateFils.
  // NUMERIC(18,3) rounds stored qty: 1.0005 → 1.001 (PostgreSQL rounds half up).
  // So lineValueFils is computed from the original "1.0005" string but truncated to 3 decimals,
  // while the stored qty column holds 1.001 — they no longer match.
  it("qty 1.0005: stored qty rounded by NUMERIC(18,3), lineValue computed from truncated qty", async () => {
    const invoice = await prisma.$transaction(async (tx) =>
      createInvoice({
        tx,
        direction: "SALES",
        date: new Date("2026-06-15"),
        partyId: ctx.customerId,
        createdById: ctx.userId,
        lines: [{ description: "qty precision", qty: "1.0005", unit: "KG", rateFils: 100000n, vatRate: 0.05 }],
      }),
    );

    const line = await prisma.invoiceLine.findFirstOrThrow({ where: { invoiceId: invoice.id } });
    // lineValue = 100000n * 1000 / 1000n = 100000n (multiplyFilsByDecimal truncates to 3 decimals)
    expect(line.lineValueFils).toBe(100000n);
    expect(line.lineVatFils).toBe(5000n); // vatForLine(100000n, 0.05) = 5000n
    expect(line.lineTotalFils).toBe(105000n);
    // Stored qty rounded by NUMERIC(18,3): 1.0005 → 1.001
    expect(line.qty.toString()).toBe("1.001");
    // F12 invariant: stored qty × rate ≠ lineValue because lineValue was computed
    // from the truncated (3-decimal) qty, not the rounded stored qty.
    const storedValue = (line.rateFils * BigInt(Math.round(Number(line.qty) * 1000))) / 1000n;
    expect(storedValue).not.toBe(line.lineValueFils); // F12 mismatch — observed, not fixed
  });

  it("qty 1.0004: stored qty rounded, lineValue computed from truncated qty", async () => {
    const invoice = await prisma.$transaction(async (tx) =>
      createInvoice({
        tx,
        direction: "SALES",
        date: new Date("2026-06-15"),
        partyId: ctx.customerId,
        createdById: ctx.userId,
        lines: [{ description: "qty 1.0004", qty: "1.0004", unit: "KG", rateFils: 100000n, vatRate: 0.05 }],
      }),
    );

    const line = await prisma.invoiceLine.findFirstOrThrow({ where: { invoiceId: invoice.id } });
    // lineValue = 100000n * 1000 / 1000n = 100000n (1.0004 truncated to 3 decimals)
    expect(line.lineValueFils).toBe(100000n);
    expect(line.lineVatFils).toBe(5000n); // vatForLine(100000n, 0.05) = 5000n
    expect(line.lineTotalFils).toBe(105000n);
    // Stored qty rounded by NUMERIC(18,3): 1.0004 → 1
    expect(line.qty.toString()).toBe("1");
    // F12 invariant: stored qty × rate = lineValue (both computed from 3-decimal qty)
    const storedValue = (line.rateFils * BigInt(Math.round(Number(line.qty) * 1000))) / 1000n;
    expect(storedValue).toBe(line.lineValueFils); // match — no mismatch
  });

  it("qty 1.0006: stored qty rounded, lineValue computed from truncated qty", async () => {
    const invoice = await prisma.$transaction(async (tx) =>
      createInvoice({
        tx,
        direction: "SALES",
        date: new Date("2026-06-15"),
        partyId: ctx.customerId,
        createdById: ctx.userId,
        lines: [{ description: "qty 1.0006", qty: "1.0006", unit: "KG", rateFils: 100000n, vatRate: 0.05 }],
      }),
    );

    const line = await prisma.invoiceLine.findFirstOrThrow({ where: { invoiceId: invoice.id } });
    // lineValue = 100000n * 1000 / 1000n = 100000n (1.0006 truncated to 3 decimals)
    expect(line.lineValueFils).toBe(100000n);
    expect(line.lineVatFils).toBe(5000n); // vatForLine(100000n, 0.05) = 5000n
    expect(line.lineTotalFils).toBe(105000n);
    // Stored qty rounded by NUMERIC(18,3): 1.0006 → 1.001
    expect(line.qty.toString()).toBe("1.001");
    // F12 invariant: stored qty × rate ≠ lineValue because lineValue was computed
    // from the truncated (3-decimal) qty, not the rounded stored qty.
    const storedValue = (line.rateFils * BigInt(Math.round(Number(line.qty) * 1000))) / 1000n;
    expect(storedValue).not.toBe(line.lineValueFils); // F12 mismatch — observed, not fixed
  });

  it("qty 1.000: stored exactly, lineValue matches stored qty", async () => {
    const invoice = await prisma.$transaction(async (tx) =>
      createInvoice({
        tx,
        direction: "SALES",
        date: new Date("2026-06-15"),
        partyId: ctx.customerId,
        createdById: ctx.userId,
        lines: [{ description: "qty 1.000", qty: "1.000", unit: "KG", rateFils: 100000n, vatRate: 0.05 }],
      }),
    );

    const line = await prisma.invoiceLine.findFirstOrThrow({ where: { invoiceId: invoice.id } });
    expect(line.lineValueFils).toBe(100000n);
    expect(line.lineVatFils).toBe(5000n);
    expect(line.lineTotalFils).toBe(105000n);
    // Stored qty exactly 1.000
    expect(line.qty.toString()).toBe("1");
    // F12 invariant: stored qty × rate = lineValue (both computed from 3-decimal qty)
    const storedValue = (line.rateFils * BigInt(Math.round(Number(line.qty) * 1000))) / 1000n;
    expect(storedValue).toBe(line.lineValueFils); // match — no mismatch
  });
});
