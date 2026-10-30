import type { Invoice, InvoiceDirection, JournalEntry } from "@/generated/prisma/client";
import type { Tx } from "@/lib/tx";
import { createInvoice, voidInvoiceWithReversal, type InvoiceLineInput } from "@/lib/invoices";
import { lockInvoices } from "@/lib/payments";

export interface ReviseInvoiceUpdates {
  /** New invoice date. The reversal of the ORIGINAL is dated to the original's own
   * date so the correction nets out inside the original period (P1.1 semantics). */
  date: Date;
  notes?: string | null;
  dueDate?: Date;
  paymentTerms?: number;
  purchaseOrder?: string;
  deliveryNote?: string;
  deliveryNoteDate?: Date;
  vehicleNo?: string;
  modeOfPayment?: string;
  termsOfDelivery?: string;
  /** Same shape as createInvoice lines; recomputed server-side, never trusted. */
  lines: InvoiceLineInput[];
  // supplierRef is intentionally NOT updatable: the per-vendor partial unique
  // guard (P1.7) keeps the ORIGINAL row's reference reserved even when VOID.
}

export interface RevisePostedInvoiceInput {
  originalInvoiceId: string;
  /** Must match the original's direction — guards the module permission check
   * against a caller passing the other direction's module. */
  direction: InvoiceDirection;
  /** Mandatory audit reason (trimmed, 1..2000 chars after the void prefix). */
  reason: string;
  updates: ReviseInvoiceUpdates;
  createdById: string;
  /** AuditLog.userEmail; falls back to createdById (pdc-actions precedent). */
  createdByEmail?: string;
  tx: Tx;
}

export interface RevisePostedInvoiceResult {
  /** The original, now VOID (re-fetch inside the tx). */
  originalInvoice: Invoice;
  /** The new POSTED revision (re-fetch inside the tx, so journalEntryId is set). */
  newInvoice: Invoice;
  /** The mirrored reversal entry posted for the original (null only if DRAFT — unreachable here). */
  reversal: JournalEntry | null;
}

const VOID_REASON_PREFIX = "Superseded by revision — ";

/**
 * P3.2 amend flow. A POSTED invoice is NEVER mutated: the original is reversed
 * via voidInvoiceWithReversal (P1.1) and flipped to VOID, and a NEW POSTED
 * invoice is created with revisesInvoiceId + revisionNumber+1. Party and
 * direction are copied from the original (callers cannot change them).
 *
 * Everything — reverse, create, audit — happens in ONE transaction, so an
 * abandoned amendment can never leave a reversed original without a
 * replacement (the two-phase UI only redirects; nothing is voided until this
 * function runs at final submit).
 *
 * Lock order (LEDGER): invoice rows (via lockInvoices) -> journal entry rows
 * (inside reverseJournalEntry) -> Serial (inside createInvoice).
 * Validation is re-read UNDER the lock. D11: allocations from VOID payments
 * do not block; any ACTIVE allocation does (voidInvoiceWithReversal enforces).
 */
export async function revisePostedInvoice(input: RevisePostedInvoiceInput): Promise<RevisePostedInvoiceResult> {
  const reason = input.reason?.trim() ?? "";
  if (!reason) throw new Error("A non-blank amendment reason is required");
  const voidReason = `${VOID_REASON_PREFIX}${reason}`;
  // voidInvoiceWithReversal caps its own reason at 2000; validate the COMBINED
  // narration here so the failure surfaces before anything is written.
  if (voidReason.length > 2000) throw new Error("Reason must be at most 2000 characters");
  if (!input.updates?.lines?.length) throw new Error("An invoice needs at least one line");

  // Lock FIRST, before any status read (P1.2 pattern). voidInvoiceWithReversal
  // re-locks the same rows (no-op — already held by this tx) and re-validates.
  await lockInvoices(input.tx, [input.originalInvoiceId]);

  const original = await input.tx.invoice.findUnique({
    where: { id: input.originalInvoiceId },
  });
  if (!original) throw new Error("Invoice not found");
  if (original.direction !== input.direction) throw new Error("Invoice not found");
  if (original.revisesInvoiceId) {
    throw new Error(
      `Invoice ${original.invoiceNo} is already a revision — amend the original invoice instead`,
    );
  }
  if (original.status === "DRAFT") {
    throw new Error(
      `Invoice ${original.invoiceNo} is a draft — edit it directly instead of amending`,
    );
  }
  if (original.status !== "POSTED") {
    throw new Error(`Invoice ${original.invoiceNo} is ${original.status} and cannot be amended`);
  }

  // 1. Reverse the original (P1.1) and flip it to VOID. Dated to the ORIGINAL
  // invoice date so the correction stays in the original period; reverseJournalEntry
  // re-validates (OPEN FY covering that date, target POSTED, not already reversed,
  // no ACTIVE payment allocations).
  const reversal = await voidInvoiceWithReversal({
    invoiceId: original.id,
    reason: voidReason,
    date: original.date,
    createdById: input.createdById,
    tx: input.tx,
  });

  // 2. Create the replacement as a normal POSTED invoice (posts its own journal
  // entry, derives totals server-side) linked back to the original.
  const created = await createInvoice({
    tx: input.tx,
    direction: original.direction,
    date: input.updates.date,
    partyId: original.partyId,
    notes: input.updates.notes ?? undefined,
    dueDate: input.updates.dueDate,
    paymentTerms: input.updates.paymentTerms,
    purchaseOrder: input.updates.purchaseOrder,
    deliveryNote: input.updates.deliveryNote,
    deliveryNoteDate: input.updates.deliveryNoteDate,
    vehicleNo: input.updates.vehicleNo,
    modeOfPayment: input.updates.modeOfPayment,
    termsOfDelivery: input.updates.termsOfDelivery,
    lines: input.updates.lines,
    createdById: input.createdById,
    revisesInvoiceId: original.id,
    revisionNumber: original.revisionNumber + 1,
  });

  // createInvoice returns the pre-journal-linkage object on the SALES branch
  // (known quirk — see voiding tests): refetch both rows so callers see final state.
  const newInvoice = await input.tx.invoice.findUniqueOrThrow({ where: { id: created.id } });
  const voidedOriginal = await input.tx.invoice.findUniqueOrThrow({ where: { id: original.id } });

  // 3. Audit INSIDE the tx (pdc-actions precedent): an amendment without its
  // audit record must not commit — the trail is part of the transaction.
  await input.tx.auditLog.create({
    data: {
      userId: input.createdById,
      userEmail: input.createdByEmail ?? input.createdById,
      action: "INVOICE_REVISE",
      entityType: "Invoice",
      entityId: original.id,
      detail:
        `Revised ${original.direction} invoice ${original.invoiceNo} (rev ${original.revisionNumber}) ` +
        `via reversal ${reversal?.entryNo ?? "n/a"} into ${newInvoice.invoiceNo} ` +
        `(rev ${newInvoice.revisionNumber}, ${newInvoice.id}) - reason: ${reason}`,
    },
  });

  return { originalInvoice: voidedOriginal, newInvoice, reversal };
}
