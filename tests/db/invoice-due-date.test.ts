import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { createInvoice } from "@/lib/invoices";
import { truncateAll } from "./helpers";
import { seedTestData, type TestContext } from "./seed";

let ctx: TestContext;

beforeEach(async () => {
  await truncateAll(prisma);
  ctx = await seedTestData(prisma);
});

describe("P2.1: Invoice dueDate and paymentTerms", () => {
  it("auto-calculates dueDate from paymentTerms when dueDate not provided", async () => {
    const invoice = await prisma.$transaction(async (tx) =>
      createInvoice({
        direction: "SALES",
        date: new Date("2026-06-01"),
        partyId: ctx.customerId,
        createdById: ctx.userId,
        paymentTerms: 30,
        lines: [
          { description: "test", qty: "1", unit: "KG", rateFils: 100000n, vatRate: 0.05 },
        ],
        tx,
      }),
    );

    expect(invoice.dueDate).toBeDefined();
    expect(invoice.paymentTerms).toBe(30);
    // June 1 + 30 days = July 1
    expect(invoice.dueDate!.toISOString().slice(0, 10)).toBe("2026-07-01");
  });

  it("uses explicit dueDate when both dueDate and paymentTerms provided", async () => {
    const invoice = await prisma.$transaction(async (tx) =>
      createInvoice({
        direction: "SALES",
        date: new Date("2026-06-01"),
        partyId: ctx.customerId,
        createdById: ctx.userId,
        dueDate: new Date("2026-07-15"),
        paymentTerms: 30,
        lines: [
          { description: "test", qty: "1", unit: "KG", rateFils: 100000n, vatRate: 0.05 },
        ],
        tx,
      }),
    );

    expect(invoice.dueDate).toBeDefined();
    expect(invoice.paymentTerms).toBe(30);
    // Explicit dueDate should be used, not calculated
    expect(invoice.dueDate!.toISOString().slice(0, 10)).toBe("2026-07-15");
  });

  it("stores dueDate as null when neither dueDate nor paymentTerms provided", async () => {
    const invoice = await prisma.$transaction(async (tx) =>
      createInvoice({
        direction: "SALES",
        date: new Date("2026-06-01"),
        partyId: ctx.customerId,
        createdById: ctx.userId,
        lines: [
          { description: "test", qty: "1", unit: "KG", rateFils: 100000n, vatRate: 0.05 },
        ],
        tx,
      }),
    );

    expect(invoice.dueDate).toBeNull();
    expect(invoice.paymentTerms).toBeNull();
  });

  it("works with purchase invoices too", async () => {
    const invoice = await prisma.$transaction(async (tx) =>
      createInvoice({
        direction: "PURCHASE",
        date: new Date("2026-06-01"),
        partyId: ctx.vendorId,
        createdById: ctx.userId,
        paymentTerms: 60,
        lines: [
          { description: "test", qty: "1", unit: "KG", rateFils: 100000n, vatRate: 0.05 },
        ],
        tx,
      }),
    );

    expect(invoice.dueDate).toBeDefined();
    expect(invoice.paymentTerms).toBe(60);
    // June 1 + 60 days = July 31
    expect(invoice.dueDate!.toISOString().slice(0, 10)).toBe("2026-07-31");
  });

  it("paymentTerms of 0 is stored as null and doesn't calculate dueDate", async () => {
    // The Prisma schema has paymentTerms as Int?, so 0 becomes null in DB
    // The createInvoice function only calculates dueDate when paymentTerms > 0
    const invoice = await prisma.$transaction(async (tx) =>
      createInvoice({
        direction: "SALES",
        date: new Date("2026-06-01"),
        partyId: ctx.customerId,
        createdById: ctx.userId,
        paymentTerms: 0,
        lines: [
          { description: "test", qty: "1", unit: "KG", rateFils: 100000n, vatRate: 0.05 },
        ],
        tx,
      }),
    );

    // paymentTerms of 0 is stored as null in DB
    expect(invoice.paymentTerms).toBeNull();
    expect(invoice.dueDate).toBeNull();
  });
});