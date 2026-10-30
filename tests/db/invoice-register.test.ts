import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { createInvoice } from "@/lib/invoices";
import { createPayment } from "@/lib/payments";
import { createDeduction } from "@/lib/deduction-actions";
import { getInvoiceRegister, invoiceRegisterToCsv } from "@/lib/reports";
import { truncateAll } from "./helpers";
import { seedTestData, type TestContext } from "./seed";
import type { InvoiceRegisterFilter } from "@/lib/reports";
import type { DeductionReason } from "@/generated/prisma/enums";

let ctx: TestContext;

beforeEach(async () => {
  await truncateAll(prisma);
  ctx = await seedTestData(prisma);
});

describe("P5.2: Invoice Register + CSV Export", () => {
  it("filters register rows by direction", async () => {
    await prisma.$transaction(async (tx) =>
      createInvoice({
        tx,
        direction: "SALES",
        date: new Date("2026-06-01"),
        partyId: ctx.customerId,
        createdById: ctx.userId,
        lines: [{ description: "test", qty: "1", unit: "KG", rateFils: 100000n, vatRate: 0.05 }],
      })
    );
    await prisma.$transaction(async (tx) =>
      createInvoice({
        tx,
        direction: "PURCHASE",
        date: new Date("2026-06-02"),
        partyId: ctx.vendorId,
        createdById: ctx.userId,
        lines: [{ description: "test", qty: "1", unit: "KG", rateFils: 80000n, vatRate: 0.05 }],
      })
    );

    const sales = await getInvoiceRegister({ direction: "SALES" });
    expect(sales.length).toBeGreaterThan(0);
    for (const r of sales) expect(r.direction).toBe("SALES");
  });

  it("returns empty register for a future date range", async () => {
    const rows = await getInvoiceRegister({ fromDate: new Date("2030-01-01") });
    expect(rows).toEqual([]);
  });

  it("computes outstanding and payment status net of deductions", async () => {
    const invoice = await prisma.$transaction(async (tx) =>
      createInvoice({
        tx,
        direction: "SALES",
        date: new Date("2026-06-01"),
        partyId: ctx.customerId,
        createdById: ctx.userId,
        lines: [{ description: "test", qty: "1", unit: "KG", rateFils: 100000n, vatRate: 0.05 }],
      })
    );

    await prisma.$transaction(async (tx) =>
      createPayment({
        tx,
        date: new Date("2026-06-05"),
        type: "RECEIPT",
        method: "CASH",
        partyId: ctx.customerId,
        createdById: ctx.userId,
        amountFils: 52500n,
        allocations: [{ invoiceId: invoice.id, amountFils: 52500n }],
      })
    );

    const before = await getInvoiceRegister({});
    const beforeRow = before.find((r) => r.id === invoice.id);
    expect(beforeRow).toBeDefined();
    expect(beforeRow!.paidFils).toBe(52500n);
    expect(beforeRow!.outstandingFils).toBe(invoice.totalFils - 52500n);

    await prisma.$transaction(async (tx) =>
      createDeduction({
        tx,
        invoiceId: invoice.id,
        reason: "SHORTAGE" as DeductionReason,
        amountFils: 20000n,
        createdById: ctx.userId,
      })
    );

    const after = await getInvoiceRegister({});
    const afterRow = after.find((r) => r.id === invoice.id);
    expect(afterRow).toBeDefined();
    // paid 52500 + deduction 20000 = net settled 72500; outstanding = 105000 - 72500 = 32500
    expect(afterRow!.outstandingFils).toBe(invoice.totalFils - 72500n);
  });

  it("generates CSV with BOM, headers, and escaped party names", async () => {
    const rows = await getInvoiceRegister({});
    const csv = invoiceRegisterToCsv(rows);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("Invoice No");
    expect(csv).toContain("Payment Status");
  });
});
