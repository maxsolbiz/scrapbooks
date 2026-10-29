import type { Tx } from "@/lib/tx";
import type { EntrySource, PaymentMethod, PaymentType } from "@/generated/prisma/enums";
import type { JournalEntry } from "@/generated/prisma/client";
import { Prisma } from "@/generated/prisma/client";
import { postJournalEntry, reverseJournalEntry } from "@/lib/accounting";
import { derivePaymentStatus } from "@/lib/invoice-status";
import { partyCreditBalance, getUnallocatedPayments } from "@/lib/party-credit";

const CASH_CODE = "1110";
const BANK_CODE = "1120";
const AR_CODE = "1130";
const AP_CODE = "2100";

export interface PaymentAllocationInput {
  invoiceId: string;
  amountFils: bigint;
}

export interface CreatePaymentInput {
  type: PaymentType;
  method: PaymentMethod;
  date: Date;
  partyId?: string | null;
  amountFils: bigint;
  reference?: string | null;
  referenceAr?: string | null;
  notes?: string | null;
  allocations?: PaymentAllocationInput[];
  createdById: string;
  tx: Tx;
  idempotencyKey?: string;
}

/**
 * Row-lock the invoice rows a write touches, BEFORE any status/direction/outstanding
 * reads, so concurrent writers serialize. Ids are deduped and sorted, and the SQL
 * locks in `ORDER BY id` order (an IN-list does not guarantee Postgres lock order),
 * which prevents AB/BA deadlocks between payments allocating overlapping sets.
 * Parameterized via Prisma.join — never string-interpolated.
 */
export async function lockInvoices(tx: Tx, invoiceIds: readonly string[]): Promise<string[]> {
  const ids = [...new Set(invoiceIds)].sort();
  if (ids.length === 0) return ids;
  await tx.$queryRaw(Prisma.sql`SELECT id FROM "Invoice" WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`);
  return ids;
}

export async function outstandingForInvoice(tx: Tx, invoiceId: string) {
  const invoice = await tx.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      allocations: {
        include: { payment: { select: { status: true } } },
      },
    },
  });
  if (!invoice) return null;
  if (invoice.status !== "POSTED") return null;
  const allocated = invoice.allocations
    .filter((a) => a.payment.status !== "VOID")
    .reduce((acc, a) => acc + a.amountFils, 0n);
  return invoice.totalFils - allocated;
}

export async function createPayment(input: CreatePaymentInput) {
  const { tx, type, method, date, partyId, amountFils, createdById, allocations = [] } = input;

  if (amountFils <= 0n) throw new Error("Amount must be positive");
  if (type !== "CONTRA" && !partyId) throw new Error("Party is required");

  let sourceType: EntrySource;
  let prefix: string;
  if (type === "RECEIPT") {
    sourceType = "RECEIPT";
    prefix = "RCP";
  } else {
    sourceType = "PAYMENT";
    prefix = type === "CONTRA" ? "CON" : "PAY";
  }

  const cash = await tx.account.findUnique({ where: { code: CASH_CODE } });
  const bank = await tx.account.findUnique({ where: { code: BANK_CODE } });
  const ar = await tx.account.findUnique({ where: { code: AR_CODE } });
  const ap = await tx.account.findUnique({ where: { code: AP_CODE } });
  if (!cash || !bank || !ar || !ap) {
    throw new Error("Required accounts (1110/1120/1130/2100) are missing");
  }
  const accountOf = method === "CASH" ? cash : bank;

  // Lock FIRST (before status/direction/outstanding reads — F2), then validate
  // allocations with duplicates AGGREGATED per invoice (F2b): two rows for the
  // same invoice must be summed, not each checked independently.
  await lockInvoices(tx, allocations.map((a) => a.invoiceId));
  const perInvoice = new Map<string, bigint>();
  let allocatedTotal = 0n;
  const expectedDirection = type === "RECEIPT" ? "SALES" : "PURCHASE";
  for (const alloc of allocations) {
    if (alloc.amountFils <= 0n) throw new Error("Allocation amount must be positive");
    perInvoice.set(alloc.invoiceId, (perInvoice.get(alloc.invoiceId) ?? 0n) + alloc.amountFils);
    const invoice = await tx.invoice.findUnique({
      where: { id: alloc.invoiceId },
      include: { party: { select: { id: true } } },
    });
    if (!invoice || invoice.status !== "POSTED") {
      throw new Error("Allocated invoice not found or not posted");
    }
    if (invoice.direction !== expectedDirection) {
      throw new Error(
        type === "RECEIPT"
          ? "Receipts allocate to sales invoices"
          : "Payments allocate to purchase invoices",
      );
    }
    if (invoice.party.id !== partyId) {
      throw new Error("Allocated invoice belongs to a different party");
    }
    allocatedTotal += alloc.amountFils;
  }
  // F2b: per-invoice totals against outstanding (sum of duplicate rows)
  for (const [invoiceId, sum] of perInvoice) {
    const outstanding = await outstandingForInvoice(tx, invoiceId);
    if (outstanding !== null && sum > outstanding) {
      throw new Error("Allocation exceeds the invoice outstanding");
    }
  }
  if (allocatedTotal > amountFils) {
    throw new Error("Allocations exceed the payment amount");
  }

  const fiscalYear = await tx.fiscalYear.findFirst({
    where: { starts: { lte: date }, ends: { gte: date } },
  });
  if (!fiscalYear) throw new Error(`No fiscal year covers ${date.toISOString().slice(0, 10)}`);
  if (fiscalYear.status !== "OPEN") throw new Error("Fiscal year is closed");

  const serial = await tx.serial.upsert({
    where: { key: `${fiscalYear.name}:${prefix}` },
    update: { value: { increment: 1 } },
    create: { key: `${fiscalYear.name}:${prefix}`, value: 1 },
  });
  const paymentNo = `${prefix}-${fiscalYear.name}-${String(serial.value).padStart(4, "0")}`;

  let jeId: string | null = null;

  if (type === "RECEIPT") {
    const party = await tx.party.findUniqueOrThrow({ where: { id: partyId as string } });
    const je = await postJournalEntry({
      tx,
      date,
      narration: `Receipt ${paymentNo} from ${party.nameEn}`,
      narrationAr: `مقبوضات ${paymentNo} من ${party.nameAr}`,
      sourceType,
      createdById,
      lines: [
        { accountId: accountOf.id, debit: amountFils },
        { accountId: ar.id, credit: amountFils, partyId: partyId ?? undefined },
      ],
    });
    jeId = je.id;
  } else if (type === "PAYMENT") {
    const party = await tx.party.findUniqueOrThrow({ where: { id: partyId as string } });
    const je = await postJournalEntry({
      tx,
      date,
      narration: `Payment ${paymentNo} to ${party.nameEn}`,
      narrationAr: `سدد ${paymentNo} إلى ${party.nameAr}`,
      sourceType,
      createdById,
      lines: [
        { accountId: ap.id, debit: amountFils, partyId: partyId ?? undefined },
        { accountId: accountOf.id, credit: amountFils },
      ],
    });
    jeId = je.id;
  } else {
    // CONTRA: money moves between cash & bank; method = the SOURCE account
    const otherAccount = method === "CASH" ? bank : cash;
    const sourceName = method === "CASH" ? "Cash" : "Bank";
    const targetName = method === "CASH" ? "Bank" : "Cash";
    const je = await postJournalEntry({
      tx,
      date,
      narration: `Contra ${paymentNo}: ${sourceName} → ${targetName}`,
      narrationAr: `نحوي ${paymentNo}: ${sourceName} → ${targetName}`,
      sourceType,
      createdById,
      lines: [
        { accountId: otherAccount.id, debit: amountFils },
        { accountId: accountOf.id, credit: amountFils },
      ],
    });
    jeId = je.id;
  }

  const payment = await tx.payment.create({
    data: {
      paymentNo,
      type,
      method,
      date,
      partyId: type === "CONTRA" ? null : partyId || null,
      status: "POSTED",
      amountFils,
      reference: input.reference || null,
      referenceAr: input.referenceAr || null,
      notes: input.notes || null,
      journalEntryId: jeId,
      createdById,
      idempotencyKey: input.idempotencyKey || null,
      allocations: {
        create: allocations.map((a) => ({
          invoiceId: a.invoiceId,
          amountFils: a.amountFils,
        })),
      },
    },
  });

  // P2.2: Recalculate payment status for each allocated invoice
  if (allocations.length > 0) {
    for (const alloc of allocations) {
      const invoice = await tx.invoice.findUnique({
        where: { id: alloc.invoiceId },
        include: {
          allocations: {
            where: { payment: { status: "POSTED" } },
            select: { amountFils: true },
          },
        },
      });
      if (invoice) {
        const allocatedFils = invoice.allocations.reduce(
          (sum, a) => sum + a.amountFils,
          0n,
        );
        const newStatus = derivePaymentStatus(
          invoice.totalFils,
          allocatedFils,
          invoice.dueDate,
        );
        await tx.invoice.update({
          where: { id: alloc.invoiceId },
          data: { paymentStatus: newStatus },
        });
      }
    }
  }

  return payment;
}

export interface VoidPaymentWithReversalInput {
  paymentId: string;
  /** mandatory; appended to the reversal narration inside the tx */
  reason: string;
  /** caller-resolved reversal date (default today in Asia/Dubai at the ACTION layer) */
  date: Date;
  createdById: string;
  tx: Tx;
}

/**
 * P1.1 reversal-based void for payments. NEW function — legacy callers keep using
 * voidPayment. Lock order per the binding: allocation invoice rows (sorted) ->
 * the payment row -> journal-entry rows (inside reverseJournalEntry) -> Serial.
 * D11: the PaymentAllocation rows are KEPT; consumers exclude them via payment status.
 */
export async function voidPaymentWithReversal(input: VoidPaymentWithReversalInput): Promise<JournalEntry | null> {
  const { paymentId, date, createdById } = input;
  const reason = input.reason?.trim() ?? "";
  if (!reason) throw new Error("A non-blank reason is required");
  if (reason.length > 2000) throw new Error("Reason must be at most 2000 characters");

  // Read the allocation invoice ids FIRST so we can take locks in the binding order.
  const probe = await input.tx.payment.findUnique({
    where: { id: paymentId },
    include: { allocations: { select: { invoiceId: true } } },
  });
  if (!probe) throw new Error("Payment not found");
  const invoiceIds = probe.allocations.map((a) => a.invoiceId);

  await lockInvoices(input.tx, invoiceIds); // 1. invoices, sorted, deduped
  await input.tx.$queryRaw(Prisma.sql`SELECT id FROM "Payment" WHERE id = ${paymentId} FOR UPDATE`); // 2. payment row

  // Re-validate UNDER the lock: the earlier probe is only a lock-order probe.
  const payment = await input.tx.payment.findUnique({
    where: { id: paymentId },
    include: { allocations: true },
  });
  if (!payment) throw new Error("Payment not found");
  if (payment.status === "VOID") throw new Error(`Payment ${payment.paymentNo} is already void`);

  // P2.2: Recalculate payment status for all affected invoices after voiding
  if (payment.allocations.length > 0) {
    for (const alloc of payment.allocations) {
      const invoice = await input.tx.invoice.findUnique({
        where: { id: alloc.invoiceId },
        include: {
          allocations: {
            where: { payment: { status: "POSTED" }, paymentId: { not: paymentId } },
            select: { amountFils: true },
          },
        },
      });
      if (invoice) {
        const allocatedFils = invoice.allocations.reduce(
          (sum, a) => sum + a.amountFils,
          0n,
        );
        const newStatus = derivePaymentStatus(
          invoice.totalFils,
          allocatedFils,
          invoice.dueDate,
        );
        await input.tx.invoice.update({
          where: { id: alloc.invoiceId },
          data: { paymentStatus: newStatus },
        });
      }
    }
  }

  if (payment.journalEntryId) {
    const reversal = await reverseJournalEntry({
      entryId: payment.journalEntryId,
      reason,
      date,
      createdById,
      tx: input.tx,
    });
    await input.tx.payment.update({ where: { id: paymentId }, data: { status: "VOID" } });
    return reversal;
  }
  // No journal entry (DRAFT payment): just flip the status; no reversal entry.
  await input.tx.payment.update({ where: { id: paymentId }, data: { status: "VOID" } });
  return null;
}

export interface ApplyCreditInput {
  tx: Tx;
  invoiceId: string;
  amountFils: bigint;
}

/**
 * Apply available credit from unallocated payments to an invoice.
 * Uses FIFO (oldest payment first) to create allocations.
 */
export async function applyCreditToInvoice(input: ApplyCreditInput): Promise<void> {
  const { tx, invoiceId, amountFils } = input;

  const invoice = await tx.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) throw new Error("Invoice not found");

  // Check available credit
  const available = await partyCreditBalance(invoice.partyId);
  if (amountFils > available) {
    throw new Error(`Insufficient credit: requested ${amountFils}, available ${available}`);
  }

  // Get unallocated payments (FIFO)
  const unallocated = await getUnallocatedPayments(invoice.partyId);

  let remaining = amountFils;
  for (const payment of unallocated) {
    if (remaining <= 0n) break;

    const allocateFromThis = remaining < payment.remaining ? remaining : payment.remaining;
    await tx.paymentAllocation.create({
      data: {
        paymentId: payment.id,
        invoiceId,
        amountFils: allocateFromThis,
      },
    });
    remaining -= allocateFromThis;
  }

  // Recalculate invoice payment status
  const updatedInvoice = await tx.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      allocations: { where: { payment: { status: "POSTED" } }, select: { amountFils: true } },
    },
  });
  if (updatedInvoice) {
    const allocatedFils = updatedInvoice.allocations.reduce((sum, a) => sum + a.amountFils, 0n);
    const newStatus = derivePaymentStatus(updatedInvoice.totalFils, allocatedFils, updatedInvoice.dueDate);
    await tx.invoice.update({
      where: { id: invoiceId },
      data: { paymentStatus: newStatus },
    });
  }
}
