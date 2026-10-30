import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { createInvoice } from "@/lib/invoices";
import { createDeduction } from "@/lib/deduction-actions";
import { calculateVAT201 } from "@/lib/vat-return";
import { truncateAll } from "./helpers";
import { seedTestData, type TestContext } from "./seed";
import type { Tx } from "@/lib/tx";

let ctx: TestContext;

beforeEach(async () => {
  await truncateAll(prisma);
  ctx = await seedTestData(prisma);
});

async function seedStandardSalesInvoice() {
  return await prisma.$transaction(async (tx) =>
    createInvoice({
      tx: tx as Tx,
      direction: "SALES",
      date: new Date("2026-06-01"),
      partyId: ctx.customerId,
      lines: [{ description: "test std sales", qty: "2", unit: "KG", rateFils: 50000n, vatRate: 0.05 }],
      createdById: ctx.userId,
    })
  ).then((inv) => prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } }));
}

async function seedZeroRatedSalesInvoice() {
  return await prisma.$transaction(async (tx) =>
    createInvoice({
      tx: tx as Tx,
      direction: "SALES",
      date: new Date("2026-06-02"),
      partyId: ctx.customerId,
      lines: [{ description: "zero rated", qty: "3", unit: "KG", rateFils: 30000n, vatRate: 0 }],
      createdById: ctx.userId,
    })
  ).then((inv) => prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } }));
}

async function seedStandardPurchaseInvoice() {
  return await prisma.$transaction(async (tx) =>
    createInvoice({
      tx: tx as Tx,
      direction: "PURCHASE",
      date: new Date("2026-06-03"),
      partyId: ctx.vendorId,
      lines: [{ description: "test purchase", qty: "1", unit: "KG", rateFils: 20000n, vatRate: 0.05 }],
      createdById: ctx.userId,
    })
  ).then((inv) => prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } }));
}

describe("P5.1: VAT 201 Return (D1 adjustments included)", () => {
  it("aggregates standard-rated sales and VAT correctly with D1 deductions", async () => {
    const fy = await prisma.fiscalYear.findFirstOrThrow({
      where: { name: ctx.fiscalYearName },
    });
    const sales = await seedStandardSalesInvoice();
    await prisma.$transaction(async (tx) =>
      createDeduction({
        tx: tx as Tx,
        invoiceId: sales.id,
        reason: "SHORTAGE",
        baseAmountFils: 10000n,
        notes: "vat test",
        createdById: ctx.userId,
      })
    );

    const result = await calculateVAT201({
      fiscalYearId: fy.id,
      fromDate: fy.starts,
      toDate: fy.ends,
    });

    expect(result.fiscalYearName).toBe(fy.name);
    // Sales base = 2 * 50000 = 100000n; VAT = 5000n; deduction base 10000n, VAT 500n.
    expect(result.box1.amountFils).toBe(100000n);
    expect(result.box2.vatFils).toBe(5000n); // sales VAT only (before adjustments separated)
    expect(result.box8Sales.amountFils).toBe(10000n);
    expect(result.box8Sales.vatFils).toBe(0n); // VAT shown separately in box9Sales
    expect(result.box9Sales.vatFils).toBe(500n);
  });

  it("includes zero-rated and standard-rated sales in separate boxes", async () => {
    const fy = await prisma.fiscalYear.findFirstOrThrow({ where: { name: ctx.fiscalYearName } });
    await seedStandardSalesInvoice();
    await seedZeroRatedSalesInvoice();

    const result = await calculateVAT201({ fiscalYearId: fy.id, fromDate: fy.starts, toDate: fy.ends });
    expect(result.box1.amountFils).toBeGreaterThan(0n); // standard-rated base
    expect(result.box3.amountFils).toBeGreaterThan(0n); // zero-rated base
  });

  it("calculates purchase adjustments and net VAT correctly (D1)", async () => {
    const fy = await prisma.fiscalYear.findFirstOrThrow({ where: { name: ctx.fiscalYearName } });
    const purchase = await seedStandardPurchaseInvoice();
    await prisma.$transaction(async (tx) =>
      createDeduction({
        tx: tx as Tx,
        invoiceId: purchase.id,
        reason: "DAMAGE",
        baseAmountFils: 5000n,
        notes: "vat purchase test",
        createdById: ctx.userId,
      })
    );

    const result = await calculateVAT201({ fiscalYearId: fy.id, fromDate: fy.starts, toDate: fy.ends });
    expect(result.box6.amountFils).toBeGreaterThan(0n);
    expect(result.box7.vatFils).toBeGreaterThan(0n);
    expect(result.box8Purchase.amountFils).toBe(5000n); // purchase deduction base
    expect(result.box9Purchase.vatFils).toBe(250n); // 5% VAT on purchase deduction
    expect(typeof result.netVatPayable).toBe("bigint");
  });

  it("date range excludes invoices outside the range", async () => {
    const fy = await prisma.fiscalYear.findFirstOrThrow({ where: { name: ctx.fiscalYearName } });
    await seedStandardSalesInvoice();

    const result = await calculateVAT201({
      fiscalYearId: fy.id,
      fromDate: new Date("2099-01-01"),
      toDate: new Date("2099-12-31"),
    });
    expect(result.box1.amountFils).toBe(0n);
    expect(result.box2.vatFils).toBe(0n);
    expect(result.netVatPayable).toBe(0n);
  });
});
