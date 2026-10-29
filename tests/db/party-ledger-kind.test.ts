import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { partyLedger } from "@/lib/reports";
import { partyLedgerHref, partyLedgerKind } from "@/lib/party-ledger-kind";
import { truncateAll } from "./helpers";
import { seedTestData, type TestContext } from "./seed";

let ctx: TestContext;

beforeEach(async () => {
  await truncateAll(prisma);
  ctx = await seedTestData(prisma);
});

async function createPostedEntry(sourceType: string, narration: string, lines: { accountCode: string; debit?: bigint; credit?: bigint; partyId?: string }[]) {
  return await prisma.$transaction(async (tx) => {
    const entry = await tx.journalEntry.create({
      data: {
        entryNo: `JE-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        date: new Date("2026-06-01"),
        status: "POSTED",
        sourceType: sourceType as any,
        narration: narration,
        createdById: ctx.userId,
        lines: {
          create: lines.map(l => ({
            accountId: ctx.accountByCode.get(l.accountCode)!,
            debit: l.debit ?? 0n,
            credit: l.credit ?? 0n,
            ...(l.partyId ? { partyId: l.partyId } : {}),
          })),
        },
      },
    });
    return entry;
  });
}

describe("partyLedger F13 behavior fix", () => {
  it("MANUAL journal -> JOURNAL -> /journals/", async () => {
    const entry = await createPostedEntry("MANUAL", "Manual", [{ accountCode: "1130", debit: 1000n, partyId: ctx.customerId }, { accountCode: "4100", credit: 1000n }]);
    const fy = (await prisma.fiscalYear.findFirst({ where: { status: "OPEN" } }))!;
    const rows = await partyLedger(ctx.customerId, fy);
    const row = rows.find(r => r.docId === entry.id);
    expect(row).toBeDefined();
    expect(partyLedgerKind(entry.sourceType, false, false)).toBe("JOURNAL");
    expect(partyLedgerHref("JOURNAL", row!.docId)).toBe(`/journals/${row!.docId}`);
  });

  it("OPENING_BALANCE -> OPENING -> /journals/", async () => {
    const entry = await createPostedEntry("OPENING_BALANCE", "Opening", [{ accountCode: "1130", debit: 1000n, partyId: ctx.customerId }, { accountCode: "1110", credit: 1000n }]);
    const fy = (await prisma.fiscalYear.findFirst({ where: { status: "OPEN" } }))!;
    const rows = await partyLedger(ctx.customerId, fy);
    const row = rows.find(r => r.docId === entry.id);
    expect(row).toBeDefined();
    expect(partyLedgerKind(entry.sourceType, false, false)).toBe("OPENING");
    expect(partyLedgerHref("OPENING", row!.docId)).toBe(`/journals/${row!.docId}`);
  });

  it("YEAR_END_CLOSE -> YEAR_END -> /journals/", async () => {
    const entry = await createPostedEntry("YEAR_END_CLOSE", "Year End", [{ accountCode: "1130", debit: 1000n, partyId: ctx.customerId }, { accountCode: "1110", credit: 1000n }]);
    const fy = (await prisma.fiscalYear.findFirst({ where: { status: "OPEN" } }))!;
    const rows = await partyLedger(ctx.customerId, fy);
    const row = rows.find(r => r.docId === entry.id);
    expect(row).toBeDefined();
    expect(partyLedgerKind(entry.sourceType, false, false)).toBe("YEAR_END");
    expect(partyLedgerHref("YEAR_END", row!.docId)).toBe(`/journals/${row!.docId}`);
  });

  it("PURCHASE_INVOICE -> PURCHASE_INVOICE -> /purchase-invoices/", async () => {
    // Helper to simulate linkage
    expect(partyLedgerKind("PURCHASE_INVOICE", true, false)).toBe("PURCHASE_INVOICE");
    expect(partyLedgerHref("PURCHASE_INVOICE", "pur-123")).toBe("/purchase-invoices/pur-123");
  });
});