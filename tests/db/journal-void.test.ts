import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { voidManualJournal } from "@/lib/accounting";
import { trialBalance } from "@/lib/reports";
import type { JournalStatus } from "@/generated/prisma/enums";
import type { EntrySource } from "@/generated/prisma/enums";
import type { Tx } from "@/lib/tx";
import { truncateAll } from "./helpers";
import { seedTestData, type TestContext } from "./seed";

let ctx: TestContext;

beforeEach(async () => {
  await truncateAll(prisma); // shared worker state — every DB test file starts here
  ctx = await seedTestData(prisma);
});

/** Polls pg_stat_activity until some OTHER connection blocks on a JournalEntry row lock query.
 * Returns the blocked query text, or "" if nothing blocked within the deadline. */
function firstBlockedEntryLock(deadlineMs: number): Promise<string> {
  return (async () => {
    const deadline = Date.now() + deadlineMs;
    for (;;) {
      const rows = (await prisma.$queryRawUnsafe<{ query: string }[]>(
        `SELECT query FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND pid <> pg_backend_pid() ORDER BY query_start LIMIT 1`,
      )) as unknown as { query: string }[];
      const q = rows[0]?.query ?? "";
      if (/JournalEntry[\s\S]*FOR UPDATE/.test(q)) return q;
      if (Date.now() > deadline) return "";
      await new Promise((r) => setTimeout(r, 25));
    }
  })();
}

async function seedManualEntry(opts: {
  status: JournalStatus;
  sourceType?: string;
  amount?: bigint;
  date?: Date;
  entryNo?: string;
}) {
  const fy = await prisma.fiscalYear.findFirstOrThrow({ where: { name: ctx.fiscalYearName } });
  return prisma.journalEntry.create({
    data: {
      entryNo: opts.entryNo ?? `MJ-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      date: opts.date ?? new Date("2026-06-15"),
      narration: "Manual entry",
      status: opts.status,
      sourceType: (opts.sourceType ?? "MANUAL") as EntrySource,
      fiscalYearId: fy.id,
      createdById: ctx.userId,
      lines: {
        create: [
          { accountId: ctx.accountByCode.get("1130")!, debit: opts.amount ?? 1000n, partyId: ctx.customerId },
          { accountId: ctx.accountByCode.get("4100")!, credit: opts.amount ?? 1000n },
        ],
      },
    },
  });
}

describe("voidManualJournal (P1.1b, F11)", () => {
  it("MANUAL POSTED: voids with a mirrored REV entry; both stay POSTED; TB balances; link set; reason in narration", async () => {
    const entry = await seedManualEntry({ status: "POSTED", sourceType: "MANUAL", amount: 1000n });
    const reversal = await prisma.$transaction((t) =>
      voidManualJournal({ entryId: entry.id, reason: "wrong account", date: new Date("2026-07-01"), createdById: ctx.userId, tx: t as Tx }),
    );
    expect(reversal).not.toBeNull();
    expect(reversal!.status).toBe("POSTED");
    expect(reversal!.sourceType).toBe("REVERSAL");
    expect(reversal!.narration).toContain("wrong account");
    const original = await prisma.journalEntry.findUniqueOrThrow({
      where: { id: entry.id },
      include: { reversedBy: true },
    });
    expect(original.status).toBe("POSTED");
    expect(original.reversedBy?.id).toBe(reversal!.id);
    const rev = await prisma.journalEntry.findUniqueOrThrow({ where: { id: reversal!.id } });
    expect(rev.reversesEntryId).toBe(entry.id);
    const tb = await trialBalance(new Date("2026-12-31"));
    expect(tb.reduce((a, r) => a + r.debitTotal, 0n)).toBe(tb.reduce((a, r) => a + r.creditTotal, 0n));
  });

  it("MANUAL DRAFT: voids without a reversal entry; returns null", async () => {
    const entry = await seedManualEntry({ status: "DRAFT", sourceType: "MANUAL" });
    const before = await prisma.journalEntry.count();
    const reversal = await prisma.$transaction((t) =>
      voidManualJournal({ entryId: entry.id, reason: "draft mistake", date: new Date("2026-07-01"), createdById: ctx.userId, tx: t as Tx }),
    );
    expect(reversal).toBeNull();
    expect((await prisma.journalEntry.findUniqueOrThrow({ where: { id: entry.id } })).status).toBe("VOID");
    expect(await prisma.journalEntry.count()).toBe(before); // no reversal entry created
  });

  it("VOID entry: rejects with a clear message", async () => {
    const entry = await seedManualEntry({ status: "VOID", sourceType: "MANUAL" });
    await expect(
      prisma.$transaction((t) => voidManualJournal({ entryId: entry.id, reason: "x", date: new Date("2026-07-01"), createdById: ctx.userId, tx: t as Tx })),
    ).rejects.toThrow(/is already void/);
    expect((await prisma.journalEntry.findUniqueOrThrow({ where: { id: entry.id } })).status).toBe("VOID");
    expect(await prisma.journalEntry.count()).toBe(1); // unchanged
  });

  it("unknown entry id rejects with the friendly message", async () => {
    await expect(
      prisma.$transaction((t) => voidManualJournal({ entryId: "missing-id", reason: "x", date: new Date("2026-07-01"), createdById: ctx.userId, tx: t as Tx })),
    ).rejects.toThrow(/Journal entry not found/);
  });

  it("blank reason rejects without touching the ledger", async () => {
    const entry = await seedManualEntry({ status: "POSTED", sourceType: "MANUAL" });
    await expect(
      prisma.$transaction((t) => voidManualJournal({ entryId: entry.id, reason: "   ", date: new Date("2026-07-01"), createdById: ctx.userId, tx: t as Tx })),
    ).rejects.toThrow(/non-blank reason/);
    expect(await prisma.journalEntry.count()).toBe(1);
    expect((await prisma.journalEntry.findUniqueOrThrow({ where: { id: entry.id } })).status).toBe("POSTED");
  });

  it("over-long reason rejects without touching the ledger", async () => {
    const entry = await seedManualEntry({ status: "POSTED", sourceType: "MANUAL" });
    await expect(
      prisma.$transaction((t) => voidManualJournal({ entryId: entry.id, reason: "x".repeat(2001), date: new Date("2026-07-01"), createdById: ctx.userId, tx: t as Tx })),
    ).rejects.toThrow(/at most 2000/);
    expect(await prisma.journalEntry.count()).toBe(1);
    expect((await prisma.journalEntry.findUniqueOrThrow({ where: { id: entry.id } })).status).toBe("POSTED");
  });

  it.each([
    ["SALES_INVOICE", "SALES_INVOICE"],
    ["RECEIPT", "RECEIPT"],
    ["YEAR_END_CLOSE", "YEAR_END_CLOSE"],
    ["OPENING_BALANCE", "OPENING_BALANCE"],
    ["REVERSAL", "REVERSAL"],
  ])("negative: %s source type is rejected; void the source document instead", async (_name, sourceType) => {
    const entry = await seedManualEntry({ status: "POSTED", sourceType });
    await expect(
      prisma.$transaction((t) => voidManualJournal({ entryId: entry.id, reason: "x", date: new Date("2026-07-01"), createdById: ctx.userId, tx: t as Tx })),
    ).rejects.toThrow(/void the source document instead/);
    expect((await prisma.journalEntry.findUniqueOrThrow({ where: { id: entry.id } })).status).toBe("POSTED");
    expect(await prisma.journalEntry.count()).toBe(1); // unchanged
  });

  it("CONCURRENCY: double void serialized on the entry row lock; exactly one reversal exists", { timeout: 20_000 }, async () => {
    const entry = await seedManualEntry({ status: "POSTED", sourceType: "MANUAL" });

    let signal!: (v: string) => void;
    const tx1Ready = new Promise<string>((r) => (signal = r));
    let release!: (v: string) => void;
    const gate = new Promise<string>((r) => (release = r));

    const tx1p = prisma.$transaction(
      async (t) => {
        const reversal = await voidManualJournal({ entryId: entry.id, reason: "first void", date: new Date("2026-07-01"), createdById: ctx.userId, tx: t as Tx });
        expect(reversal).not.toBeNull();
        signal("reached"); // tx1 holds the entry row lock
        await gate;
        return reversal;
      },
      { timeout: 30_000 },
    );

    // TRANSACTION NOT STARTED YET: tx2 is only created after tx1Ready —
    // tx1Ready resolves exactly after the void (=> its row lock) has run while
    // tx1 holds the lock, so the competitor cannot win the lock race.
    let tx2p: Promise<unknown> | undefined;
    try {
      await tx1Ready;
      tx2p = prisma.$transaction(
        async (t) => voidManualJournal({ entryId: entry.id, reason: "second void", date: new Date("2026-07-01"), createdById: ctx.userId, tx: t as Tx }),
        { timeout: 30_000 },
      ); // unawaited until allSettled; must BLOCK on the entry row lock held by tx1
      const blocked = await firstBlockedEntryLock(4_000);
      expect(blocked.length).toBeGreaterThan(0); // the second void was blocked on the entry lock
      release("go");
      const results = await Promise.allSettled([tx1p, tx2p]);
      expect(results[0].status).toBe("fulfilled"); // first void wins deterministically
      expect(results[1].status).toBe("rejected");
      expect(String((results[1] as PromiseRejectedResult).reason)).toMatch(/is already reversed/);
      const reversals = await prisma.journalEntry.count({ where: { sourceType: "REVERSAL" } });
      expect(reversals).toBe(1); // exactly one reversal
      const tb = await trialBalance(new Date("2026-12-31"));
      expect(tb.reduce((a, r) => a + r.debitTotal, 0n)).toBe(tb.reduce((a, r) => a + r.creditTotal, 0n));
    } finally {
      release("go");
      await Promise.allSettled([tx1p, tx2p]); // drain
    }
  });
});
