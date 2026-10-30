import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { createInvoice } from "@/lib/invoices";
import { createDeduction } from "@/lib/deduction-actions";
import { getDeductionsSummary } from "@/lib/reports";
import { truncateAll } from "./helpers";
import { seedTestData, type TestContext } from "./seed";
import type { Tx } from "@/lib/tx";

let ctx: TestContext;

beforeEach(async () => {
  await truncateAll(prisma);
  ctx = await seedTestData(prisma);
});

async function seedSalesInvoice() {
  const inv = await prisma.$transaction(async (tx) =>
    createInvoice({
      tx: tx as Tx,
      direction: "SALES",
      date: new Date("2026-06-01"),
      partyId: ctx.customerId,
      lines: [{ description: "goods", qty: "1", unit: "KG", rateFils: 50000n, vatRate: 0.05 }],
      createdById: ctx.userId,
    })
  );
  return prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } });
}

describe("P5.5: Deductions summary (D1 VAT split aggregation)", () => {
  it("filters by direction and aggregates base + VAT by reason", async () => {
    const invoice = await seedSalesInvoice();
    await prisma.$transaction(async (tx) =>
      createDeduction({
        tx: tx as Tx,
        invoiceId: invoice.id,
        reason: "SHORTAGE",
        baseAmountFils: 10000n,
        notes: "test deduction",
        createdById: ctx.userId,
      })
    );
    await prisma.$transaction(async (tx) =>
      createDeduction({
        tx: tx as Tx,
        invoiceId: invoice.id,
        reason: "COMMERCIAL_DISCOUNT",
        baseAmountFils: 5000n,
        notes: null,
        createdById: ctx.userId,
      })
    );

    const fy = await prisma.fiscalYear.findFirstOrThrow({ where: { name: ctx.fiscalYearName } });
    const all = await getDeductionsSummary({
      fromDate: fy.starts,
      toDate: fy.ends,
      direction: "SALES",
    });
    expect(all.length).toBe(2);
    const shortage = all.find((r) => r.reason === "SHORTAGE");
    const discount = all.find((r) => r.reason === "COMMERCIAL_DISCOUNT");
    expect(shortage?.baseAmountFils).toBe(10000n);
    expect(shortage?.totalFils).toBe(10500n); // 5% VAT
    expect(discount?.baseAmountFils).toBe(5000n);
    expect(discount?.totalFils).toBe(5250n);
  });

  it("date range excludes deductions outside the period", async () => {
    const fy = await prisma.fiscalYear.findFirstOrThrow({ where: { name: ctx.fiscalYearName } });
    const invoice = await seedSalesInvoice();
    await prisma.$transaction(async (tx) =>
      createDeduction({
        tx: tx as Tx,
        invoiceId: invoice.id,
        reason: "DAMAGE",
        baseAmountFils: 3000n,
        createdById: ctx.userId,
      })
    );
    const future = await getDeductionsSummary({ fromDate: new Date("2099-01-01"), toDate: new Date("2099-12-31") });
    expect(future).toHaveLength(0);
  });

  it("reason filter limits results correctly", async () => {
    const fy = await prisma.fiscalYear.findFirstOrThrow({ where: { name: ctx.fiscalYearName } });
    const invoice = await seedSalesInvoice();
    await prisma.$transaction(async (tx) =>
      createDeduction({
        tx: tx as Tx,
        invoiceId: invoice.id,
        reason: "RETURN",
        baseAmountFils: 2000n,
        createdById: ctx.userId,
      })
    );
    const filtered = await getDeductionsSummary({ fromDate: fy.starts, toDate: fy.ends, reason: "RETURN" });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].reason).toBe("RETURN");
  });
});
