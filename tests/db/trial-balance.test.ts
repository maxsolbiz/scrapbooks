import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { trialBalance } from "@/lib/reports";
import { truncateAll } from "./helpers";
import { seedTestData, type TestContext } from "./seed";

let ctx: TestContext;

beforeEach(async () => {
  await truncateAll(prisma);
  ctx = await seedTestData(prisma);
});

function trialBalanceLegacy(asOf: Date): Promise<{ id: string; code: string; nameEn: string; nameAr: string; type: string; debitTotal: bigint; creditTotal: bigint }[]> {
  return prisma.$transaction(async (tx) => {
    const accounts = await tx.account.findMany({ orderBy: { code: "asc" } });
    const lines = await tx.journalLine.findMany({
      where: { entry: { status: "POSTED", date: { lte: asOf } } },
      select: { accountId: true, debit: true, credit: true },
    });
    const map = new Map<string, { debit: bigint; credit: bigint }>();
    for (const l of lines) {
      const row = map.get(l.accountId) ?? { debit: 0n, credit: 0n };
      row.debit += l.debit ?? 0n;
      row.credit += l.credit ?? 0n;
      map.set(l.accountId, row);
    }
    return accounts
      .map((acc) => {
        const agg = map.get(acc.id) ?? { debit: 0n, credit: 0n };
        return {
          id: acc.id,
          code: acc.code,
          nameEn: acc.nameEn,
          nameAr: acc.nameAr,
          type: acc.type,
          debitTotal: agg.debit,
          creditTotal: agg.credit,
        };
      })
      .filter((r) => r.debitTotal !== 0n || r.creditTotal !== 0n);
  });
}

async function createJournalEntry(tx: any, data: {
  date: Date;
  sourceType: "MANUAL" | "REVERSAL";
  narration: string;
  lines: { accountCode: string; debit?: bigint; credit?: bigint }[];
}) {
  const lineData = data.lines.map((l) => ({
    accountId: ctx.accountByCode.get(l.accountCode)!,
    debit: l.debit ?? 0n,
    credit: l.credit ?? 0n,
  }));
  return tx.journalEntry.create({
    data: {
      entryNo: "MAN-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8),
      date: data.date,
      status: "POSTED",
      sourceType: data.sourceType,
      narration: data.narration,
      createdById: ctx.userId,
      lines: { create: lineData },
    },
  });
}

describe("trialBalance parity with legacy JS loop (groupBy refactor)", () => {
  it("matches legacy on seeded data with posted entries", async () => {
    await prisma.$transaction(async (tx) => {
      await createJournalEntry(tx, {
        date: new Date("2026-06-15"),
        sourceType: "MANUAL",
        narration: "Test entry 1",
        lines: [{ accountCode: "1110", debit: 100000n }, { accountCode: "4100", credit: 100000n }],
      });
      await createJournalEntry(tx, {
        date: new Date("2026-06-15"),
        sourceType: "MANUAL",
        narration: "Test entry 2",
        lines: [{ accountCode: "1120", debit: 50000n }, { accountCode: "5100", credit: 50000n }],
      });
    });

    const asOf = new Date("2026-12-31");
    const [newImpl, legacy] = await Promise.all([trialBalance(asOf), trialBalanceLegacy(asOf)]);
    expect(newImpl).toEqual(legacy);
  });

  it("matches legacy on multiple asOf dates", async () => {
    await prisma.$transaction(async (tx) => {
      await createJournalEntry(tx, {
        date: new Date("2026-06-15"),
        sourceType: "MANUAL",
        narration: "Entry before asOf",
        lines: [{ accountCode: "1110", debit: 100000n }, { accountCode: "4100", credit: 100000n }],
      });
      await createJournalEntry(tx, {
        date: new Date("2026-07-01"),
        sourceType: "MANUAL",
        narration: "Entry on asOf",
        lines: [{ accountCode: "1120", debit: 50000n }, { accountCode: "5100", credit: 50000n }],
      });
    });

    const dates = [new Date("2026-06-15"), new Date("2026-07-01"), new Date("2026-12-31")];
    for (const d of dates) {
      const [newImpl, legacy] = await Promise.all([trialBalance(d), trialBalanceLegacy(d)]);
      expect(newImpl).toEqual(legacy);
    }
  });

  it("total debits equal total credits for each asOf", async () => {
    await prisma.$transaction(async (tx) => {
      await createJournalEntry(tx, {
        date: new Date("2026-06-15"),
        sourceType: "MANUAL",
        narration: "Balanced entry",
        lines: [{ accountCode: "1110", debit: 100000n }, { accountCode: "4100", credit: 100000n }],
      });
    });

    const dates = [new Date("2026-06-15"), new Date("2026-12-31")];
    for (const d of dates) {
      const tb = await trialBalance(d);
      const debitSum = tb.reduce((a, r) => a + r.debitTotal, 0n);
      const creditSum = tb.reduce((a, r) => a + r.creditTotal, 0n);
      expect(debitSum).toBe(creditSum);
    }
  });

  it("reversal pair nets an account to zero", async () => {
    await prisma.$transaction(async (tx) => {
      await createJournalEntry(tx, {
        date: new Date("2026-06-15"),
        sourceType: "MANUAL",
        narration: "Original",
        lines: [{ accountCode: "1110", debit: 100000n }, { accountCode: "4100", credit: 100000n }],
      });
      await createJournalEntry(tx, {
        date: new Date("2026-06-16"),
        sourceType: "REVERSAL",
        narration: "Reversal of original",
        lines: [{ accountCode: "1110", credit: 100000n }, { accountCode: "4100", debit: 100000n }],
      });
    });

    const asOf = new Date("2026-12-31");
    const tb = await trialBalance(asOf);
    const ar = tb.find((r) => r.code === "1110");
    expect(ar?.debitTotal ?? 0n).toBe(ar?.creditTotal ?? 0n);
    const rev = tb.find((r) => r.code === "4100");
    expect(rev?.debitTotal ?? 0n).toBe(rev?.creditTotal ?? 0n);
  });

  it("DRAFT entries do not contribute", async () => {
    await prisma.$transaction(async (tx) => {
      await createJournalEntry(tx, {
        date: new Date("2026-06-15"),
        sourceType: "MANUAL",
        narration: "Posted entry",
        lines: [{ accountCode: "1110", debit: 100000n }, { accountCode: "4100", credit: 100000n }],
      });
      await tx.journalEntry.create({
        data: {
          entryNo: "DRAFT-001",
          date: new Date("2026-06-15"),
          status: "DRAFT",
          sourceType: "MANUAL",
          narration: "Draft entry",
          createdById: ctx.userId,
          lines: { create: [{ accountId: ctx.accountByCode.get("1110")!, debit: 50000n }, { accountId: ctx.accountByCode.get("4100")!, credit: 50000n }] },
        },
      });
    });

    const asOf = new Date("2026-12-31");
    const tb = await trialBalance(asOf);
    const ar = tb.find((r) => r.code === "1110");
    expect(ar?.debitTotal ?? 0n).toBe(100000n);
    expect(ar?.creditTotal ?? 0n).toBe(0n);
  });

  it("VOID entries do not contribute", async () => {
    await prisma.$transaction(async (tx) => {
      await createJournalEntry(tx, {
        date: new Date("2026-06-15"),
        sourceType: "MANUAL",
        narration: "Posted entry",
        lines: [{ accountCode: "1110", debit: 100000n }, { accountCode: "4100", credit: 100000n }],
      });
      await tx.journalEntry.create({
        data: {
          entryNo: "VOID-001",
          date: new Date("2026-06-15"),
          status: "VOID",
          sourceType: "MANUAL",
          narration: "Void entry",
          createdById: ctx.userId,
          lines: { create: [{ accountId: ctx.accountByCode.get("1110")!, debit: 50000n }, { accountId: ctx.accountByCode.get("4100")!, credit: 50000n }] },
        },
      });
    });

    const asOf = new Date("2026-12-31");
    const tb = await trialBalance(asOf);
    const ar = tb.find((r) => r.code === "1110");
    expect(ar?.debitTotal ?? 0n).toBe(100000n);
    expect(ar?.creditTotal ?? 0n).toBe(0n);
  });

  it("entries dated after asOf do not contribute", async () => {
    await prisma.$transaction(async (tx) => {
      await createJournalEntry(tx, {
        date: new Date("2026-06-15"),
        sourceType: "MANUAL",
        narration: "Before asOf",
        lines: [{ accountCode: "1110", debit: 100000n }, { accountCode: "4100", credit: 100000n }],
      });
      await createJournalEntry(tx, {
        date: new Date("2027-01-15"),
        sourceType: "MANUAL",
        narration: "After asOf",
        lines: [{ accountCode: "1120", debit: 50000n }, { accountCode: "5100", credit: 50000n }],
      });
    });

    const asOf = new Date("2026-12-31");
    const tb = await trialBalance(asOf);
    const ar = tb.find((r) => r.code === "1110");
    expect(ar?.debitTotal ?? 0n).toBe(100000n);
    expect(ar?.creditTotal ?? 0n).toBe(0n);
    const future = tb.find((r) => r.code === "1120");
    expect(future?.debitTotal ?? 0n).toBe(0n);
    expect(future?.creditTotal ?? 0n).toBe(0n);
  });

  it("entries exactly ON asOf contribute", async () => {
    await prisma.$transaction(async (tx) => {
      await createJournalEntry(tx, {
        date: new Date("2026-06-15T23:59:59.999Z"),
        sourceType: "MANUAL",
        narration: "On asOf",
        lines: [{ accountCode: "1110", debit: 100000n }, { accountCode: "4100", credit: 100000n }],
      });
    });

    const asOf = new Date("2026-06-15T23:59:59.999Z");
    const tb = await trialBalance(asOf);
    const ar = tb.find((r) => r.code === "1110");
    expect(ar?.debitTotal ?? 0n).toBe(100000n);
  });

  it("accounts with equal non-zero debit and credit totals are still listed (legacy behavior)", async () => {
    await prisma.$transaction(async (tx) => {
      await createJournalEntry(tx, {
        date: new Date("2026-06-15"),
        sourceType: "MANUAL",
        narration: "Balanced entry",
        lines: [{ accountCode: "1120", debit: 50000n }, { accountCode: "5100", credit: 50000n }],
      });
      await createJournalEntry(tx, {
        date: new Date("2026-06-16"),
        sourceType: "MANUAL",
        narration: "Reversing entry",
        lines: [{ accountCode: "1120", credit: 50000n }, { accountCode: "5100", debit: 50000n }],
      });
    });

    const asOf = new Date("2026-12-31");
    const tb = await trialBalance(asOf);
    const bank = tb.find((r) => r.code === "1120");
    const cogs = tb.find((r) => r.code === "5100");
    // Legacy behavior: accounts with only balanced entries still appear with equal debit/credit
    expect(bank?.debitTotal ?? 0n).toBe(50000n);
    expect(bank?.creditTotal ?? 0n).toBe(50000n);
    expect(cogs?.debitTotal ?? 0n).toBe(50000n);
    expect(cogs?.creditTotal ?? 0n).toBe(50000n);
  });

  it("all-zero lines are excluded", async () => {
    await prisma.$transaction(async (tx) => {
      await createJournalEntry(tx, {
        date: new Date("2026-06-15"),
        sourceType: "MANUAL",
        narration: "Entry with zero line",
        lines: [
          { accountCode: "1110", debit: 100000n },
          { accountCode: "4100", credit: 100000n },
          { accountCode: "1130", debit: 0n, credit: 0n }, // zero line
        ],
      });
    });

    const asOf = new Date("2026-12-31");
    const [newImpl, legacy] = await Promise.all([trialBalance(asOf), trialBalanceLegacy(asOf)]);
    expect(newImpl).toEqual(legacy);
    const ar = newImpl.find((r) => r.code === "1130");
    expect(ar).toBeUndefined();
  });

  it("rich parity: reversal pair + DRAFT + VOID + after-asOf + on-asOf + zero-line in one dataset", async () => {
    await prisma.$transaction(async (tx) => {
      // POSTED entry (06-15)
      await createJournalEntry(tx, {
        date: new Date("2026-06-15"),
        sourceType: "MANUAL",
        narration: "Posted entry",
        lines: [{ accountCode: "1110", debit: 100000n }, { accountCode: "4100", credit: 100000n }],
      });
      // REVERSAL pair (06-16)
      await createJournalEntry(tx, {
        date: new Date("2026-06-16"),
        sourceType: "REVERSAL",
        narration: "Reversal of posted",
        lines: [{ accountCode: "1110", credit: 100000n }, { accountCode: "4100", debit: 100000n }],
      });
      // DRAFT entry
      await tx.journalEntry.create({
        data: {
          entryNo: "DRAFT-RICH-001",
          date: new Date("2026-06-15"),
          status: "DRAFT",
          sourceType: "MANUAL",
          narration: "Draft entry",
          createdById: ctx.userId,
          lines: { create: [{ accountId: ctx.accountByCode.get("1120")!, debit: 50000n }, { accountId: ctx.accountByCode.get("5100")!, credit: 50000n }] },
        },
      });
      // VOID entry
      await tx.journalEntry.create({
        data: {
          entryNo: "VOID-RICH-001",
          date: new Date("2026-06-15"),
          status: "VOID",
          sourceType: "MANUAL",
          narration: "Void entry",
          createdById: ctx.userId,
          lines: { create: [{ accountId: ctx.accountByCode.get("1120")!, debit: 25000n }, { accountId: ctx.accountByCode.get("5100")!, credit: 25000n }] },
        },
      });
      // POSTED entry after asOf
      await createJournalEntry(tx, {
        date: new Date("2027-01-15"),
        sourceType: "MANUAL",
        narration: "After asOf",
        lines: [{ accountCode: "1120", debit: 50000n }, { accountCode: "5100", credit: 50000n }],
      });
      // POSTED entry exactly on asOf (06-15T23:59:59.999Z)
      await createJournalEntry(tx, {
        date: new Date("2026-06-15T23:59:59.999Z"),
        sourceType: "MANUAL",
        narration: "On asOf",
        lines: [{ accountCode: "1130", debit: 100000n }, { accountCode: "4200", credit: 100000n }],
      });
      // Entry with zero line
      await createJournalEntry(tx, {
        date: new Date("2026-06-15"),
        sourceType: "MANUAL",
        narration: "Zero line entry",
        lines: [
          { accountCode: "1150", debit: 75000n },
          { accountCode: "5200", credit: 75000n },
          { accountCode: "1510", debit: 0n, credit: 0n }, // zero line
        ],
      });
    });

    // Test asOf = 2026-06-15T23:59:59.999Z
    const asOf1 = new Date("2026-06-15T23:59:59.999Z");
    const legacy1 = await trialBalanceLegacy(asOf1);
    const newImpl1 = await trialBalance(asOf1);
    expect(newImpl1).toEqual(legacy1);

    // Test asOf = 2026-12-31
    const asOf2 = new Date("2026-12-31");
    const legacy2 = await trialBalanceLegacy(asOf2);
    const newImpl2 = await trialBalance(asOf2);
    expect(newImpl2).toEqual(legacy2);
  });
});