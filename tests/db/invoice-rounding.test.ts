import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { createInvoice } from "@/lib/invoices";
import { trialBalance } from "@/lib/reports";
import type { Tx } from "@/lib/tx";
import { truncateAll } from "./helpers";
import { seedTestData, type TestContext } from "./seed";

let ctx: TestContext;

beforeEach(async () => {
  await truncateAll(prisma); // shared worker state — every DB test file starts here
  ctx = await seedTestData(prisma);
});

describe("createInvoice VAT rounding (P1.4, D4: per-line half-up)", () => {
  it("half-up VAT: line VAT 0.5 fils rounds up to 1; invoice + journal balance", async () => {
    const invoice = await prisma.$transaction(async (tx) =>
      createInvoice({
        tx,
        direction: "SALES",
        date: new Date("2026-06-15"),
        partyId: ctx.customerId,
        createdById: ctx.userId,
        lines: [{ description: "half-up test", qty: "1", unit: "KG", rateFils: 10n, vatRate: 0.05 }],
      }),
    );
    expect(invoice.subtotalFils).toBe(10n);
    expect(invoice.vatFils).toBe(1n); // half-up: 0.5 -> 1 (truncation would give 0)
    expect(invoice.totalFils).toBe(11n);

    const line = await prisma.invoiceLine.findFirstOrThrow({ where: { invoiceId: invoice.id } });
    expect(line.lineValueFils).toBe(10n);
    expect(line.lineVatFils).toBe(1n);
    expect(line.lineTotalFils).toBe(11n);

    const tb = await trialBalance(new Date("2026-12-31"));
    expect(tb.reduce((a, r) => a + r.debitTotal, 0n)).toBe(tb.reduce((a, r) => a + r.creditTotal, 0n));
  });

  it("below-half VAT rounds down", async () => {
    const invoice = await prisma.$transaction(async (tx) =>
      createInvoice({
        tx,
        direction: "SALES",
        date: new Date("2026-06-15"),
        partyId: ctx.customerId,
        createdById: ctx.userId,
        lines: [{ description: "x", qty: "1", unit: "KG", rateFils: 8n, vatRate: 0.05 }],
      }),
    );
    expect(invoice.vatFils).toBe(0n); // 0.4 -> 0
    expect(invoice.totalFils).toBe(8n);
  });

  it("existing invoice keeps stored values (no recalculation on read)", async () => {
    const invoice = await prisma.$transaction(async (tx) =>
      createInvoice({
        tx,
        direction: "SALES",
        date: new Date("2026-06-15"),
        partyId: ctx.customerId,
        createdById: ctx.userId,
        lines: [{ description: "x", qty: "1", unit: "KG", rateFils: 10n, vatRate: 0.05 }],
      }),
    );
    const again = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(again.vatFils).toBe(invoice.vatFils);
    expect(again.totalFils).toBe(invoice.totalFils);
  });
});
