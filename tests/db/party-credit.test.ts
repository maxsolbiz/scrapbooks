import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { createInvoice } from "@/lib/invoices";
import { createPayment, applyCreditToInvoice, voidPaymentWithReversal } from "@/lib/payments";
import { partyCreditBalance, getUnallocatedPayments } from "@/lib/party-credit";
import { truncateAll } from "./helpers";
import { seedTestData, type TestContext } from "./seed";

let ctx: TestContext;

beforeEach(async () => {
  await truncateAll(prisma);
  ctx = await seedTestData(prisma);
});

describe("P2.3: Unallocated payment / credit tracking", () => {
  it("unallocated payment creates credit balance", async () => {
    await prisma.$transaction(async (tx) =>
      createPayment({
        tx,
        date: new Date("2026-06-01"),
        type: "RECEIPT",
        method: "CASH",
        partyId: ctx.customerId,
        createdById: ctx.userId,
        amountFils: 100000n,
        allocations: [], // Unallocated
      })
    );

    const credit = await partyCreditBalance(ctx.customerId);
    expect(credit).toBe(100000n);
  });

  it("partial allocation leaves remaining credit", async () => {
    const invoice = await prisma.$transaction(async (tx) =>
      createInvoice({
        tx,
        direction: "SALES",
        date: new Date("2026-06-01"),
        partyId: ctx.customerId,
        createdById: ctx.userId,
        lines: [{ description: "test", qty: "1", unit: "KG", rateFils: 50000n, vatRate: 0.05 }],
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
        amountFils: 100000n,
        allocations: [{ invoiceId: invoice.id, amountFils: 52500n }], // Partial
      })
    );

    const credit = await partyCreditBalance(ctx.customerId);
    expect(credit).toBe(47500n); // 100000 - 52500
  });

  it("applyCreditToInvoice uses FIFO from oldest payment", async () => {
    // Create two unallocated payments
    await prisma.$transaction(async (tx) =>
      createPayment({
        tx,
        date: new Date("2026-06-01"),
        type: "RECEIPT",
        method: "CASH",
        partyId: ctx.customerId,
        createdById: ctx.userId,
        amountFils: 50000n,
        allocations: [],
      })
    );

    await prisma.$transaction(async (tx) =>
      createPayment({
        tx,
        date: new Date("2026-06-15"),
        type: "RECEIPT",
        method: "CASH",
        partyId: ctx.customerId,
        createdById: ctx.userId,
        amountFils: 50000n,
        allocations: [],
      })
    );

    // Create invoice
    const invoice = await prisma.$transaction(async (tx) =>
      createInvoice({
        tx,
        direction: "SALES",
        date: new Date("2026-06-20"),
        partyId: ctx.customerId,
        createdById: ctx.userId,
        lines: [{ description: "test", qty: "1", unit: "KG", rateFils: 70000n, vatRate: 0.05 }],
      })
    );

    // Apply 73500 fils of credit (should use all 50000 from first + 23500 from second)
    await prisma.$transaction(async (tx) =>
      applyCreditToInvoice({ tx, invoiceId: invoice.id, amountFils: 73500n })
    );

    // Verify allocations
    const allocations = await prisma.paymentAllocation.findMany({
      where: { invoiceId: invoice.id },
      orderBy: { payment: { date: "asc" } },
    });

    expect(allocations.length).toBe(2);
    expect(allocations[0].amountFils).toBe(50000n); // First payment fully used
    expect(allocations[1].amountFils).toBe(23500n); // Second payment partially used

    // Verify remaining credit
    const credit = await partyCreditBalance(ctx.customerId);
    expect(credit).toBe(26500n); // 100000 total - 73500 applied
  });

  it("rejects over-application of credit", async () => {
    await prisma.$transaction(async (tx) =>
      createPayment({
        tx,
        date: new Date("2026-06-01"),
        type: "RECEIPT",
        method: "CASH",
        partyId: ctx.customerId,
        createdById: ctx.userId,
        amountFils: 50000n,
        allocations: [],
      })
    );

    const invoice = await prisma.$transaction(async (tx) =>
      createInvoice({
        tx,
        direction: "SALES",
        date: new Date("2026-06-05"),
        partyId: ctx.customerId,
        createdById: ctx.userId,
        lines: [{ description: "test", qty: "1", unit: "KG", rateFils: 100000n, vatRate: 0.05 }],
      })
    );

    // Try to apply more credit than available
    await expect(
      prisma.$transaction(async (tx) =>
        applyCreditToInvoice({ tx, invoiceId: invoice.id, amountFils: 60000n })
      )
    ).rejects.toThrow("Insufficient credit");
  });

  it("voiding unallocated payment removes credit", async () => {
    const payment = await prisma.$transaction(async (tx) =>
      createPayment({
        tx,
        date: new Date("2026-06-01"),
        type: "RECEIPT",
        method: "CASH",
        partyId: ctx.customerId,
        createdById: ctx.userId,
        amountFils: 100000n,
        allocations: [],
      })
    );

    let credit = await partyCreditBalance(ctx.customerId);
    expect(credit).toBe(100000n);

    // Void the payment
    await prisma.$transaction(async (tx) =>
      voidPaymentWithReversal({ tx, paymentId: payment.id, reason: "Test void", date: new Date("2026-06-05"), createdById: ctx.userId })
    );

    credit = await partyCreditBalance(ctx.customerId);
    expect(credit).toBe(0n);
  });

  it("getUnallocatedPayments returns FIFO ordered payments with remaining amounts", async () => {
    await prisma.$transaction(async (tx) =>
      createPayment({
        tx,
        date: new Date("2026-06-01"),
        type: "RECEIPT",
        method: "CASH",
        partyId: ctx.customerId,
        createdById: ctx.userId,
        amountFils: 50000n,
        allocations: [],
      })
    );

    await prisma.$transaction(async (tx) =>
      createPayment({
        tx,
        date: new Date("2026-06-15"),
        type: "RECEIPT",
        method: "CASH",
        partyId: ctx.customerId,
        createdById: ctx.userId,
        amountFils: 50000n,
        allocations: [],
      })
    );

    const unallocated = await getUnallocatedPayments(ctx.customerId);
    expect(unallocated.length).toBe(2);
    expect(unallocated[0].remaining).toBe(50000n);
    expect(unallocated[1].remaining).toBe(50000n);
    expect(unallocated[0].date <= unallocated[1].date).toBe(true);
  });
});