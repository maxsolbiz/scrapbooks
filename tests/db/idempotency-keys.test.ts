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

describe("idempotency keys (P1.8)", () => {
  it("submitting the same idempotencyKey twice creates only ONE invoice", async () => {
    const baseData = {
      direction: "SALES" as const,
      date: new Date("2026-06-01"),
      partyId: ctx.customerId,
      createdById: ctx.userId,
      lines: [{ description: "test", qty: "1", unit: "KG" as const, rateFils: 100000n, vatRate: 0.05 }],
      idempotencyKey: "test-idempotency-key-123",
    };

    // First call - creates the invoice
    const first = await prisma.$transaction(async (tx) => 
      createInvoice({ 
        direction: "SALES" as const, 
        date: new Date("2026-06-01"), 
        partyId: ctx.customerId, 
        createdById: ctx.userId, 
        lines: [{ description: "test", qty: "1", unit: "KG" as const, rateFils: 100000n, vatRate: 0.05 }],
        idempotencyKey: "test-idempotency-key-123",
        tx
      })
    );

    // Wait 100ms to ensure first transaction fully commits
    await new Promise(resolve => setTimeout(resolve, 100));

    // Second call with same key - should return existing invoice
    const second = await prisma.$transaction(async (tx) => 
      createInvoice({ 
        direction: "SALES" as const, 
        date: new Date("2026-06-01"), 
        partyId: ctx.customerId, 
        createdById: ctx.userId, 
        lines: [{ description: "test", qty: "1", unit: "KG" as const, rateFils: 100000n, vatRate: 0.05 }],
        idempotencyKey: "test-idempotency-key-123",
        tx
      })
    );

    // Both should succeed and return the SAME invoice
    expect(first.id).toBeDefined();
    expect(second.id).toBe(first.id);
    expect(second.invoiceNo).toBe(first.invoiceNo);

    // Only ONE invoice should exist in DB with that key
    const count = await prisma.invoice.count({ where: { idempotencyKey: "test-idempotency-key-123" } });
    expect(count).toBe(1);
  });

  it("different idempotency keys create different invoices", async () => {
    const invoiceData = {
      direction: "SALES" as const,
      date: new Date("2026-06-01"),
      partyId: ctx.customerId,
      createdById: ctx.userId,
      lines: [{ description: "test", qty: "1", unit: "KG" as const, rateFils: 100000n, vatRate: 0.05 }],
    };

    const first = await prisma.$transaction(async (tx) => 
      createInvoice({ 
        direction: "SALES" as const, 
        date: new Date("2026-06-01"), 
        partyId: ctx.customerId, 
        createdById: ctx.userId, 
        lines: [{ description: "test", qty: "1", unit: "KG" as const, rateFils: 100000n, vatRate: 0.05 }],
        idempotencyKey: "key-1",
        tx
      })
    );

    const second = await prisma.$transaction(async (tx) => createInvoice({ 
      direction: "SALES" as const, 
      date: new Date("2026-06-01"), 
      partyId: ctx.customerId, 
      createdById: ctx.userId, 
      lines: [{ description: "test", qty: "1", unit: "KG" as const, rateFils: 100000n, vatRate: 0.05 }],
      idempotencyKey: "different-key",
      tx
    }));

    expect(first.id).not.toBe(second.id);
    expect(first.invoiceNo).not.toBe(second.invoiceNo);

    const count = await prisma.invoice.count({ where: { idempotencyKey: { not: null } } });
    expect(count).toBe(2);
  });
});