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
  // NUMERIC(18,3) rounds stored qty to 1.001, but lineValueFils is computed
  // from the original "1.0005" string, so lineValueFils != qty * rateFils / 1000
  // when computed from stored values.
  it("qty 1.0005: stored qty rounded by NUMERIC(18,3), lineValue computed from original string", async () => {
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
    // lineValue = 100000n * 1005 / 1000n = 100500n (computed from "1.0005" string)
    expect(line.lineValueFils).toBe(100500n);
    expect(line.lineVatFils).toBe(5025n); // vatForLine(100500n, 0.05)
    expect(line.lineTotalFils).toBe(105525n);
    // Stored qty rounded by NUMERIC(18,3): 1.0005 -> 1.001 (or 1.000, depends on PG rounding)
    console.log(`Stored qty for 1.0005 input: ${line.qty}`);
  });

  it("qty 1.0004: stored qty rounded, lineValue computed from original string", async () => {
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
    // lineValue = 100000n * 10004 / 1000n = 100400n
    expect(line.lineValueFils).toBe(100400n);
    expect(line.lineVatFils).toBe(5020n);
    expect(line.lineTotalFils).toBe(105420n);
    console.log(`Stored qty for 1.0004 input: ${line.qty}`);
  });

  it("qty 1.0006: stored qty rounded, lineValue computed from original string", async () => {
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
    // lineValue = 100000n * 10006 / 1000n = 1000600n
    expect(line.lineValueFils).toBe(1000600n);
    expect(line.lineVatFils).toBe(5003n); // vatForLine(1000600n, 0.05) = 5003n
    expect(line.lineTotalFils).toBe(1005603n);
    console.log(`Stored qty for 1.0006 input: ${line.qty}`);
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
    console.log(`Stored qty for 1.000 input: ${line.qty}`);
  });
});
