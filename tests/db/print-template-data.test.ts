import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { createInvoice } from "@/lib/invoices";
import { revisePostedInvoice } from "@/lib/invoice-revision";
import { createDeduction } from "@/lib/deduction-actions";
import { getPrintInvoice } from "@/lib/print-data";
import type { Tx } from "@/lib/tx";
import { truncateAll } from "./helpers";
import { seedTestData, type TestContext } from "./seed";

let ctx: TestContext;

beforeEach(async () => {
  await truncateAll(prisma); // shared worker state — every DB test file starts here
  ctx = await seedTestData(prisma);
});

async function seedPostedSalesInvoice() {
  const invoice = await prisma.$transaction((t) =>
    createInvoice({
      tx: t as Tx,
      direction: "SALES",
      date: new Date("2026-06-01"),
      partyId: ctx.customerId,
      lines: [
        { description: "scrap goods", qty: "10", unit: "KG", rateFils: 10000n, vatRate: 0.05 },
      ],
      createdById: ctx.userId,
    }),
  );
  return prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
}

async function seedPostedPurchaseInvoice() {
  const invoice = await prisma.$transaction((t) =>
    createInvoice({
      tx: t as Tx,
      direction: "PURCHASE",
      date: new Date("2026-06-02"),
      partyId: ctx.vendorId,
      lines: [
        { description: "bought scrap", qty: "5", unit: "KG", rateFils: 20000n, vatRate: 0.05 },
      ],
      createdById: ctx.userId,
    }),
  );
  return prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
}

async function amend(originalId: string) {
  return prisma.$transaction((t) =>
    revisePostedInvoice({
      originalInvoiceId: originalId,
      direction: "SALES",
      reason: "print data test",
      updates: {
        date: new Date("2026-06-01"),
        lines: [{ description: "scrap goods", qty: "1", unit: "KG", rateFils: 10000n, vatRate: 0 }],
      },
      createdById: ctx.userId,
      tx: t as Tx,
    }),
  );
}

describe("P3.3: print template data (getPrintInvoice)", () => {
  it("plain POSTED invoice: no revision lineage, deductions present as empty array", async () => {
    const invoice = await seedPostedSalesInvoice();
    const printData = await getPrintInvoice(invoice.id, "SALES");
    expect(printData).not.toBeNull();
    expect(printData!.revisionNumber).toBe(0);
    expect(printData!.revisesInvoice).toBeNull();
    expect(printData!.revisedBy).toEqual([]);
    expect(printData!.deductions).toEqual([]);
    expect(printData!.lines).toHaveLength(1);
    expect(printData!.party.nameEn).toBeTruthy();
  });

  it("revision chain: revision payload links back (revisesInvoice.invoiceNo) and VOID original links forward (revisedBy[0])", async () => {
    const original = await seedPostedSalesInvoice();
    const result = await amend(original.id);

    // The revision's print payload: revisionNumber > 0 + revisesInvoice.invoiceNo.
    const revisionData = await getPrintInvoice(result.newInvoice.id, "SALES");
    expect(revisionData).not.toBeNull();
    expect(revisionData!.revisionNumber).toBe(1);
    expect(revisionData!.revisesInvoice?.invoiceNo).toBe(original.invoiceNo);
    expect(revisionData!.status).toBe("POSTED");

    // The VOID original's print payload: revisedBy[0].invoiceNo (latest revision).
    const originalData = await getPrintInvoice(original.id, "SALES");
    expect(originalData).not.toBeNull();
    expect(originalData!.status).toBe("VOID");
    expect(originalData!.revisedBy).toHaveLength(1);
    expect(originalData!.revisedBy[0].invoiceNo).toBe(result.newInvoice.invoiceNo);
    expect(originalData!.revisesInvoice).toBeNull();
  });

  it("deductions are fetched with reason/amount/notes and ordered by createdAt asc", async () => {
    const invoice = await seedPostedSalesInvoice();
    const first = await prisma.$transaction((t) =>
      createDeduction({
        tx: t as Tx,
        invoiceId: invoice.id,
        reason: "SHORTAGE",
        amountFils: 2000n,
        notes: "weighbridge short",
        createdById: ctx.userId,
      }),
    );
    const second = await prisma.$transaction((t) =>
      createDeduction({
        tx: t as Tx,
        invoiceId: invoice.id,
        reason: "DAMAGE",
        amountFils: 1500n,
        notes: null,
        createdById: ctx.userId,
      }),
    );
    // Force a deterministic createdAt order regardless of clock resolution.
    await prisma.invoiceDeduction.update({
      where: { id: first.deduction!.id },
      data: { createdAt: new Date("2026-06-01T10:00:00Z") },
    });
    await prisma.invoiceDeduction.update({
      where: { id: second.deduction!.id },
      data: { createdAt: new Date("2026-06-02T10:00:00Z") },
    });

    const printData = await getPrintInvoice(invoice.id, "SALES");
    expect(printData!.deductions).toHaveLength(2);
    expect(printData!.deductions.map((d) => d.id)).toEqual([
      first.deduction!.id,
      second.deduction!.id,
    ]);
    expect(printData!.deductions[0].reason).toBe("SHORTAGE");
    expect(printData!.deductions[0].amountFils).toBe(2000n);
    expect(printData!.deductions[0].notes).toBe("weighbridge short");
    expect(printData!.deductions[1].reason).toBe("DAMAGE");
    expect(printData!.deductions[1].amountFils).toBe(1500n);
  });

  it("direction filter: PURCHASE invoices are only returned for PURCHASE lookups", async () => {
    const purchase = await seedPostedPurchaseInvoice();
    const forPurchase = await getPrintInvoice(purchase.id, "PURCHASE");
    expect(forPurchase).not.toBeNull();
    expect(forPurchase!.direction).toBe("PURCHASE");

    const forSales = await getPrintInvoice(purchase.id, "SALES");
    expect(forSales).toBeNull();

    const sales = await seedPostedSalesInvoice();
    const salesData = await getPrintInvoice(sales.id, "SALES");
    expect(salesData).not.toBeNull();
    expect(salesData!.direction).toBe("SALES");
    expect(await getPrintInvoice(sales.id, "PURCHASE")).toBeNull();
  });
});
