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

async function createInvoiceWithQty(qty: string) {
  return await prisma.$transaction(async (tx) =>
    createInvoice({
      tx,
      direction: "SALES",
      date: new Date("2026-06-15"),
      partyId: ctx.customerId,
      createdById: ctx.userId,
      lines: [{ description: "qty guard", qty: qty, unit: "KG", rateFils: 100000n, vatRate: 0.05 }],
    }),
  );
}

async function counts() {
  return {
    invoices: await prisma.invoice.count(),
    lines: await prisma.invoiceLine.count(),
    entries: await prisma.journalEntry.count(),
  };
}

describe("createInvoice qty guard (F12)", () => {
  it.each(["1.0005", "1.0004", "1.0006", "1.2345"])("rejects qty %s", async (qty: string) => {
    const before = await counts();
    await expect(createInvoiceWithQty(qty)).rejects.toThrow("Quantity allows at most 3 decimal places");
    expect(await counts()).toEqual(before);
  });

  it.each(["abc", "-1", "", "1e3", ".5", "1."])("rejects invalid qty %s", async (qty: string) => {
    const before = await counts();
    await expect(createInvoiceWithQty(qty)).rejects.toThrow(/Invalid quantity/);
    expect(await counts()).toEqual(before);
  });

  it.each([
    ["1.000", "1", 100000n],
    ["1.001", "1.001", 100100n],
    ["99.999", "99.999", 9999900n],
  ])("accepts qty %s -> outstanding %s", async (qty: string, storedQty: string, lineValue: bigint) => {
    const invoice = await createInvoiceWithQty(qty);
    const line = await prisma.invoiceLine.findFirstOrThrow({ where: { invoiceId: invoice.id } });
    expect(line.qty.toString()).toBe(storedQty);
    expect(line.lineValueFils).toBe(lineValue);
    const recomputed = (line.rateFils * BigInt(Math.round(Number(line.qty) * 1000))) / 1000n;
    expect(recomputed).toBe(line.lineValueFils);
  });
});
