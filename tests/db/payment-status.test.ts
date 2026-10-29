import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { createInvoice } from "@/lib/invoices";
import { createPayment } from "@/lib/payments";
import { voidPaymentWithReversal } from "@/lib/payments";
import type { PaymentType } from "@/generated/prisma/client";
import { truncateAll } from "./helpers";
import { seedTestData, type TestContext } from "./seed";

let ctx: TestContext;

beforeEach(async () => {
  await truncateAll(prisma);
  ctx = await seedTestData(prisma);
});

describe("P2.2: Payment status derivation", () => {
  it("new invoice starts as UNPAID", async () => {
    const invoice = await prisma.$transaction(async (tx) =>
      createInvoice({
        tx,
        direction: "SALES",
        date: new Date("2026-06-01"),
        partyId: ctx.customerId,
        createdById: ctx.userId,
        lines: [{ description: "test", qty: "1", unit: "KG", rateFils: 100000n, vatRate: 0.05 }],
      }),
    );
    expect(invoice.paymentStatus).toBe("UNPAID");
  });

  it("partial payment makes status PARTIAL", async () => {
    const invoice = await prisma.$transaction(async (tx) =>
      createInvoice({
        tx,
        direction: "SALES",
        date: new Date("2026-06-01"),
        partyId: ctx.customerId,
        createdById: ctx.userId,
        lines: [{ description: "test", qty: "1", unit: "KG", rateFils: 100000n, vatRate: 0.05 }],
      }),
    );

    await prisma.$transaction(async (tx) =>
      createPayment({
        tx,
        date: new Date("2026-06-05"),
        type: "RECEIPT",
        method: "CASH",
        partyId: ctx.customerId,
        createdById: ctx.userId,
        amountFils: 50000n, // Half of total (105000n)
        allocations: [{ invoiceId: invoice.id, amountFils: 50000n }],
      }),
    );

    const updated = await prisma.invoice.findUnique({ where: { id: invoice.id } });
    expect(updated?.paymentStatus).toBe("PARTIAL");
  });

  it("full payment makes status PAID", async () => {
    const invoice = await prisma.$transaction(async (tx) =>
      createInvoice({
        tx,
        direction: "SALES",
        date: new Date("2026-06-01"),
        partyId: ctx.customerId,
        createdById: ctx.userId,
        lines: [{ description: "test", qty: "1", unit: "KG", rateFils: 100000n, vatRate: 0.05 }],
      }),
    );

    await prisma.$transaction(async (tx) =>
      createPayment({
        tx,
        date: new Date("2026-06-05"),
        type: "RECEIPT",
        method: "CASH",
        partyId: ctx.customerId,
        createdById: ctx.userId,
        amountFils: 105000n, // Full total
        allocations: [{ invoiceId: invoice.id, amountFils: 105000n }],
      }),
    );

    const updated = await prisma.invoice.findUnique({ where: { id: invoice.id } });
    expect(updated?.paymentStatus).toBe("PAID");
  });

  it("invoice with past dueDate and no payment is OVERDUE", async () => {
    const invoice = await prisma.$transaction(async (tx) =>
      createInvoice({
        tx,
        direction: "SALES",
        date: new Date("2026-01-01"),
        dueDate: new Date("2026-01-31"), // Past date
        partyId: ctx.customerId,
        createdById: ctx.userId,
        lines: [{ description: "test", qty: "1", unit: "KG", rateFils: 100000n, vatRate: 0.05 }],
      }),
    );
    
    expect(invoice.paymentStatus).toBe("OVERDUE");
  });

  it("voiding payment reverts invoice to UNPAID", async () => {
    const invoice = await prisma.$transaction(async (tx) =>
      createInvoice({
        tx,
        direction: "SALES",
        date: new Date("2026-06-01"),
        partyId: ctx.customerId,
        createdById: ctx.userId,
        lines: [{ description: "test", qty: "1", unit: "KG", rateFils: 100000n, vatRate: 0.05 }],
      }),
    );

    const payment = await prisma.$transaction(async (tx) =>
      createPayment({
        tx,
        date: new Date("2026-06-05"),
        type: "RECEIPT",
        method: "CASH",
        partyId: ctx.customerId,
        createdById: ctx.userId,
        amountFils: 105000n,
        allocations: [{ invoiceId: invoice.id, amountFils: 105000n }],
      }),
    );

    // Verify it's PAID
    let updated = await prisma.invoice.findUnique({ where: { id: invoice.id } });
    expect(updated?.paymentStatus).toBe("PAID");

    // Void the payment
    await prisma.$transaction(async (tx) =>
      voidPaymentWithReversal({ tx, paymentId: payment.id, reason: "Test void", date: new Date("2026-06-10"), createdById: ctx.userId }),
    );

    // Verify it's back to UNPAID
    updated = await prisma.invoice.findUnique({ where: { id: invoice.id } });
    expect(updated?.paymentStatus).toBe("UNPAID");
  });
});