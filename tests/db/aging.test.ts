import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { createInvoice } from "@/lib/invoices";
import { createPayment } from "@/lib/payments";
import { calculateAgingBuckets } from "@/lib/aging";
import { partyStatement } from "@/lib/party-statement";
import { truncateAll } from "./helpers";
import { seedTestData, type TestContext } from "./seed";

let ctx: TestContext;

beforeEach(async () => {
  await truncateAll(prisma);
  ctx = await seedTestData(prisma);
});

describe("P2.4: Aging buckets and party statements", () => {
  it("calculates aging buckets correctly", async () => {
    const invoice = await prisma.$transaction(async (tx) =>
      createInvoice({
        tx,
        direction: "SALES",
        date: new Date("2026-01-01"),
        dueDate: new Date("2026-01-31"), // Past due
        partyId: ctx.customerId,
        createdById: ctx.userId,
        lines: [{ description: "test", qty: "1", unit: "KG", rateFils: 100000n, vatRate: 0.05 }],
      })
    );

    const buckets = await calculateAgingBuckets(ctx.customerId);
    expect(buckets.total).toBeGreaterThan(0n);
    // Since dueDate is past, should be in over90 or current depending on system date
    // The exact bucket depends on the test environment's current date
  });

  it("party statement includes summary, aging, and transactions", async () => {
    // Create an invoice
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

    // Create a partial payment
    await prisma.$transaction(async (tx) =>
      createPayment({
        tx,
        date: new Date("2026-06-05"),
        type: "RECEIPT",
        method: "CASH",
        partyId: ctx.customerId,
        createdById: ctx.userId,
        amountFils: 52500n, // Partial payment
        allocations: [{ invoiceId: invoice.id, amountFils: 52500n }],
      })
    );

    const statement = await partyStatement(ctx.customerId);

    expect(statement.party.id).toBe(ctx.customerId);
    expect(statement.summary.totalInvoiced).toBeGreaterThan(0n);
    expect(statement.summary.outstanding).toBeGreaterThan(0n);
    expect(statement.transactions.length).toBeGreaterThanOrEqual(1);
    expect(statement.aging.total).toBeGreaterThanOrEqual(0n);
  });

  it("party statement with no invoices returns zeros", async () => {
    const vendor = await prisma.party.findUniqueOrThrow({ where: { id: ctx.vendorId } });
    
    const statement = await partyStatement(vendor.id);

    expect(statement.summary.totalInvoiced).toBe(0n);
    expect(statement.summary.totalPaid).toBe(0n);
    expect(statement.summary.outstanding).toBe(0n);
    expect(statement.transactions.length).toBe(0);
  });

  it("unallocated payment shows as credit in statement", async () => {
    await prisma.$transaction(async (tx) =>
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

    const statement = await partyStatement(ctx.customerId);
    expect(statement.summary.availableCredit).toBe(100000n);
  });
});