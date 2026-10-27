import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { postJournalEntry, reverseJournalEntry } from "@/lib/accounting";
import { partyLedger, trialBalance, profitAndLoss } from "@/lib/reports";
import type { JournalStatus } from "@/generated/prisma/enums";
import type { Tx } from "@/lib/tx";
import { truncateAll } from "./helpers";
import { seedTestData, type TestContext } from "./seed";

let ctx: TestContext;

beforeEach(async () => {
  await truncateAll(prisma); // shared worker state — every DB test file starts here
  ctx = await seedTestData(prisma);
});

/** Seeds one posted sales-invoice entry: DR AR(1130) / CR Revenue(4100), party on the AR line. */
async function seedSalesEntry(amount: bigint, opts?: { date?: Date }) {
  const date = opts?.date ?? new Date("2026-06-01");
  const invoice = await prisma.invoice.create({
    data: {
      invoiceNo: `INV-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      direction: "SALES",
      date,
      partyId: ctx.customerId,
      status: "POSTED",
      subtotalFils: amount,
      vatFils: 0n,
      totalFils: amount,
      createdById: ctx.userId,
    },
  });
  const entry = await prisma.$transaction(async (tx) =>
    postJournalEntry({
      tx: tx as Tx,
      date,
      narration: `Invoice ${invoice.invoiceNo}`,
      sourceType: "SALES_INVOICE",
      sourceId: invoice.id,
      createdById: ctx.userId,
      lines: [
        { accountId: ctx.accountByCode.get("1130")!, debit: amount, partyId: ctx.customerId, description: "goods sale" },
        { accountId: ctx.accountByCode.get("4100")!, credit: amount },
      ],
    }),
  );
  await prisma.invoice.update({ where: { id: invoice.id }, data: { journalEntryId: entry.id } }); // production linkage
  return { invoice, entry };
}

/** Polls pg_stat_activity until some OTHER connection is blocked on a lock whose query matches. */
async function waitBlocked(pattern: RegExp): Promise<string> {
  const deadline = Date.now() + 4_000;
  for (;;) {
    const rows = (await prisma.$queryRawUnsafe<{ query: string }[]>(
      `SELECT query FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND pid <> pg_backend_pid() ORDER BY query_start LIMIT 1`,
    )) as unknown as { query: string }[];
    const q = rows[0]?.query ?? "";
    if (pattern.test(q)) return q;
    if (Date.now() > deadline) throw new Error(`BLOCKED-TIMEOUT: no blocked query matching ${pattern}; last blocked query: "${q}"`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

describe("reverseJournalEntry (P1.1 accounting core)", () => {
  it("happy path: original stays POSTED; mirrored POSTED reversal - REV number, swapped lines, copied partyId/description, link + reason set", async () => {
    const { entry } = await seedSalesEntry(1000n);
    const reversal = await prisma.$transaction((tx) =>
      reverseJournalEntry({
        entryId: entry.id,
        reason: "wrong customer",
        date: new Date("2026-07-01"),
        createdById: ctx.userId,
        tx: tx as Tx,
      }),
    );
    expect(await prisma.journalEntry.count()).toBe(2);
    expect((await prisma.journalEntry.findUniqueOrThrow({ where: { id: entry.id } })).status).toBe("POSTED");
    const rev = await prisma.journalEntry.findUniqueOrThrow({ where: { id: reversal.id }, include: { lines: true } });
    expect(rev.status).toBe("POSTED");
    expect(rev.entryNo.startsWith("REV-FY2026")).toBe(true);
    expect(rev.reversesEntryId).toBe(entry.id);
    expect(rev.narration).toContain("REVERSAL of");
    expect(rev.narration).toContain("wrong customer");
    const arLine = rev.lines.find((l) => l.accountId === ctx.accountByCode.get("1130"));
    const revenueLine = rev.lines.find((l) => l.accountId === ctx.accountByCode.get("4100"));
    expect(arLine!.credit).toBe(1000n); // swapped
    expect(revenueLine!.debit).toBe(1000n);
    expect(arLine!.partyId).toBe(ctx.customerId); // partyId copied
    expect(arLine!.description).toBe("goods sale"); // description copied
    expect(rev.sourceType).toBe("REVERSAL"); // sourceType is REVERSAL
    expect(rev.sourceId).toBe((await prisma.journalEntry.findUniqueOrThrow({ where: { id: entry.id } })).sourceId!); // sourceId copied
  });

  it("happy path extras: same-day (UTC calendar) reversal succeeds; reason trimmed; narrationAr present -> Arabic reversal narration with the reason; absent -> null", async () => {
    const afternoon = new Date("2026-06-01T15:30:00.000Z"); // original carries a TIME component
    const { entry } = await seedSalesEntry(700n, { date: afternoon });
    const reversal = await prisma.$transaction((tx) =>
      reverseJournalEntry({
        entryId: entry.id,
        reason: "  padded reason  ",
        date: new Date("2026-06-01"), // SAME calendar day (UTC) -> must succeed
        createdById: ctx.userId,
        tx: tx as Tx,
      }),
    );
    expect(reversal.narration).toBe(`REVERSAL of ${entry.entryNo}: padded reason`); // trimmed, same-day OK
    // narrationAr path: fresh entry with narrationAr present
    const { entry: e2 } = await seedSalesEntry(300n, { date: new Date("2026-06-05") });
    await prisma.journalEntry.update({ where: { id: e2.id }, data: { narrationAr: "فاتورة أصيلة" } });
    const r2 = await prisma.$transaction((tx) =>
      reverseJournalEntry({ entryId: e2.id, reason: "with arabic", date: new Date("2026-06-06"), createdById: ctx.userId, tx: tx as Tx }),
    );
    expect(r2.narrationAr).toContain("عكس");
    expect(r2.narrationAr).toContain("with arabic");
    // narrationAr ABSENT -> null
    const { entry: e3 } = await seedSalesEntry(300n, { date: new Date("2026-06-07") });
    const r3 = await prisma.$transaction((tx) =>
      reverseJournalEntry({ entryId: e3.id, reason: "no arabic", date: new Date("2026-06-08"), createdById: ctx.userId, tx: tx as Tx }),
    );
    expect(r3.narrationAr).toBeNull();
  });

  it("negative: rejected reversal leaves counts unchanged", async () => {
    const { entry } = await seedSalesEntry(500n);
    const before = {
      entries: await prisma.journalEntry.count(),
      lines: await prisma.journalLine.count(),
    };
    await expect(
      prisma.$transaction((tx) =>
        reverseJournalEntry({ entryId: entry.id, reason: "", date: new Date("2026-07-01"), createdById: ctx.userId, tx: tx as Tx }),
      ),
    ).rejects.toThrow(/non-blank reason/);
    expect(await prisma.journalEntry.count()).toBe(before.entries);
    expect(await prisma.journalLine.count()).toBe(before.lines);
  });

  it("Mode B reports (real functions) after a same-FY reversal: before-state non-vacuous, trial balance still balances, AR nets 0, revenue 0, party ledger exactly 2 rows with correct labels", async () => {
    const { entry } = await seedSalesEntry(1000n);
    // BEFORE: the amounts must be non-zero (guards against vacuous zero-equality)
    const tbBefore = await trialBalance(new Date("2026-12-31"));
    const arBefore = tbBefore.find((r) => r.code === "1130");
    expect(arBefore!.debitTotal).toBe(1000n);
    expect(tbBefore.reduce((a, r) => a + r.debitTotal, 0n)).toBe(tbBefore.reduce((a, r) => a + r.creditTotal, 0n)); // whole TB balances
    const fyBefore = await prisma.fiscalYear.findFirstOrThrow({ where: { name: ctx.fiscalYearName } });
    expect((await profitAndLoss(fyBefore)).revenueTotal).toBe(1000n);
    expect(await partyLedger(ctx.customerId, fyBefore)).toHaveLength(1); // one INVOICE row before

    const reversal = await prisma.$transaction((tx) =>
      reverseJournalEntry({ entryId: entry.id, reason: "void test invoice", date: new Date("2026-07-01"), createdById: ctx.userId, tx: tx as Tx }),
    );
    const fy = await prisma.fiscalYear.findFirstOrThrow({ where: { name: ctx.fiscalYearName } });
    const tb = await trialBalance(new Date("2026-12-31"));
    const ar = tb.find((r) => r.code === "1130");
    expect(ar!.debitTotal).toBe(ar!.creditTotal); // AR nets to zero
    expect(tb.reduce((a, r) => a + r.debitTotal, 0n)).toBe(tb.reduce((a, r) => a + r.creditTotal, 0n)); // whole TB balances
    const pl = await profitAndLoss(fy);
    expect(pl.revenueTotal).toBe(0n); // revenue 0
    const rows = await partyLedger(ctx.customerId, fy);
    expect(rows).toHaveLength(2); // exactly 2 rows: INVOICE + REVERSAL
    // partyLedger classification (src/lib/reports.ts: entry.sourceType REVERSAL -> kind REVERSAL, docNo falls back to entryNo)
    expect(rows[0].kind).toBe("INVOICE");
    const inv = await prisma.invoice.findFirstOrThrow();
    expect(rows[0].docNo).toBe(inv.invoiceNo);
    expect(rows[0].docId).toBe(inv.id);
    expect(rows[1].kind).toBe("REVERSAL");
    expect(rows[1].docNo.startsWith("REV-")).toBe(true);
    expect(rows[1].credit).toBe(1000n);
    expect(rows[1].docId).toBe(reversal.id); // reversal row links by its own journal-entry id    expect(rows.reduce((acc, r) => acc + r.debit - r.credit, 0n)).toBe(0n); // party nets 0
  });

  it("cross-period: original in a CLOSED FY (legacy-seeded), reversal into OPEN FY succeeds; closed-FY P&L unchanged", async () => {
    const fy2025 = await prisma.fiscalYear.create({
      data: { name: "FY2025", starts: new Date("2025-01-01"), ends: new Date("2025-12-31"), status: "CLOSED" },
    });
    const legacy = await prisma.journalEntry.create({
      data: {
        entryNo: "INV-FY2025-0042",
        date: new Date("2025-06-01"),
        narration: "Invoice INV-FY2025-0042",
        status: "POSTED",
        sourceType: "SALES_INVOICE",
        fiscalYearId: fy2025.id,
        createdById: ctx.userId,
        lines: {
          create: [
            { accountId: ctx.accountByCode.get("1130")!, debit: 1000n, partyId: ctx.customerId, description: "goods sale" },
            { accountId: ctx.accountByCode.get("4100")!, credit: 1000n },
          ],
        },
      },
    });
    const reversal = await prisma.$transaction((tx) =>
      reverseJournalEntry({ entryId: legacy.id, reason: "late void", date: new Date("2026-07-01"), createdById: ctx.userId, tx: tx as Tx }),
    );
    expect(reversal.entryNo.startsWith("REV-FY2026")).toBe(true);
    const pl2025 = await profitAndLoss(await prisma.fiscalYear.findFirstOrThrow({ where: { name: "FY2025" } }));
    expect(pl2025.revenueTotal).toBe(1000n); // the CLOSED year's P&L is unchanged
    const tb2026 = await trialBalance(new Date("2026-12-31"));
    const ar = tb2026.find((r) => r.code === "1130");
    expect(ar!.debitTotal).toBe(ar!.creditTotal); // AR nets across periods
  });

  it.each([
    ["DRAFT target", "DRAFT", /only POSTED entries are reversed/],
    ["VOID target", "VOID", /only POSTED entries are reversed/],
  ])("negative: %s rejects", async (_name, status, msg) => {
    const { entry } = await seedSalesEntry(500n);
    await prisma.journalEntry.update({
      where: { id: entry.id },
      data: { status: status as JournalStatus },
    });
    await expect(
      prisma.$transaction((tx) =>
        reverseJournalEntry({ entryId: entry.id, reason: "x", date: new Date("2026-07-01"), createdById: ctx.userId, tx: tx as Tx }),
      ),
    ).rejects.toThrow(msg);
  });

  it("negative: already reversed rejects (back-relation check)", async () => {
    const { entry } = await seedSalesEntry(500n);
    await prisma.$transaction((t) =>
      reverseJournalEntry({ entryId: entry.id, reason: "first void", date: new Date("2026-07-01"), createdById: ctx.userId, tx: t as Tx }),
    );
    await expect(
      prisma.$transaction((t) =>
        reverseJournalEntry({ entryId: entry.id, reason: "second void", date: new Date("2026-07-02"), createdById: ctx.userId, tx: t as Tx }),
      ),
    ).rejects.toThrow(/already reversed by REV-/); // the PRE-check's message; P2002 fallback would say "is already reversed"
  });

  it("negative: reversal of a reversal rejects (target.reversesEntryId set)", async () => {
    const { entry } = await seedSalesEntry(500n);
    const reversal = await prisma.$transaction((t) =>
      reverseJournalEntry({ entryId: entry.id, reason: "first void", date: new Date("2026-07-01"), createdById: ctx.userId, tx: t as Tx }),
    );
    await expect(
      prisma.$transaction((t) =>
        reverseJournalEntry({ entryId: reversal.id, reason: "undo the undo", date: new Date("2026-07-02"), createdById: ctx.userId, tx: t as Tx }),
      ),
    ).rejects.toThrow(/itself a reversal/);
  });

  it("negative: reversal date before the original date rejects", async () => {
    const { entry } = await seedSalesEntry(500n);
    await expect(
      prisma.$transaction((t) =>
        reverseJournalEntry({ entryId: entry.id, reason: "backdated", date: new Date("2026-01-01"), createdById: ctx.userId, tx: t as Tx }),
      ),
    ).rejects.toThrow(/before the original entry date/);
  });

  it("negative: invalid Date rejects (NaN time)", async () => {
    const { entry } = await seedSalesEntry(500n);
    await expect(
      prisma.$transaction((t) =>
        reverseJournalEntry({ entryId: entry.id, reason: "x", date: new Date("not-a-date"), createdById: ctx.userId, tx: t as Tx }),
      ),
    ).rejects.toThrow(/invalid/);
  });

  it("negative: no fiscal year covers the reversal date (2030-01-01) rejects", async () => {
    const { entry } = await seedSalesEntry(500n);
    await expect(
      prisma.$transaction((t) =>
        reverseJournalEntry({ entryId: entry.id, reason: "uncovered date", date: new Date("2030-01-01"), createdById: ctx.userId, tx: t as Tx }),
      ),
    ).rejects.toThrow(/No fiscal year covers/);
  });

  it("negative: YEAR_END_CLOSE source rejects (D12, reviewer default - not user-confirmed)", async () => {
    const fy = await prisma.fiscalYear.findFirstOrThrow({ where: { name: ctx.fiscalYearName } });
    const yec = await prisma.$transaction((t) =>
      postJournalEntry({
        tx: t as Tx,
        date: new Date("2026-06-15"),
        narration: "year end close leg",
        sourceType: "YEAR_END_CLOSE",
        sourceId: undefined,
        createdById: ctx.userId,
        lines: [
          { accountId: ctx.accountByCode.get("1130")!, debit: 100n },
          { accountId: ctx.accountByCode.get("4100")!, credit: 100n },
        ],
      }),
    );
    void fy;
    await expect(
      prisma.$transaction((t) =>
        reverseJournalEntry({ entryId: yec.id, reason: "undo close", date: new Date("2026-07-01"), createdById: ctx.userId, tx: t as Tx }),
      ),
    ).rejects.toThrow(/year-end close and cannot be reversed/);
  });

  it("negative: closed fiscal year on the reversal date rejects (valid later date)", async () => {
    const { entry } = await seedSalesEntry(500n);
    await prisma.fiscalYear.create({
      data: { name: "FY2027C", starts: new Date("2027-01-01"), ends: new Date("2027-12-31"), status: "CLOSED" },
    });
    await expect(
      prisma.$transaction((t) =>
        reverseJournalEntry({ entryId: entry.id, reason: "into a closed year", date: new Date("2027-05-01"), createdById: ctx.userId, tx: t as Tx }),
      ),
    ).rejects.toThrow(/is closed/);
  });

  it("negative: blank reason rejects; over-long reason rejects", async () => {
    const { entry } = await seedSalesEntry(500n);
    await expect(
      prisma.$transaction((t) =>
        reverseJournalEntry({ entryId: entry.id, reason: "   ", date: new Date("2026-07-01"), createdById: ctx.userId, tx: t as Tx }),
      ),
    ).rejects.toThrow(/non-blank reason/);
    await expect(
      prisma.$transaction((t) =>
        reverseJournalEntry({ entryId: entry.id, reason: "x".repeat(2001), date: new Date("2026-07-01"), createdById: ctx.userId, tx: t as Tx }),
      ),
    ).rejects.toThrow(/2000 characters/);
  });

  it("inactive account: reversal succeeds (allowInactive) while normal posting keeps rejecting", async () => {
    const { entry } = await seedSalesEntry(500n);
    await prisma.account.update({ where: { id: ctx.accountByCode.get("4100")! }, data: { isActive: false } });
    await expect(
      prisma.$transaction((t) =>
        postJournalEntry({
          tx: t as Tx,
          date: new Date("2026-06-02"),
          sourceType: "MANUAL",
          createdById: ctx.userId,
          lines: [
            { accountId: ctx.accountByCode.get("1130")!, debit: 100n },
            { accountId: ctx.accountByCode.get("4100")!, credit: 100n },
          ],
        }),
      ),
    ).rejects.toThrow(/missing or inactive/);
    const reversal = await prisma.$transaction((t) =>
      reverseJournalEntry({ entryId: entry.id, reason: "void with deactivated revenue", date: new Date("2026-07-01"), createdById: ctx.userId, tx: t as Tx }),
    );
    expect(reversal.status).toBe("POSTED");
  });

  it("CONCURRENCY: double reversal serialized by the row lock; exactly one reversal exists; second call rejects", { timeout: 20_000 }, async () => {
    const { entry } = await seedSalesEntry(500n);
    const date = new Date("2026-07-01");

    let signal!: (v: string) => void;
    const tx1Ready = new Promise<string>((r) => (signal = r));
    let release!: (v: string) => void;
    const gate = new Promise<string>((r) => (release = r));

    const tx1p = prisma.$transaction(
      async (t) => {
        await reverseJournalEntry({ entryId: entry.id, reason: "first void", date, createdById: ctx.userId, tx: t as Tx });
        signal("reached");
        await gate;
      },
      { timeout: 30_000 },
    );

    const tx2 = prisma.$transaction(
      (t) => reverseJournalEntry({ entryId: entry.id, reason: "second void", date, createdById: ctx.userId, tx: t as Tx }),
      { timeout: 30_000 },
    ); // unawaited; blocks ON the original entry row lock held by tx1 (lock = defense in depth;
    const tx2p = tx2; //   the unique index + P2002 keep the OUTCOME correct even without it)
    try {
      await tx1Ready;
      const blockedQuery = await waitBlocked(/JournalEntry[\s\S]*FOR UPDATE/); // proven by WHERE tx2 blocks (must be the ENTRY row, not the Serial upsert)
      expect(blockedQuery.length).toBeGreaterThan(0);
      release("go");
      const results = await Promise.allSettled([tx1p, tx2p]);
      expect(results[0].status).toBe("fulfilled");
      expect(results[1].status).toBe("rejected");
      expect(String((results[1] as PromiseRejectedResult).reason)).toMatch(/already reversed by REV-/);
      expect(await prisma.journalEntry.findMany({ where: { reversesEntryId: entry.id } })).toHaveLength(1);
      expect(await prisma.journalEntry.count()).toBe(2); // original + exactly one reversal
    } finally {
      release("go");
      await Promise.allSettled([tx1p, tx2p]); // drain: never leave the gate open for the next truncateAll
    }
  });
});
