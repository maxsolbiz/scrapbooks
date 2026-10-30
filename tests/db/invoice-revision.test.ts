import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { createInvoice } from "@/lib/invoices";
import { revisePostedInvoice } from "@/lib/invoice-revision";
import { createPayment, voidPaymentWithReversal } from "@/lib/payments";
import { trialBalance, partyLedger } from "@/lib/reports";
import type { Tx } from "@/lib/tx";
import { truncateAll } from "./helpers";
import { seedTestData, type TestContext } from "./seed";

let ctx: TestContext;

beforeEach(async () => {
  await truncateAll(prisma); // shared worker state — every DB test file starts here
  ctx = await seedTestData(prisma);
});

const VAT_RATE = 0.05;

/** Minimal amend payload (one line) used by the guard tests. */
function updates(qty = "1", rateFils = 100n) {
  return {
    date: new Date("2026-06-01"),
    lines: [{ description: "line", qty, unit: "KG" as const, rateFils, vatRate: 0 }],
  };
}

async function seedPostedSalesInvoice(opts?: { qty?: string; rateFils?: bigint }) {
  const invoice = await prisma.$transaction((t) =>
    createInvoice({
      tx: t as Tx,
      direction: "SALES",
      date: new Date("2026-06-01"),
      partyId: ctx.customerId,
      lines: [
        {
          description: "scrap goods",
          qty: opts?.qty ?? "10",
          unit: "KG",
          rateFils: opts?.rateFils ?? 10000n,
          vatRate: VAT_RATE,
        },
      ],
      createdById: ctx.userId,
    }),
  );
  // createInvoice returns the pre-journal-linkage object on the SALES branch
  // (known quirk): refetch so journalEntryId is present.
  return prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
}

async function seedPostedPurchaseInvoice() {
  const invoice = await prisma.$transaction((t) =>
    createInvoice({
      tx: t as Tx,
      direction: "PURCHASE",
      date: new Date("2026-06-02"),
      partyId: ctx.vendorId,
      lines: [
        { description: "bought scrap", qty: "5", unit: "KG", rateFils: 20000n, vatRate: VAT_RATE },
      ],
      createdById: ctx.userId,
    }),
  );
  return prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
}

describe("P3.2: invoice revision / amend flow (revisePostedInvoice)", () => {
  it("happy path: original reversed + VOID, new POSTED revision linked with revisionNumber 1 and corrected lines", async () => {
    // 10 x 100.00 AED = 1000 + 5% VAT (50) = 1050 AED
    const original = await seedPostedSalesInvoice();
    expect(original.totalFils).toBe(105000n);

    const result = await prisma.$transaction((t) =>
      revisePostedInvoice({
        originalInvoiceId: original.id,
        direction: "SALES",
        reason: "wrong quantity",
        updates: {
          date: new Date("2026-06-01"),
          notes: "corrected quantity",
          lines: [{ description: "scrap goods", qty: "12", unit: "KG", rateFils: 10000n, vatRate: VAT_RATE }],
        },
        createdById: ctx.userId,
        tx: t as Tx,
      }),
    );

    // Original: VOID, journal entry untouched (P1.1 — never deleted/mutated).
    expect(result.originalInvoice.status).toBe("VOID");
    expect(result.originalInvoice.journalEntryId).toBeTruthy();
    const originalEntry = await prisma.journalEntry.findUniqueOrThrow({
      where: { id: result.originalInvoice.journalEntryId! },
    });
    expect(originalEntry.status).toBe("POSTED");

    // Reversal: mirrored REVERSAL entry linked to the original entry.
    // (reverseJournalEntry returns the object from before the reversesEntryId
    // update — same stale-return quirk as createInvoice — so refetch.)
    expect(result.reversal).not.toBeNull();
    expect(result.reversal!.entryNo.startsWith("REV-")).toBe(true);
    const reversalRow = await prisma.journalEntry.findUniqueOrThrow({
      where: { id: result.reversal!.id },
    });
    expect(reversalRow.reversesEntryId).toBe(result.originalInvoice.journalEntryId);
    expect(String(reversalRow.sourceType)).toBe("REVERSAL");

    // New invoice: POSTED revision with the corrected data, linked to the original.
    expect(result.newInvoice.status).toBe("POSTED");
    expect(result.newInvoice.revisionNumber).toBe(1);
    expect(result.newInvoice.revisesInvoiceId).toBe(original.id);
    expect(result.newInvoice.partyId).toBe(original.partyId);
    expect(result.newInvoice.direction).toBe("SALES");
    expect(result.newInvoice.notes).toBe("corrected quantity");
    expect(result.newInvoice.journalEntryId).toBeTruthy();
    // 12 x 100 = 1200 + 5% (60) = 1260 AED — recomputed server-side.
    expect(result.newInvoice.totalFils).toBe(126000n);
    const newLines = await prisma.invoiceLine.findMany({
      where: { invoiceId: result.newInvoice.id },
    });
    expect(newLines).toHaveLength(1);
    expect(Number(newLines[0].qty)).toBe(12);

    // Ledger: trial balance balances; AR 1130 nets to the revision total only
    // (original + reversal cancel each other out).
    const tb = await trialBalance(new Date("2026-12-31"));
    expect(tb.reduce((a, r) => a + r.debitTotal, 0n)).toBe(
      tb.reduce((a, r) => a + r.creditTotal, 0n),
    );
    const ar = tb.find((r) => r.code === "1130")!;
    expect(ar.debitTotal - ar.creditTotal).toBe(126000n);

    // Party ledger shows the full audit trail: INVOICE + REVERSAL + INVOICE.
    const fy = await prisma.fiscalYear.findFirstOrThrow({
      where: { name: ctx.fiscalYearName },
    });
    const rows = await partyLedger(ctx.customerId, fy);
    expect(rows.map((r) => r.kind).sort()).toEqual(["INVOICE", "INVOICE", "REVERSAL"]);
  });

  it("validation: a DRAFT cannot be amended (drafts are edited directly)", async () => {
    const draft = await prisma.invoice.create({
      data: {
        invoiceNo: "INV-DRAFT-0001",
        direction: "SALES",
        date: new Date("2026-06-01"),
        partyId: ctx.customerId,
        status: "DRAFT",
        totalFils: 500n,
        createdById: ctx.userId,
      },
    });
    await expect(
      prisma.$transaction((t) =>
        revisePostedInvoice({
          originalInvoiceId: draft.id,
          direction: "SALES",
          reason: "try amend draft",
          updates: updates(),
          createdById: ctx.userId,
          tx: t as Tx,
        }),
      ),
    ).rejects.toThrow(/is a draft/);
  });

  it("audit: INVOICE_REVISE row records the mandatory reason, actor and original invoice (inside the tx)", async () => {
    const original = await seedPostedSalesInvoice();
    await prisma.$transaction((t) =>
      revisePostedInvoice({
        originalInvoiceId: original.id,
        direction: "SALES",
        reason: "pricing error on line 1",
        updates: {
          date: new Date("2026-06-01"),
          lines: [{ description: "scrap goods", qty: "10", unit: "KG", rateFils: 11000n, vatRate: VAT_RATE }],
        },
        createdById: ctx.userId,
        createdByEmail: "admin@test.local",
        tx: t as Tx,
      }),
    );
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: "INVOICE_REVISE", entityId: original.id },
      orderBy: { createdAt: "desc" },
    });
    expect(audit.entityType).toBe("Invoice");
    expect(audit.userId).toBe(ctx.userId);
    expect(audit.userEmail).toBe("admin@test.local");
    expect(audit.detail).toContain("pricing error on line 1");
    expect(audit.detail).toContain(original.invoiceNo);
  });

  it("guards: blank reason, wrong direction, VOID original, and already-revision original all reject", async () => {
    const original = await seedPostedSalesInvoice();

    // Blank reason is rejected before anything is written.
    await expect(
      prisma.$transaction((t) =>
        revisePostedInvoice({
          originalInvoiceId: original.id,
          direction: "SALES",
          reason: "   ",
          updates: updates(),
          createdById: ctx.userId,
          tx: t as Tx,
        }),
      ),
    ).rejects.toThrow(/non-blank amendment reason/);

    // Direction must match the original (module-permission guard).
    await expect(
      prisma.$transaction((t) =>
        revisePostedInvoice({
          originalInvoiceId: original.id,
          direction: "PURCHASE",
          reason: "wrong direction module",
          updates: updates(),
          createdById: ctx.userId,
          tx: t as Tx,
        }),
      ),
    ).rejects.toThrow(/Invoice not found/);

    // Amend once -> original VOID; a second amend of the original is rejected.
    const first = await prisma.$transaction((t) =>
      revisePostedInvoice({
        originalInvoiceId: original.id,
        direction: "SALES",
        reason: "first amendment",
        updates: updates(),
        createdById: ctx.userId,
        tx: t as Tx,
      }),
    );
    await expect(
      prisma.$transaction((t) =>
        revisePostedInvoice({
          originalInvoiceId: original.id,
          direction: "SALES",
          reason: "second amendment",
          updates: updates(),
          createdById: ctx.userId,
          tx: t as Tx,
        }),
      ),
    ).rejects.toThrow(/cannot be amended/);

    // The REVISION itself cannot be amended again (amend the chain root instead).
    await expect(
      prisma.$transaction((t) =>
        revisePostedInvoice({
          originalInvoiceId: first.newInvoice.id,
          direction: "SALES",
          reason: "amend the revision",
          updates: updates(),
          createdById: ctx.userId,
          tx: t as Tx,
        }),
      ),
    ).rejects.toThrow(/already a revision/);
  });

  it("guards: an ACTIVE payment allocation blocks amendment; voiding the payment frees it (D11)", async () => {
    const original = await seedPostedSalesInvoice();
    const payment = await prisma.$transaction((t) =>
      createPayment({
        tx: t as Tx,
        type: "RECEIPT",
        method: "BANK",
        date: new Date("2026-06-20"),
        partyId: ctx.customerId,
        amountFils: 5000n,
        createdById: ctx.userId,
        allocations: [{ invoiceId: original.id, amountFils: 5000n }],
      }),
    );
    await expect(
      prisma.$transaction((t) =>
        revisePostedInvoice({
          originalInvoiceId: original.id,
          direction: "SALES",
          reason: "has an active payment",
          updates: updates(),
          createdById: ctx.userId,
          tx: t as Tx,
        }),
      ),
    ).rejects.toThrow(/payment allocations — remove them first/);

    // VOID the payment first (D11), then the amendment goes through.
    await prisma.$transaction((t) =>
      voidPaymentWithReversal({
        paymentId: payment.id,
        reason: "wrong bank",
        date: new Date("2026-07-01"),
        createdById: ctx.userId,
        tx: t as Tx,
      }),
    );
    const result = await prisma.$transaction((t) =>
      revisePostedInvoice({
        originalInvoiceId: original.id,
        direction: "SALES",
        reason: "now free",
        updates: updates("2", 100n),
        createdById: ctx.userId,
        tx: t as Tx,
      }),
    );
    expect(result.newInvoice.revisionNumber).toBe(1);
    expect(result.originalInvoice.status).toBe("VOID");
  });

  it("PURCHASE direction: revision keeps direction/vendor and nets AP to the revision total only", async () => {
    // 5 x 200 = 1000 + 5% (50) = 1050 AED
    const original = await seedPostedPurchaseInvoice();
    expect(original.totalFils).toBe(105000n);

    const result = await prisma.$transaction((t) =>
      revisePostedInvoice({
        originalInvoiceId: original.id,
        direction: "PURCHASE",
        reason: "rate correction",
        updates: {
          date: new Date("2026-06-02"),
          lines: [{ description: "bought scrap", qty: "5", unit: "KG", rateFils: 22000n, vatRate: VAT_RATE }],
        },
        createdById: ctx.userId,
        tx: t as Tx,
      }),
    );
    expect(result.originalInvoice.status).toBe("VOID");
    expect(result.newInvoice.status).toBe("POSTED");
    expect(result.newInvoice.direction).toBe("PURCHASE");
    expect(result.newInvoice.partyId).toBe(original.partyId);
    // 5 x 220 = 1100 + 5% (55) = 1155 AED
    expect(result.newInvoice.totalFils).toBe(115500n);
    expect(result.newInvoice.revisesInvoiceId).toBe(original.id);
    expect(result.newInvoice.revisionNumber).toBe(1);

    // AP 2100 nets to the revision total only (original + reversal cancel).
    const tb = await trialBalance(new Date("2026-12-31"));
    expect(tb.reduce((a, r) => a + r.debitTotal, 0n)).toBe(
      tb.reduce((a, r) => a + r.creditTotal, 0n),
    );
    const ap = tb.find((r) => r.code === "2100")!;
    expect(ap.creditTotal - ap.debitTotal).toBe(115500n);
  });
});
