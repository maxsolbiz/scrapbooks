import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { createInvoice } from "@/lib/invoices";
import { createDeduction, updateDeduction } from "@/lib/deduction-actions";
import { truncateAll } from "./helpers";
import { seedTestData, type TestContext } from "./seed";
import type { Tx } from "@/lib/tx";

let ctx: TestContext;

beforeEach(async () => {
  await truncateAll(prisma);
  ctx = await seedTestData(prisma);
});

async function seedPostedSalesInvoice() {
  return await prisma.$transaction(async (tx) =>
    createInvoice({
      tx: tx as Tx,
      direction: "SALES",
      date: new Date("2026-06-01"),
      partyId: ctx.customerId,
      lines: [{ description: "scrap goods", qty: "10", unit: "KG", rateFils: 10000n, vatRate: 0.05 }],
      createdById: ctx.userId,
    })
  ).then((inv) => prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } }));
}

async function seedPostedPurchaseInvoice() {
  return await prisma.$transaction(async (tx) =>
    createInvoice({
      tx: tx as Tx,
      direction: "PURCHASE",
      date: new Date("2026-06-02"),
      partyId: ctx.vendorId,
      lines: [{ description: "bought scrap", qty: "5", unit: "KG", rateFils: 20000n, vatRate: 0.05 }],
      createdById: ctx.userId,
    })
  ).then((inv) => prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } }));
}

describe("P3.1: deduction posting with D1 VAT split (base + VAT)", () => {
  it("posts a SALES deduction with base + VAT journal entry (3 lines)", async () => {
    const invoice = await seedPostedSalesInvoice();
    // Invoice: base 100000n + VAT 5000n = total 105000n
    const result = await prisma.$transaction(async (tx) =>
      createDeduction({
        tx: tx as Tx,
        invoiceId: invoice.id,
        reason: "SHORTAGE",
        baseAmountFils: 20000n,
        notes: "short shipment",
        createdById: ctx.userId,
        createdByEmail: "audit@test.local",
      })
    );

    expect(result.deduction).toBeDefined();
    expect(result.deduction!.baseAmountFils).toBe(20000n);
    // VAT = 5% of 20000 = 1000n
    expect(result.deduction!.vatRate).toBeCloseTo(Number(0.05), 4);
    expect(result.deduction!.vatFils).toBe(1000n);
    expect(result.deduction!.totalFils).toBe(21000n);

    const je = await prisma.journalEntry.findUniqueOrThrow({
      where: { id: result.deduction!.journalEntryId! },
      include: { lines: true },
    });
    expect(je.status).toBe("POSTED");
    expect(je.sourceType).toBe("MANUAL");
    // SALES deduction JE: Dr 5700 (base), Dr 2150 (VAT), Cr 1130 (total) — 3 lines.
    expect(je.lines.length).toBe(3);
    const debits = je.lines.filter((l) => l.debit > 0n);
    const credits = je.lines.filter((l) => l.credit > 0n);
    // Base and VAT legs are debits; AR is the single credit.
    expect(debits).toHaveLength(2);
    expect(credits).toHaveLength(1);
    expect(debits.reduce((s, d) => s + d.debit, 0n)).toBe(21000n);
    expect(credits[0].credit).toBe(21000n);
  });

  it("posts a PURCHASE deduction with base + VAT journal entry (3 lines)", async () => {
    const invoice = await seedPostedPurchaseInvoice();
    const result = await prisma.$transaction(async (tx) =>
      createDeduction({
        tx: tx as Tx,
        invoiceId: invoice.id,
        reason: "DAMAGE",
        baseAmountFils: 10000n,
        notes: "water damage",
        createdById: ctx.userId,
        createdByEmail: "audit@test.local",
      })
    );

    expect(result.deduction!.baseAmountFils).toBe(10000n);
    expect(result.deduction!.vatFils).toBe(500n); // 5%
    expect(result.deduction!.totalFils).toBe(10500n);

    const je = await prisma.journalEntry.findUniqueOrThrow({
      where: { id: result.deduction!.journalEntryId! },
      include: { lines: true },
    });
    // PURCHASE: Dr 2100 (total) + Cr 5800 (base) + Cr 2150 (VAT) — 3 lines.
    expect(je.lines.length).toBe(3);
    const apId = (await prisma.account.findUniqueOrThrow({ where: { code: "2100" } })).id;
    expect(je.lines.some((l) => l.accountId === apId)).toBe(true);
  });

  it("rejects a deduction exceeding the invoice outstanding balance", async () => {
    const invoice = await seedPostedSalesInvoice();
    await expect(
      prisma.$transaction(async (tx) =>
        createDeduction({
          tx: tx as Tx,
          invoiceId: invoice.id,
          reason: "SHORTAGE",
          baseAmountFils: 99999999n,
          createdById: ctx.userId,
        })
      )
    ).rejects.toThrow("Deduction exceeds the invoice outstanding balance");
  });

  it("writes an in-tx audit DEDUCTION_POSTED record", async () => {
    const invoice = await seedPostedSalesInvoice();
    await prisma.$transaction(async (tx) =>
      createDeduction({
        tx: tx as Tx,
        invoiceId: invoice.id,
        reason: "COMMERCIAL_DISCOUNT",
        baseAmountFils: 5000n,
        createdById: ctx.userId,
        createdByEmail: "audit@test.local",
      })
    );
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: "DEDUCTION_POSTED", entityType: "InvoiceDeduction", userEmail: "audit@test.local" },
      orderBy: { createdAt: "desc" },
    });
    expect(audit.entityType).toBe("InvoiceDeduction");
    expect(audit.action).toBe("DEDUCTION_POSTED");
  });

  it("rejects a deduction on a DRAFT invoice", async () => {
    const draft = await prisma.invoice.create({
      data: {
        invoiceNo: "INV-DRAFT-D1-001",
        direction: "SALES",
        date: new Date("2026-06-01"),
        partyId: ctx.customerId,
        status: "DRAFT",
        totalFils: 500n,
        createdById: ctx.userId,
      },
    });
    await expect(
      prisma.$transaction(async (tx) =>
        createDeduction({
          tx: tx as Tx,
          invoiceId: draft.id,
          reason: "SHORTAGE",
          baseAmountFils: 100n,
          createdById: ctx.userId,
        })
      )
    ).rejects.toThrow("Only posted invoices can be deducted");
  });
});
