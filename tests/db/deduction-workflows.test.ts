import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { createInvoice } from "@/lib/invoices";
import { createDeduction } from "@/lib/deduction-actions";
import { truncateAll } from "./helpers";
import { seedTestData, type TestContext } from "./seed";
import type { DeductionReason } from "@/generated/prisma/enums";

let ctx: TestContext;

beforeEach(async () => {
  await truncateAll(prisma);
  ctx = await seedTestData(prisma);
});

describe("P2.6: Invoice deductions / debit notes", () => {
  it("creates a deduction and reduces the invoice outstanding balance", async () => {
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

    expect(invoice.totalFils).toBeGreaterThan(0n);

    const result = await prisma.$transaction(async (tx) =>
      createDeduction({
        tx,
        invoiceId: invoice.id,
        reason: "SHORTAGE" as DeductionReason,
        amountFils: 20000n,
        notes: "short shipment",
        createdById: ctx.userId,
      })
    );

    expect(result.deduction).toBeDefined();
    expect(result.deduction!.invoiceId).toBe(invoice.id);

    const updated = await prisma.invoice.findUnique({
      where: { id: invoice.id },
      include: { deductions: true, allocations: true },
    });
    expect(updated!.deductions.length).toBe(1);
    expect(updated!.deductions[0].amountFils).toBe(20000n);
  });

  it("creates a debit note journal entry (debit expense, credit AR) for sales deductions", async () => {
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

    const result = await prisma.$transaction(async (tx) =>
      createDeduction({
        tx,
        invoiceId: invoice.id,
        reason: "DAMAGE" as DeductionReason,
        amountFils: 5000n,
        createdById: ctx.userId,
      })
    );

    expect(result.journalEntry).toBeDefined();
    const je = await prisma.journalEntry.findUnique({
      where: { id: result.journalEntry!.id },
      include: { lines: true },
    });
    expect(je).toBeDefined();
    expect(je!.status).toBe("POSTED");
    const debits = je!.lines.filter((l) => l.debit > 0n).reduce((s, l) => s + l.debit, 0n);
    const credits = je!.lines.filter((l) => l.credit > 0n).reduce((s, l) => s + l.credit, 0n);
    expect(debits).toBe(5000n);
    expect(credits).toBe(5000n);
    expect(je!.sourceType).toBe("MANUAL");
  });

  it("rejects a deduction that exceeds the invoice outstanding balance", async () => {
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

    await expect(
      prisma.$transaction(async (tx) =>
        createDeduction({
          tx,
          invoiceId: invoice.id,
          reason: "SHORTAGE" as DeductionReason,
          amountFils: invoice.totalFils + 1n,
          createdById: ctx.userId,
        })
      )
    ).rejects.toThrow("Deduction exceeds the invoice outstanding balance");
  });

  it("marks the invoice PAID when a deduction fully covers the outstanding balance", async () => {
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

    const result = await prisma.$transaction(async (tx) =>
      createDeduction({
        tx,
        invoiceId: invoice.id,
        reason: "DISCOUNT" as DeductionReason,
        amountFils: invoice.totalFils,
        createdById: ctx.userId,
      })
    );

    expect(result.deduction).toBeDefined();
    const updated = await prisma.invoice.findUnique({
      where: { id: invoice.id },
      select: { paymentStatus: true },
    });
    expect(updated!.paymentStatus).toBe("PAID");
  });
});
