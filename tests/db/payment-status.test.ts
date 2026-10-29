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
});
