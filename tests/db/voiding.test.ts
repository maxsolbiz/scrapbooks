import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { createInvoice, voidInvoiceWithReversal } from "@/lib/invoices";
import { createPayment, voidPaymentWithReversal, outstandingForInvoice } from "@/lib/payments";
import { trialBalance, profitAndLoss, agingReport, partyLedger } from "@/lib/reports";
import type { Tx } from "@/lib/tx";
import { truncateAll } from "./helpers";
import { seedTestData, type TestContext } from "./seed";

let ctx: TestContext;

beforeEach(async () => {
  await truncateAll(prisma); // shared worker state — every DB test file starts here
  ctx = await seedTestData(prisma);
});

const VAT_RATE = 0;

async function seedPostedSalesInvoice(totalFils: bigint, opts?: { date?: Date }) {
  const invoice = await prisma.$transaction((t) =>
    createInvoice({
      tx: t as Tx,
      direction: "SALES",
      date: opts?.date ?? new Date("2026-06-01"),
      partyId: ctx.customerId,
      lines: [
        { description: "scrap goods", qty: "1", unit: "KG", rateFils: totalFils, vatRate: VAT_RATE },
      ],
      createdById: ctx.userId,
    }),
  );
  return invoice;
}

async function seedReceiptAgainst(invoiceId: string, amountFils: bigint, opts?: { date?: Date }) {
  return prisma.$transaction((t) =>
    createPayment({
      tx: t as Tx,
      type: "RECEIPT",
      method: "BANK",
      date: opts?.date ?? new Date("2026-06-20"),
      partyId: ctx.customerId,
      amountFils,
      createdById: ctx.userId,
      allocations: [{ invoiceId, amountFils }],
    }),
  );
}

async function seedDraftSalesInvoice() {
  return prisma.invoice.create({
    data: {
      invoiceNo: "INV-DRAFT-0001",
      direction: "SALES",
      date: new Date("2026-06-01"),
      partyId: ctx.customerId,
      status: "DRAFT",
      subtotalFils: 500n,
      vatFils: 0n,
      totalFils: 500n,
      createdById: ctx.userId,
    },
  });
}

/** Polls pg_stat_activity until some OTHER connection blocks on an Invoice row lock query.
 * Returns the blocked query text, or "" if nothing blocked within the deadline. */
function firstBlockedInvoiceLock(deadlineMs: number): Promise<string> {
  return (async () => {
    const deadline = Date.now() + deadlineMs;
    for (;;) {
      const rows = (await prisma.$queryRawUnsafe<{ query: string }[]>(
        `SELECT query FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND pid <> pg_backend_pid() ORDER BY query_start LIMIT 1`,
      )) as unknown as { query: string }[];
      const q = rows[0]?.query ?? "";
      if (/Invoice[\s\S]*FOR UPDATE/.test(q)) return q;
      if (Date.now() > deadline) return "";
      await new Promise((r) => setTimeout(r, 25));
    }
  })();
}

const June2026 = new Date("2026-07-01");

describe("voidInvoiceWithReversal (P1.1 commit 3)", () => {
  it("happy path: invoice VOID, original entry still POSTED, reversal posted; TB balances; AR 1130 = 0; revenue 0; partyLedger INVOICE + REVERSAL", async () => {
    const invoice = await seedPostedSalesInvoice(2000n);
    // createInvoice returns the invoice object as created (before the journal
    // linkage update), so refetch for the journalEntryId.
    const fresh = (await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } }));
    expect(fresh.status).toBe("POSTED");
    expect(fresh.journalEntryId).toBeTruthy();
    const reversal = await prisma.$transaction((t) =>
      voidInvoiceWithReversal({
        invoiceId: invoice.id,
        reason: "wrong party",
        date: June2026,
        createdById: ctx.userId,
        tx: t as Tx,
      }),
    );
    expect(reversal).not.toBeNull();
    expect(reversal!.entryNo.startsWith("REV-")).toBe(true);
    expect((await prisma.journalEntry.findUniqueOrThrow({ where: { id: fresh.journalEntryId! } })).status).toBe("POSTED");
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).status).toBe("VOID");

    const tb = await trialBalance(new Date("2026-12-31"));
    expect(tb.reduce((a, r) => a + r.debitTotal, 0n)).toBe(tb.reduce((a, r) => a + r.creditTotal, 0n));
    expect(tb.find((r) => r.code === "1130")!.debitTotal).toBe(tb.find((r) => r.code === "1130")!.creditTotal);
    const fy = await prisma.fiscalYear.findFirstOrThrow({ where: { name: ctx.fiscalYearName } });
    expect((await profitAndLoss(fy)).revenueTotal).toBe(0n);
    const rows = await partyLedger(ctx.customerId, fy);
    expect(rows.map((r) => r.kind).sort()).toEqual(["INVOICE", "REVERSAL"].sort());
  });

  it("aging: a posted invoice appears; after voiding it disappears", async () => {
    const invoice = await seedPostedSalesInvoice(2000n);
    expect((await agingReport("SALES")).map((a) => a.invoiceNo)).toContain(invoice.invoiceNo);
    await prisma.$transaction((t) =>
      voidInvoiceWithReversal({ invoiceId: invoice.id, reason: "void it", date: June2026, createdById: ctx.userId, tx: t as Tx }),
    );
    expect((await agingReport("SALES")).map((a) => a.invoiceNo)).not.toContain(invoice.invoiceNo);
  });

  it("with an ACTIVE allocation the void rejects; with only a VOID-payment allocation it voids (D11)", async () => {
    const invoice = await seedPostedSalesInvoice(2000n);
    const payment = await seedReceiptAgainst(invoice.id, 500n);
    expect(payment.status).toBe("POSTED");
    await expect(
      prisma.$transaction((t) =>
        voidInvoiceWithReversal({ invoiceId: invoice.id, reason: "x", date: June2026, createdById: ctx.userId, tx: t as Tx }),
      ),
    ).rejects.toThrow(/payment allocations — remove them first/);
    // void the payment first, then the invoice must go through
    await prisma.$transaction((t) =>
      voidPaymentWithReversal({ paymentId: payment.id, reason: "wrong bank", date: June2026, createdById: ctx.userId, tx: t as Tx }),
    );
    expect((await outstandingForInvoice(prisma as never, invoice.id))).toBe(2000n);
    await prisma.$transaction((t) =>
      voidInvoiceWithReversal({ invoiceId: invoice.id, reason: "now free", date: June2026, createdById: ctx.userId, tx: t as Tx }),
    );
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).status).toBe("VOID");
  });

  it("double void rejects; unknown id rejects friendly; blank reason rejects", async () => {
    const invoice = await seedPostedSalesInvoice(2000n);
    await prisma.$transaction((t) =>
      voidInvoiceWithReversal({ invoiceId: invoice.id, reason: "first", date: June2026, createdById: ctx.userId, tx: t as Tx }),
    );
    await expect(
      prisma.$transaction((t) =>
        voidInvoiceWithReversal({ invoiceId: invoice.id, reason: "second", date: June2026, createdById: ctx.userId, tx: t as Tx }),
      ),
    ).rejects.toThrow(/already void/);
    await expect(
      prisma.$transaction((t) =>
        voidInvoiceWithReversal({ invoiceId: "missing-id", reason: "x", date: June2026, createdById: ctx.userId, tx: t as Tx }),
      ),
    ).rejects.toThrow(/Invoice not found/);
    await expect(
      prisma.$transaction((t) =>
        voidInvoiceWithReversal({ invoiceId: invoice.id === "never" ? "" : invoice.id, reason: "   ", date: June2026, createdById: ctx.userId, tx: t as Tx }),
      ),
    ).rejects.toThrow(/non-blank reason/);
  });

  it("voiding an invoice and a payment for the same party keeps the party ledger consistent (net 0)", async () => {
    const invoiceA = await seedPostedSalesInvoice(1000n, { date: new Date("2026-06-01") });
    const invoiceB = await seedPostedSalesInvoice(2000n, { date: new Date("2026-06-02") });
    const receipt = await seedReceiptAgainst(invoiceB.id, 500n);
    await prisma.$transaction((t) =>
      voidInvoiceWithReversal({ invoiceId: invoiceA.id, reason: "void A", date: June2026, createdById: ctx.userId, tx: t as Tx }),
    );
    await prisma.$transaction((t) =>
      voidPaymentWithReversal({ paymentId: receipt.id, reason: "void receipt", date: June2026, createdById: ctx.userId, tx: t as Tx }),
    );
    const fy = await prisma.fiscalYear.findFirstOrThrow({ where: { name: ctx.fiscalYearName } });
    const rows = await partyLedger(ctx.customerId, fy);
    // only invoice B's line remains (A reversed, receipt + allocation reversed)
    expect(rows.reduce((acc, r) => acc + r.debit - r.credit, 0n)).toBe(2000n);
    expect((await trialBalance(new Date("2026-12-31")).then((tb) => tb.reduce((a, r) => a + r.debitTotal, 0n)))).toBe(
      (await trialBalance(new Date("2026-12-31")).then((tb) => tb.reduce((a, r) => a + r.creditTotal, 0n))),
    );
    // allocation rows are KEPT (D11)
    expect(await prisma.paymentAllocation.count()).toBe(1);
  });

  it("draft invoice: voids without a reversal entry; returns null", async () => {
    const invoice = await seedDraftSalesInvoice();
    const before = await prisma.journalEntry.count();
    const reversal = await prisma.$transaction((t) =>
      voidInvoiceWithReversal({ invoiceId: invoice.id, reason: "draft mistake", date: June2026, createdById: ctx.userId, tx: t as Tx }),
    );
    expect(reversal).toBeNull();
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).status).toBe("VOID");
    expect(await prisma.journalEntry.count()).toBe(before); // no reversal entry created
  });
});

describe("voidPaymentWithReversal (P1.1 commit 3)", () => {
  it("happy path: outstanding restored, invoice reappears in aging, allocation rows kept, payment VOID", async () => {
    const invoice = await seedPostedSalesInvoice(2000n);
    await seedReceiptAgainst(invoice.id, 2000n);
    expect(await outstandingForInvoice(prisma as never, invoice.id)).toBe(0n);
    const agingBefore = await agingReport("SALES");
    expect(agingBefore.find((a) => a.invoiceNo === invoice.invoiceNo)).toBeUndefined(); // fully paid -> excluded

    const payment = await prisma.payment.findFirstOrThrow({ where: { type: "RECEIPT" } });
    const reversal = await prisma.$transaction((t) =>
      voidPaymentWithReversal({ paymentId: payment.id, reason: "void receipt", date: June2026, createdById: ctx.userId, tx: t as Tx }),
    );
    expect(reversal).not.toBeNull();
    expect(reversal!.entryNo.startsWith("REV-")).toBe(true);
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe("VOID");
    expect(await outstandingForInvoice(prisma as never, invoice.id)).toBe(2000n); // restored
    const agingAfter = await agingReport("SALES");
    expect(agingAfter.find((a) => a.invoiceNo === invoice.invoiceNo)).toBeDefined(); // reappears
    expect(await prisma.paymentAllocation.count()).toBe(1); // D11: kept
    const tb = await trialBalance(new Date("2026-12-31"));
    expect(tb.reduce((a, r) => a + r.debitTotal, 0n)).toBe(tb.reduce((a, r) => a + r.creditTotal, 0n));
  });

  it("already-VOID payment rejects; unknown payment id rejects friendly; blank reason rejects", async () => {
    const invoice = await seedPostedSalesInvoice(2000n);
    const payment = await seedReceiptAgainst(invoice.id, 500n);
    await prisma.$transaction((t) =>
      voidPaymentWithReversal({ paymentId: payment.id, reason: "first", date: June2026, createdById: ctx.userId, tx: t as Tx }),
    );
    await expect(
      prisma.$transaction((t) =>
        voidPaymentWithReversal({ paymentId: payment.id, reason: "second", date: June2026, createdById: ctx.userId, tx: t as Tx }),
      ),
    ).rejects.toThrow(/already void/);
    await expect(
      prisma.$transaction((t) =>
        voidPaymentWithReversal({ paymentId: "missing-payment", reason: "x", date: June2026, createdById: ctx.userId, tx: t as Tx }),
      ),
    ).rejects.toThrow(/Payment not found/);
    await expect(
      prisma.$transaction((t) =>
        voidPaymentWithReversal({ paymentId: payment.id, reason: "   ", date: June2026, createdById: ctx.userId, tx: t as Tx }),
      ),
    ).rejects.toThrow(/non-blank reason/);
  });

  it("CONCURRENCY (F2): voidInvoice vs createPayment on the same invoice serialize on the invoice row lock; exactly one of the two succeeds", { timeout: 20_000 }, async () => {
    const invoice = await seedPostedSalesInvoice(1000n);
    const voidDate = June2026;

    let signal!: (v: string) => void;
    const tx1Ready = new Promise<string>((r) => (signal = r));
    let release!: (v: string) => void;
    const gate = new Promise<string>((r) => (release = r));

    const tx1p = prisma.$transaction(
      async (t) => {
        const payment = await createPayment({
          tx: t as Tx,
          type: "RECEIPT",
          method: "BANK",
          date: new Date("2026-06-25"),
          partyId: ctx.customerId,
          amountFils: 700n,
          createdById: ctx.userId,
          allocations: [{ invoiceId: invoice.id, amountFils: 700n }],
        });
        signal("reached");
        await gate;
        return payment;
      },
      { timeout: 30_000 },
    );

    const tx2p = prisma.$transaction(
      (t) => voidInvoiceWithReversal({ invoiceId: invoice.id, reason: "undo sales", date: voidDate, createdById: ctx.userId, tx: t as Tx }),
      { timeout: 30_000 },
    ); // unawaited; one of the two transactions must block on the invoice row lock

    let results: [PromiseSettledResult<unknown>, PromiseSettledResult<unknown>] | { timeout: true };
    const allSettledP = Promise.allSettled([tx1p, tx2p]) as Promise<[PromiseSettledResult<unknown>, PromiseSettledResult<unknown>]>;
    try {
      // Wait for the FIRST decisive event: tx1 reaching its gate (it holds the lock),
      // or an actual blocked invoice lock (tx order flipped). Neither case hangs.
      await Promise.race([tx1Ready, firstBlockedInvoiceLock(4_000)]);
      release("go");
      results = (await Promise.race([
        allSettledP,
        new Promise<{ timeout: true }>((r) => setTimeout(() => r({ timeout: true }), 10_000)),
      ])) as [PromiseSettledResult<unknown>, PromiseSettledResult<unknown>] | { timeout: true };
      if ("timeout" in results) throw new Error("CONCURRENCY-DEADLOCK: transactions neither completed nor rejected in 10s");
    } finally {
      release("go");
      results = await allSettledP; // drain
    }

    // OUTCOME ONLY (winner-agnostic): never both succeed.
    const statuses = results.map((r) => r.status);
    expect(statuses).toContain("fulfilled");
    expect(statuses).toContain("rejected"); // NEVER both succeed
    const payment = await prisma.payment.findFirst({ where: { type: "RECEIPT" } });
    const inv = await prisma.invoice.findUniqueOrThrow({
      where: { id: invoice.id },
      include: { allocations: { include: { payment: { select: { status: true } } } } },
    });
    const activeAlloc = inv.allocations.some((a) => a.payment.status !== "VOID");
    if (payment && payment.status === "POSTED") {
      // payment won the race: invoice must be POSTED with the active allocation
      expect(inv.status).toBe("POSTED");
      expect(activeAlloc).toBe(true);
    } else {
      // void won: no committed payment, invoice VOID (no active allocations possible)
      expect(inv.status).toBe("VOID");
      expect(activeAlloc).toBe(false);
      const reversals = await prisma.journalEntry.findMany({ where: { sourceType: "REVERSAL" } });
      expect(reversals).toHaveLength(1);
    }
    // mutual exclusion is checked above via statuses; the books must balance either way:
    const tb = await trialBalance(new Date("2026-12-31"));
    expect(tb.reduce((a, r) => a + r.debitTotal, 0n)).toBe(tb.reduce((a, r) => a + r.creditTotal, 0n));
  });

  it("cross-period: a payment whose entry sits in a CLOSED FY (legacy-shaped rows) is voided into the OPEN FY; outstanding restored", async () => {
    const fy2025 = await prisma.fiscalYear.create({
      data: { name: "FY2025", starts: new Date("2025-01-01"), ends: new Date("2025-12-31"), status: "CLOSED" },
    });
    // Historical rows shaped like production data from before the void feature:
    // customer invoice dated 2025-05-01 + receipt dated 2025-06-15, entry POSTED in CLOSED FY2025.
    const invoice = await prisma.invoice.create({
      data: {
        invoiceNo: "INV-FY2025-0007",
        direction: "SALES",
        date: new Date("2025-05-01"),
        partyId: ctx.customerId,
        status: "POSTED",
        subtotalFils: 2000n,
        vatFils: 0n,
        totalFils: 2000n,
        createdById: ctx.userId,
      },
    });
    const legacyEntry = await prisma.journalEntry.create({
      data: {
        entryNo: "INV-FY2025-0007",
        date: new Date("2025-05-01"),
        narration: "Sales invoice INV-FY2025-0007",
        status: "POSTED",
        sourceType: "SALES_INVOICE",
        sourceId: invoice.id,
        fiscalYearId: fy2025.id,
        createdById: ctx.userId,
        lines: {
          create: [
            { accountId: ctx.accountByCode.get("1130")!, debit: 2000n, partyId: ctx.customerId },
            { accountId: ctx.accountByCode.get("4100")!, credit: 2000n },
          ],
        },
      },
    });
    await prisma.invoice.update({ where: { id: invoice.id }, data: { journalEntryId: legacyEntry.id } });
    const rcpEntry = await prisma.journalEntry.create({
      data: {
        entryNo: "RCP-FY2025-0003",
        date: new Date("2025-06-15"),
        narration: "Receipt RCP-FY2025-0003",
        status: "POSTED",
        sourceType: "RECEIPT",
        fiscalYearId: fy2025.id,
        createdById: ctx.userId,
        lines: {
          create: [
            { accountId: ctx.accountByCode.get("1120")!, debit: 2000n },
            { accountId: ctx.accountByCode.get("1130")!, credit: 2000n, partyId: ctx.customerId },
          ],
        },
      },
    });
    const payment = await prisma.payment.create({
      data: {
        paymentNo: "RCP-FY2025-0003",
        type: "RECEIPT",
        method: "BANK",
        date: new Date("2025-06-15"),
        partyId: ctx.customerId,
        status: "POSTED",
        amountFils: 2000n,
        journalEntryId: rcpEntry.id,
        createdById: ctx.userId,
        allocations: { create: [{ invoiceId: invoice.id, amountFils: 2000n }] },
      },
    });
    expect(await outstandingForInvoice(prisma as never, invoice.id)).toBe(0n);

    const reversal = await prisma.$transaction((t) =>
      voidPaymentWithReversal({ paymentId: payment.id, reason: "wrong bank account", date: new Date("2026-07-01"), createdById: ctx.userId, tx: t as Tx }),
    );
    expect(reversal).not.toBeNull();
    expect(reversal!.entryNo.startsWith("REV-FY2026")).toBe(true); // reversal landed in the OPEN FY
    expect(await outstandingForInvoice(prisma as never, invoice.id)).toBe(2000n); // restored
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe("VOID");
    // the receipt in the CLOSED FY nets 0 in the trial balance (original + reversal both POSTED)
    const tb = await trialBalance(new Date("2026-12-31"));
    expect(tb.find((r) => r.code === "1120")!.debitTotal).toBe(tb.find((r) => r.code === "1120")!.creditTotal);
  });

  it("partial-allocation: a receipt allocated across TWO invoices restores BOTH outstandings (lock ids sorted)", async () => {
    const invA = await seedPostedSalesInvoice(1000n, { date: new Date("2026-06-01") });
    const invB = await seedPostedSalesInvoice(2000n, { date: new Date("2026-06-02") });
    // full createPayment with allocations in ALREADY-UNSORTED order (B then A): locks serialize sorted anyway
    const payment = await prisma.$transaction((t) =>
      createPayment({
        tx: t as Tx,
        type: "RECEIPT",
        method: "BANK",
        date: new Date("2026-06-20"),
        partyId: ctx.customerId,
        amountFils: 700n,
        createdById: ctx.userId,
        allocations: [
          { invoiceId: invB.id, amountFils: 500n },
          { invoiceId: invA.id, amountFils: 200n },
        ],
      }),
    );
    expect(await outstandingForInvoice(prisma as never, invA.id)).toBe(800n);
    expect(await outstandingForInvoice(prisma as never, invB.id)).toBe(1500n);

    await prisma.$transaction((t) =>
      voidPaymentWithReversal({ paymentId: payment.id, reason: "duplicate receipt", date: new Date("2026-07-01"), createdById: ctx.userId, tx: t as Tx }),
    );
    expect(await outstandingForInvoice(prisma as never, invA.id)).toBe(1000n); // restored
    expect(await outstandingForInvoice(prisma as never, invB.id)).toBe(2000n); // restored
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe("VOID");
    expect(await prisma.paymentAllocation.count()).toBe(2); // D11: kept
  });

  it("DETERMINISTIC payment-wins: createPayment holds the invoice lock behind a gate; the void blocks and rejects with the allocation error; invoice stays POSTED", { timeout: 20_000 }, async () => {
    const invoice = await seedPostedSalesInvoice(1000n);

    let signal!: (v: string) => void;
    const tx1Ready = new Promise<string>((r) => (signal = r));
    let release!: (v: string) => void;
    const gate = new Promise<string>((r) => (release = r));

    const tx1p = prisma.$transaction(
      async (t) => {
        const payment = await createPayment({
          tx: t as Tx,
          type: "RECEIPT",
          method: "BANK",
          date: new Date("2026-06-25"),
          partyId: ctx.customerId,
          amountFils: 700n,
          createdById: ctx.userId,
          allocations: [{ invoiceId: invoice.id, amountFils: 700n }],
        });
        signal("reached"); // tx1 holds the invoice row lock from lockInvoices onward
        await gate;
        return payment;
      },
      { timeout: 30_000 },
    );

    // TRANSACTION NOT STARTED YET: tx2 is only created after tx1Ready —
    // tx1Ready resolves exactly after createPayment (=> its lockInvoices) has run
    // while tx1 holds the invoice lock, so the competitor cannot win the lock race.
    let tx2p: Promise<unknown> | undefined;
    try {
      await tx1Ready;
      tx2p = prisma.$transaction(
        (t) => voidInvoiceWithReversal({ invoiceId: invoice.id, reason: "undo sales", date: June2026, createdById: ctx.userId, tx: t as Tx }),
        { timeout: 30_000 },
      ); // unawaited until allSettled; must BLOCK on the Invoice lock held by tx1's lockInvoices
      const blocked = await firstBlockedInvoiceLock(4_000);
      expect(blocked.length).toBeGreaterThan(0); // the void was blocked on the invoice lock
      release("go");
      const results = await Promise.allSettled([tx1p, tx2p]);
      expect(results[0].status).toBe("fulfilled"); // payment wins deterministically
      expect(results[1].status).toBe("rejected");
      expect(String((results[1] as PromiseRejectedResult).reason)).toMatch(/payment allocations — remove them first/);
      expect((await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).status).toBe("POSTED");
      expect(await prisma.payment.count({ where: { type: "RECEIPT", status: "POSTED" } })).toBe(1);
      const tb = await trialBalance(new Date("2026-12-31"));
      expect(tb.reduce((a, r) => a + r.debitTotal, 0n)).toBe(tb.reduce((a, r) => a + r.creditTotal, 0n));
    } finally {
      release("go");
      await Promise.allSettled(tx2p ? [tx1p, tx2p] : [tx1p]); // drain
    }
  });

  it("DETERMINISTIC void-wins: the void transaction holds the invoice lock behind a gate; createPayment blocks and rejects; invoice ends VOID with one reversal", { timeout: 20_000 }, async () => {
    const invoice = await seedPostedSalesInvoice(1000n);

    let signal!: (v: string) => void;
    const tx1Ready = new Promise<string>((r) => (signal = r));
    let release!: (v: string) => void;
    const gate = new Promise<string>((r) => (release = r));

    const tx1p = prisma.$transaction(
      async (t) => {
        const reversal = await voidInvoiceWithReversal({
          invoiceId: invoice.id,
          reason: "void first",
          date: June2026,
          createdById: ctx.userId,
          tx: t as Tx,
        });
        expect(reversal).not.toBeNull();
        signal("reached"); // the void holds the invoice lock
        await gate;
        return reversal;
      },
      { timeout: 30_000 },
    );

    // TRANSACTION NOT STARTED YET: tx2 is only created after tx1Ready —
    // tx1Ready resolves exactly after the void (=> its lockInvoices) has run while
    // tx1 holds the invoice lock, so createPayment cannot win the lock race.
    let tx2p: Promise<unknown> | undefined;
    try {
      await tx1Ready;
      tx2p = prisma.$transaction(
        (t) =>
          createPayment({
            tx: t as Tx,
            type: "RECEIPT",
            method: "BANK",
            date: new Date("2026-06-25"),
            partyId: ctx.customerId,
            amountFils: 500n,
            createdById: ctx.userId,
            allocations: [{ invoiceId: invoice.id, amountFils: 500n }],
          }),
        { timeout: 30_000 },
      ); // unawaited until allSettled; must BLOCK on the Invoice lock held by the void tx
      const blocked = await firstBlockedInvoiceLock(4_000);
      expect(blocked.length).toBeGreaterThan(0); // createPayment was blocked on the invoice lock
      release("go");
      const results = await Promise.allSettled([tx1p, tx2p]);
      expect(results[0].status).toBe("fulfilled"); // void wins deterministically
      expect(results[1].status).toBe("rejected");
      expect(String((results[1] as PromiseRejectedResult).reason)).toMatch(/not posted/);
      expect((await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).status).toBe("VOID");
      expect(await prisma.journalEntry.findMany({ where: { sourceType: "REVERSAL" } })).toHaveLength(1);
      expect(await prisma.payment.count({ where: { status: "POSTED" } })).toBe(0);
    } finally {
      release("go");
      await Promise.allSettled(tx2p ? [tx1p, tx2p] : [tx1p]); // drain
    }
  });
});
