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

describe("duplicate vendor invoice guard (P1.7)", () => {
  it("rejects duplicate purchase invoices for the same vendor", async () => {
    const invoiceData = {
      direction: "PURCHASE" as const,
      date: new Date("2026-06-01"),
      partyId: ctx.vendorId,
      createdById: ctx.userId,
      lines: [{ description: "test", qty: "1", unit: "KG" as const, rateFils: 100000n, vatRate: 0.05 }],
      supplierRef: "INV-001",
    };

    await prisma.$transaction(async (tx) => createInvoice({ ...invoiceData, tx }));
    
    // Attempt duplicate - should fail
    await expect(prisma.$transaction(async (tx) => createInvoice({ ...invoiceData, tx }))).rejects.toThrow();
  });

  it("allows same invoice number for different vendors", async () => {
    const invoice1 = {
      direction: "PURCHASE" as const,
      date: new Date("2026-06-01"),
      partyId: ctx.vendorId,
      createdById: ctx.userId,
      lines: [{ description: "test", qty: "1", unit: "KG" as const, rateFils: 100000n, vatRate: 0.05 }],
      supplierRef: "INV-001",
    };
    
    // Create a second vendor for the second invoice
    const vendor2 = await prisma.party.create({
      data: { code: "VEND-002", type: "VENDOR", nameEn: "Test Vendor 2", nameAr: "مورد اختبار 2", trn: "200000000000004" },
    });
    
    const invoice2 = { ...invoice1, partyId: vendor2.id };

    await prisma.$transaction(async (tx) => createInvoice({ ...invoice1, tx }));
    await expect(prisma.$transaction(async (tx) => createInvoice({ ...invoice2, tx }))).resolves.toBeDefined();
  });

  it("allows duplicate invoice numbers for SALES invoices", async () => {
    const invoiceData = {
      direction: "SALES" as const,
      date: new Date("2026-06-01"),
      partyId: ctx.customerId,
      createdById: ctx.userId,
      lines: [{ description: "test", qty: "1", unit: "KG" as const, rateFils: 100000n, vatRate: 0.05 }],
      supplierRef: "INV-001",
    };

    await prisma.$transaction(async (tx) => createInvoice({ ...invoiceData, tx }));
    await expect(prisma.$transaction(async (tx) => createInvoice({ ...invoiceData, tx }))).resolves.toBeDefined();
  });
});