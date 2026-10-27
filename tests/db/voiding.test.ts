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
    ).rejects.toThrow(/.payment allocations/);
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

    /** Resolves with the blocked query text, or "" if nothing blocked within the deadline. */
    const firstBlockedInvoiceLock = (deadlineMs: number) =>
      (async () => {
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
});
