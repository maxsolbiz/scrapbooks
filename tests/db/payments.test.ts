import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { createPayment, outstandingForInvoice } from "@/lib/payments";
import type { Tx } from "@/lib/tx";
import { truncateAll } from "./helpers";
import { seedTestData, type TestContext } from "./seed";

import type { InvoiceDirection, InvoiceStatus } from "@/generated/prisma/enums";

// Every DB test file starts with truncateAll(prisma) (shared worker state).
let ctx: TestContext;

async function seedPostedInvoice(partyId: string, total: bigint) {
  const invoice = await prisma.invoice.create({
    data: {
      invoiceNo: `INV-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      direction: "SALES" as InvoiceDirection,
      date: new Date("2026-06-01"),
      partyId,
      status: "POSTED" as InvoiceStatus,
      subtotalFils: total,
      vatFils: 0n,
      totalFils: total,
      createdById: ctx.userId,
    },
  });
  return invoice;
}

function nextInvoiceNo(i: number) {
  return `INV-${ctx.fiscalYearName}-${String(9000 + i).padStart(4, "0")}`;
}

beforeEach(async () => {
  await truncateAll(prisma);
  ctx = await seedTestData(prisma);
});

describe("createPayment (P1.2: lock first + per-invoice aggregation)", () => {
  it("happy path: receipt with one allocation commits; outstanding drops", async () => {
    const invoice = await seedPostedInvoice(ctx.customerId, 1000n);
    await prisma.$transaction(async (tx) => {
      await createPayment({
        tx: tx as Tx,
        type: "RECEIPT",
        method: "CASH",
        date: new Date("2026-06-10"),
        partyId: ctx.customerId,
        amountFils: 700n,
        createdById: ctx.userId,
        allocations: [{ invoiceId: invoice.id, amountFils: 700n }],
      });
    });
    const out = await outstandingForInvoice(prisma as unknown as Tx, invoice.id);
    expect(out).toBe(300n);
  });

  it("negative: allocation > outstanding rejects", async () => {
    const invoice = await seedPostedInvoice(ctx.customerId, 1000n);
    await expect(
      prisma.$transaction(async (tx) =>
        createPayment({
          tx: tx as Tx,
          type: "RECEIPT",
          method: "CASH",
          date: new Date("2026-06-10"),
          partyId: ctx.customerId,
          amountFils: 2000n,
          createdById: ctx.userId,
          allocations: [{ invoiceId: invoice.id, amountFils: 2000n }],
        }),
      ),
    ).rejects.toThrow(/exceeds the invoice outstanding/);
  });

  it("negative (F2b): duplicate rows for one invoice exceeding outstanding reject (aggregation)", async () => {
    const invoice = await seedPostedInvoice(ctx.customerId, 1000n);
    await expect(
      prisma.$transaction(async (tx) =>
        createPayment({
          tx: tx as Tx,
          type: "RECEIPT",
          method: "CASH",
          date: new Date("2026-06-10"),
          partyId: ctx.customerId,
          amountFils: 1400n,
          createdById: ctx.userId,
          allocations: [
            { invoiceId: invoice.id, amountFils: 700n },
            { invoiceId: invoice.id, amountFils: 700n },
          ],
        }),
      ),
    ).rejects.toThrow(/exceeds the invoice outstanding/);
  });

  it("negative: allocations exceed payment amount", async () => {
    const invoice = await seedPostedInvoice(ctx.customerId, 5000n);
    await expect(
      prisma.$transaction(async (tx) =>
        createPayment({
          tx: tx as Tx,
          type: "RECEIPT",
          method: "CASH",
          date: new Date("2026-06-10"),
          partyId: ctx.customerId,
          amountFils: 1000n,
          createdById: ctx.userId,
          allocations: [{ invoiceId: invoice.id, amountFils: 1100n }],
        }),
      ),
    ).rejects.toThrow(/Allocations exceed the payment amount/);
  });

  it("negative: wrong party rejects", async () => {
    const invoice = await seedPostedInvoice(ctx.customerId, 1000n);
    await expect(
      prisma.$transaction(async (tx) =>
        createPayment({
          tx: tx as Tx,
          type: "RECEIPT",
          method: "CASH",
          date: new Date("2026-06-10"),
          partyId: ctx.vendorId,
          amountFils: 1000n,
          createdById: ctx.userId,
          allocations: [{ invoiceId: invoice.id, amountFils: 700n }],
        }),
      ),
    ).rejects.toThrow(/different party/);
  });

  it("negative: receipts allocate only to sales invoices", async () => {
    const purchase = await prisma.invoice.create({
      data: {
        invoiceNo: nextInvoiceNo(1),
        direction: "PURCHASE" as InvoiceDirection,
        date: new Date("2026-06-01"),
        partyId: ctx.vendorId,
        status: "POSTED" as InvoiceStatus,
        subtotalFils: 1000n,
        vatFils: 0n,
        totalFils: 1000n,
        createdById: ctx.userId,
      },
    });
    await expect(
      prisma.$transaction(async (tx) =>
        createPayment({
          tx: tx as Tx,
          type: "RECEIPT",
          method: "CASH",
          date: new Date("2026-06-10"),
          partyId: ctx.customerId,
          amountFils: 1000n,
          createdById: ctx.userId,
          allocations: [{ invoiceId: purchase.id, amountFils: 700n }],
        }),
      ),
    ).rejects.toThrow(/sales invoices/);
  });

  it("negative: allocation to a VOID invoice rejects", async () => {
    const invoice = await seedPostedInvoice(ctx.customerId, 1000n);
    await prisma.invoice.update({ where: { id: invoice.id }, data: { status: "VOID" as InvoiceStatus } });
    await expect(
      prisma.$transaction(async (tx) =>
        createPayment({
          tx: tx as Tx,
          type: "RECEIPT",
          method: "CASH",
          date: new Date("2026-06-10"),
          partyId: ctx.customerId,
          amountFils: 1000n,
          createdById: ctx.userId,
          allocations: [{ invoiceId: invoice.id, amountFils: 700n }],
        }),
      ),
    ).rejects.toThrow(/not posted/);
  });

  it("CONCURRENCY (F2/F4): two payments allocating 700 of 1000 serialize on the row lock; final outcome is invariant", async () => {
    const invoice = await seedPostedInvoice(ctx.customerId, 1000n);

    // Deterministic protocol, no timing luck:
    // 1. tx1 runs createPayment fully (writes staged, uncommitted), signals, then holds.
    // 2. tx2 starts UNAWAITED. We POLL pg_stat_activity until tx2 is BLOCKED on a lock
    //    (FOR UPDATE with the fix; the Serial upsert without it). Being blocked proves
    //    tx2's validation reads COMPLETED — strictly before tx1 commits.
    // 3. Only then release the gate; tx1 commits.
    // Final outcome is then invariant: with the lock tx2 re-reads fresh outstanding
    // (300 left) and rejects; without the lock (mutation) tx2's stale validation
    // already passed, so it COMMITS and the sum invariant (<= totalFils) breaks.
    const waitBlocked = async (pattern: RegExp): Promise<string> => {
      const deadline = Date.now() + 15_000;
      for (;;) {
        const rows = (await prisma.$queryRawUnsafe<{ query: string }[]>(
          `SELECT query FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND pid <> pg_backend_pid() ORDER BY query_start LIMIT 1`,
        )) as unknown as { query: string }[];
        const q = rows[0]?.query ?? "";
        if (pattern.test(q)) return q;
        if (Date.now() > deadline) throw new Error(`no blocked query matching ${pattern}; last: "${q}"`);
        await new Promise((r) => setTimeout(r, 25));
      }
    };

    let tx1Done!: (v: string) => void;
    const tx1ReachedGate = new Promise<string>((r) => (tx1Done = r));
    let release!: (v: string) => void;
    const gate = new Promise<string>((r) => (release = r));

    const tx1p = prisma.$transaction(
      async (tx) => {
        await createPayment({
          tx: tx as Tx,
          type: "RECEIPT",
          method: "CASH",
          date: new Date("2026-06-10"),
          partyId: ctx.customerId,
          amountFils: 700n,
          createdById: ctx.userId,
          allocations: [{ invoiceId: invoice.id, amountFils: 700n }],
        }); // validation + writes done, NOT committed
        tx1Done("gate reached");
        await gate; // hold open; tx2 starts and blocks
      },
      { timeout: 30_000 },
    );

    await tx1ReachedGate;
    const tx2p = prisma.$transaction(
      (tx) =>
        createPayment({
          tx: tx as Tx,
          type: "RECEIPT",
          method: "CASH",
          date: new Date("2026-06-10"),
          partyId: ctx.customerId,
          amountFils: 700n,
          createdById: ctx.userId,
          allocations: [{ invoiceId: invoice.id, amountFils: 700n }],
        }),
      { timeout: 30_000 },
    ); // unawaited: blocked while tx1 holds the invoice row lock
    const blockedQuery = await waitBlocked(/FOR UPDATE|Serial/i);
    console.log("BLOCKED ON:", JSON.stringify(blockedQuery.trim().slice(0, 120)));
    release("go");

    const results = await Promise.allSettled([tx1p, tx2p]);
    expect(results[0].status).toBe("fulfilled");
    // With the fix tx2's outcome is ALWAYS rejection. (Serial-row blocking alone must
    // NOT satisfy this — after tx1 commits, the unlocked mutant commits tx2's stale
    // allocation, so a mutant that "merely blocked" would fail this assertion.)
    expect(results[1].status).toBe("rejected"); // mutant trap: blocked serial row alone must NOT satisfy this
    const err = (results[1] as PromiseRejectedResult).reason;
    expect(String(err)).toMatch(/exceeds the invoice outstanding/);
    const sumRow = (await prisma.$queryRawUnsafe<{ s: bigint | string | null }[]>(
      'SELECT SUM("PaymentAllocation"."amountFils")::text AS s FROM "PaymentAllocation" WHERE "PaymentAllocation"."invoiceId" = $1',
      invoice.id,
    )) as unknown as { s: bigint | string | null }[];
    expect(sumRow[0]?.s !== null ? BigInt(sumRow[0]!.s as string) : 0n).toBe(700n); // <= invoice.totalFils
  });
});
