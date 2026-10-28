import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { postJournalEntry, assertBalanced, voidJournalEntry } from "@/lib/accounting";
import type { Tx } from "@/lib/tx";
import { truncateAll, withTxRollback } from "./helpers";
import { seedTestData, type TestContext } from "./seed";

// Per reviewer: functions taking a tx are tested via Mode A (rollback-sentinel);
// this file only exercises src/lib/accounting.ts (tx-based) + one global-prisma
// assertion for legacy void behavior. Reports (global prisma) will use Mode B in P1.5.

let ctx: TestContext;

beforeEach(async () => {
  await truncateAll(prisma); // re-runs the guard + current_database ground truth first
  ctx = await seedTestData(prisma);
});

function postViaTx<T>(fn: (tx: Tx) => Promise<T>) {
  return withTxRollback(prisma, fn);
}

describe("postJournalEntry", () => {
  it("happy path: posts a balanced entry (Mode A, rolled back)", async () => {
    const ar = ctx.accountByCode.get("1130")!;
    const income = ctx.accountByCode.get("4100")!;
    const ids: string[] = await postViaTx(async (tx) => {
      const entry = await postJournalEntry({
        tx,
        date: new Date("2026-06-01"),
        narration: "test entry",
        sourceType: "MANUAL",
        createdById: ctx.userId,
        lines: [
          { accountId: ar, debit: 1000n },
          { accountId: income, credit: 1000n },
        ],
      });
      // assert INSIDE the transaction (data vanishes at rollback)
      const persisted = await tx.journalEntry.findUniqueOrThrow({
        where: { id: entry.id },
        include: { lines: true },
      });
      expect(persisted.status).toBe("POSTED");
      expect(persisted.entryNo.startsWith("JV-")).toBe(true);
      expect(persisted.lines).toHaveLength(2);
      return [entry.id];
    });
    expect(ids).toHaveLength(1); // returned from inside, then rolled back
  });

  it("negative: unbalanced entry throws", async () => {
    const ar = ctx.accountByCode.get("1130")!;
    const income = ctx.accountByCode.get("4100")!;
    await expect(
      postViaTx(async (tx) =>
        postJournalEntry({
          tx,
          date: new Date("2026-06-01"),
          sourceType: "MANUAL",
          createdById: ctx.userId,
          lines: [
            { accountId: ar, debit: 1000n },
            { accountId: income, credit: 999n },
          ],
        }),
      ),
    ).rejects.toThrow(/not balanced/);
  });

  it("negative: closed fiscal year throws", async () => {
    await prisma.fiscalYear.updateMany({ where: { name: ctx.fiscalYearName }, data: { status: "CLOSED" } });
    const ar = ctx.accountByCode.get("1130")!;
    const income = ctx.accountByCode.get("4100")!;
    await expect(
      postViaTx(async (tx) =>
        postJournalEntry({
          tx,
          date: new Date("2026-06-01"),
          sourceType: "MANUAL",
          createdById: ctx.userId,
          lines: [
            { accountId: ar, debit: 1000n },
            { accountId: income, credit: 1000n },
          ],
        }),
      ),
    ).rejects.toThrow(/is closed/);
  });

  it("negative: inactive account throws", async () => {
    const ar = ctx.accountByCode.get("1130")!;
    const income = ctx.accountByCode.get("4100")!;
    await prisma.account.update({ where: { id: income }, data: { isActive: false } });
    await expect(
      postViaTx(async (tx) =>
        postJournalEntry({
          tx,
          date: new Date("2026-06-01"),
          sourceType: "MANUAL",
          createdById: ctx.userId,
          lines: [
            { accountId: ar, debit: 1000n },
            { accountId: income, credit: 1000n },
          ],
        }),
      ),
    ).rejects.toThrow(/missing or inactive/);
  });
});

describe("assertBalanced (pure)", () => {
  it("negative: single line rejected", () => {
    expect(() => assertBalanced([{ accountId: "x", debit: 1n }])).toThrow(/at least two lines/);
  });
});

// P1.1: voidJournalEntry is DRAFT-only. POSTED/VOID targets are rejected with a clear
// message; reversal-based voids (voidInvoiceWithReversal / voidPaymentWithReversal) are
// the only supported void paths for POSTED entries.
describe("voidJournalEntry (P1.1: DRAFT-only)", () => {
  it("DRAFT entry: voids to VOID without a reversal entry", async () => {
    const ar = ctx.accountByCode.get("1130")!;
    const income = ctx.accountByCode.get("4100")!;
    const entry = await prisma.journalEntry.create({
      data: {
        entryNo: "MAN-2026-0001",
        date: new Date("2026-06-01"),
        narration: "Manual draft entry",
        status: "DRAFT",
        sourceType: "MANUAL",
        createdById: ctx.userId,
        lines: {
          create: [
            { accountId: ar, debit: 500n },
            { accountId: income, credit: 500n },
          ],
        },
      },
    });
    const after = await voidJournalEntry(entry.id);
    expect(after.status).toBe("VOID");
    expect(await prisma.journalEntry.count()).toBe(1); // no reversal entry created
  });

  it("POSTED entry: rejects with a clear message", async () => {
    const ar = ctx.accountByCode.get("1130")!;
    const income = ctx.accountByCode.get("4100")!;
    const entry = await prisma.$transaction(async (tx) =>
      postJournalEntry({
        tx,
        date: new Date("2026-06-01"),
        sourceType: "MANUAL",
        createdById: ctx.userId,
        lines: [
          { accountId: ar, debit: 500n },
          { accountId: income, credit: 500n },
        ],
      }),
    ); // committed: Mode B
    await expect(voidJournalEntry(entry.id)).rejects.toThrow(/is posted/);
    const after = await prisma.journalEntry.findUniqueOrThrow({ where: { id: entry.id } });
    expect(after.status).toBe("POSTED");
    expect(await prisma.journalEntry.count()).toBe(1); // untouched
  });

  it("VOID entry: rejects with a clear message", async () => {
    const ar = ctx.accountByCode.get("1130")!;
    const income = ctx.accountByCode.get("4100")!;
    const entry = await prisma.journalEntry.create({
      data: {
        entryNo: "MAN-2026-0002",
        date: new Date("2026-06-01"),
        narration: "Manual draft entry",
        status: "DRAFT",
        sourceType: "MANUAL",
        createdById: ctx.userId,
        lines: {
          create: [
            { accountId: ar, debit: 500n },
            { accountId: income, credit: 500n },
          ],
        },
      },
    });
    await voidJournalEntry(entry.id);
    await expect(voidJournalEntry(entry.id)).rejects.toThrow(/is void/);
    const after = await prisma.journalEntry.findUniqueOrThrow({ where: { id: entry.id } });
    expect(after.status).toBe("VOID");
    expect(await prisma.journalEntry.count()).toBe(1); // untouched by the second call
  });
});

