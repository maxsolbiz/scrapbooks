import type { Prisma, InvoiceDirection, UnitType, JournalEntry } from "@/generated/prisma/client";
import type { Tx } from "@/lib/tx";
import type { EntrySource } from "@/generated/prisma/enums";
import { postJournalEntry, voidJournalEntry, reverseJournalEntry } from "@/lib/accounting";
import { multiplyFilsByDecimal } from "@/lib/money";
import { lockInvoices } from "@/lib/payments";

export interface InvoiceLineInput {
  itemId?: string;
  description: string;
  descriptionAr?: string;
  qty: string; // decimal string
  unit: UnitType;
  rateFils: bigint;
  vatRate: number; // fraction, e.g. 0.05
  wbtNo?: string;
}

// Trim; empty -> null. Callers validate the 60-char cap.
function normalizeWbt(value: string | undefined): string | null {
  const v = value?.trim();
  return v ? v : null;
}

export interface CreateInvoiceInput {
  direction: InvoiceDirection;
  date: Date;
  partyId: string;
  notes?: string;
  notesAr?: string;
  supplierRef?: string;
  purchaseOrder?: string;
  deliveryNote?: string;
  deliveryNoteDate?: Date;
  vehicleNo?: string;
  modeOfPayment?: string;
  termsOfDelivery?: string;
  lines: InvoiceLineInput[];
  createdById: string;
  tx: Tx;
}

const AR_CODE = "1130";
const AP_CODE = "2100";
const VAT_CODE = "2150";
const SALES_INCOME_CODE = "4100";
const PURCHASE_EXPENSE_CODE = "5100";

function roundFils(value: bigint, vatRate: number): bigint {
  // vatRate scaled by 10^8 integer math: value * vatRate / 1
  const RATE_SCALE = 100_000_000n;
  const scaled = BigInt(Math.round(vatRate * Number(RATE_SCALE)));
  return (value * scaled) / RATE_SCALE;
}

export async function createInvoice(input: CreateInvoiceInput) {
  const { tx, direction, date, partyId, createdById, lines } = input;

  if (!lines.length) throw new Error("An invoice needs at least one line");

  const party = await tx.party.findUnique({ where: { id: partyId } });
  if (!party) throw new Error("Party not found");
  const typeOk =
    party.type === "BOTH" ||
    (direction === "SALES"
      ? party.type === "CUSTOMER"
      : party.type === "VENDOR");
  if (!typeOk) {
    throw new Error(
      direction === "SALES"
        ? "Party is not a customer"
        : "Party is not a vendor",
    );
  }

  const fiscalYear = await tx.fiscalYear.findFirst({
    where: { starts: { lte: date }, ends: { gte: date } },
  });
  if (!fiscalYear) throw new Error(`No fiscal year covers ${date.toISOString().slice(0, 10)}`);
  if (fiscalYear.status !== "OPEN") throw new Error("Fiscal year is closed");

  // compute line amounts (never trust client totals)
  let subtotal = 0n;
  let vatTotal = 0n;
  const computed = lines.map((line) => {
    const value = multiplyFilsByDecimal(line.rateFils, line.qty);
    const vat = roundFils(value, line.vatRate);
    subtotal += value;
    vatTotal += vat;
    return { ...line, lineValue: value, lineVat: vat, lineTotal: value + vat };
  });
  const total = subtotal + vatTotal;

  const prefix = direction === "SALES" ? "INV" : "PINV";
  const serial = await tx.serial.upsert({
    where: { key: `${fiscalYear.name}:${prefix}` },
    update: { value: { increment: 1 } },
    create: { key: `${fiscalYear.name}:${prefix}`, value: 1 },
  });
  const invoiceNo = `${prefix}-${fiscalYear.name}-${String(serial.value).padStart(4, "0")}`;

  const invoice = await tx.invoice.create({
    data: {
      invoiceNo,
      direction,
      date,
      partyId,
      status: "POSTED",
      trnSnapshot: party.trn,
      subtotalFils: subtotal,
      vatFils: vatTotal,
      totalFils: total,
      notes: input.notes || null,
      notesAr: input.notesAr || null,
      supplierRef: input.supplierRef || null,
      purchaseOrder: input.purchaseOrder || null,
      deliveryNote: input.deliveryNote || null,
      deliveryNoteDate: input.deliveryNoteDate || null,
      vehicleNo: input.vehicleNo || null,
      modeOfPayment: input.modeOfPayment || null,
      termsOfDelivery: input.termsOfDelivery || null,
      createdById,
      lines: {
        create: computed.map((c) => ({
          itemId: c.itemId || null,
          description: c.description,
          descriptionAr: c.descriptionAr || null,
          qty: c.qty,
          unit: c.unit,
          rateFils: c.rateFils,
          vatRate: c.vatRate,
          lineValueFils: c.lineValue,
          lineVatFils: c.lineVat,
          lineTotalFils: c.lineTotal,
          wbtNo: normalizeWbt(c.wbtNo),
        })),
      },
    },
  });

  // --- post the journal ---
  const ar = await tx.account.findUnique({ where: { code: AR_CODE } });
  const ap = await tx.account.findUnique({ where: { code: AP_CODE } });
  const vatAcc = await tx.account.findUnique({ where: { code: VAT_CODE } });
  const income = await tx.account.findUnique({ where: { code: SALES_INCOME_CODE } });
  const expense = await tx.account.findUnique({ where: { code: PURCHASE_EXPENSE_CODE } });
  if (!ar || !ap || !vatAcc || !income || !expense) {
    throw new Error("One or more required control accounts are missing (11xx/21xx/41xx/51xx)");
  }

  const sourceType: EntrySource =
    direction === "SALES" ? "SALES_INVOICE" : "PURCHASE_INVOICE";

  if (direction === "SALES") {
    const je = await postJournalEntry({
      tx,
      date,
      narration: `Sales invoice ${invoiceNo} — ${party.nameEn}`,
      narrationAr: `فاتورة بيع ${invoiceNo} — ${party.nameAr}`,
      sourceType,
      sourceId: invoice.id,
      createdById,
      lines: [
        { accountId: ar.id, debit: total, partyId },
        { accountId: income.id, credit: subtotal },
        // Reverse-charge / 0% VAT invoices have vatTotal === 0n; a zero-value
        // journal line is illegal (assertBalanced), so include the VAT line
        // only when there is VAT to post.
        ...(vatTotal !== 0n ? [{ accountId: vatAcc.id, credit: vatTotal }] : []),
      ],
    });
    await tx.invoice.update({
      where: { id: invoice.id },
      data: { journalEntryId: je.id },
    });
  } else {
    const je = await postJournalEntry({
      tx,
      date,
      narration: `Purchase invoice ${invoiceNo} — ${party.nameEn}`,
      narrationAr: `فاتورة شراء ${invoiceNo} — ${party.nameAr}`,
      sourceType,
      sourceId: invoice.id,
      createdById,
      lines: [
        { accountId: expense.id, debit: subtotal },
        // 0% VAT (reverse-charge) purchases have vatTotal === 0n; omit the
        // zero-value VAT debit line so the journal stays legal.
        ...(vatTotal !== 0n ? [{ accountId: vatAcc.id, debit: vatTotal }] : []),
        { accountId: ap.id, credit: total, partyId },
      ],
    });
    // keep the returned object in sync with the journal linkage (callers read journalEntryId)
    return tx.invoice.update({
      where: { id: invoice.id },
      data: { journalEntryId: je.id },
    });
  }

  return invoice;
}

export function invoiceWhereFilter(direction: InvoiceDirection): Prisma.InvoiceWhereInput {
  return { direction };
}

export interface VoidInvoiceWithReversalInput {
  invoiceId: string;
  /** mandatory; appended to the reversal narration inside the tx */
  reason: string;
  /** caller-resolved reversal date (default today in Asia/Dubai at the ACTION layer) */
  date: Date;
  createdById: string;
  tx: Tx;
}

/**
 * P1.1 reversal-based void. NEW function — legacy callers keep using voidInvoice.
 * Lock order: invoice rows (sorted) -> journal entry rows (inside reverseJournalEntry).
 * Validation is re-read UNDER the lock. D11: allocations from VOID payments do not block.
 */
export async function voidInvoiceWithReversal(input: VoidInvoiceWithReversalInput): Promise<JournalEntry | null> {
  const { invoiceId, date, createdById } = input;
  const reason = input.reason?.trim() ?? "";
  if (!reason) throw new Error("A non-blank reason is required");
  if (reason.length > 2000) throw new Error("Reason must be at most 2000 characters");

  // Lock FIRST, before any status/allocation read (P1.2 pattern).
  await lockInvoices(input.tx, [invoiceId]);

  const invoice = await input.tx.invoice.findUnique({
    where: { id: invoiceId },
    include: { allocations: { include: { payment: { select: { status: true } } } } },
  });
  if (!invoice) throw new Error("Invoice not found");
  if (invoice.status === "VOID") throw new Error(`Invoice ${invoice.invoiceNo} is already void`);
  if (invoice.status === "DRAFT") {
    // DRAFT has no journal entry: voiding without a reversal is correct here.
    if (invoice.journalEntryId) {
      await voidJournalEntry(invoice.journalEntryId, input.tx);
    }
    await input.tx.invoice.update({
      where: { id: invoiceId },
      data: { status: "VOID" },
    });
    return null; // no reversal entry for a DRAFT void
  }
  if (invoice.status !== "POSTED") throw new Error(`Invoice ${invoice.invoiceNo} has an unexpected status ${invoice.status}`);
  // D11: only allocations from non-VOID payments block voiding.
  const activeAllocations = invoice.allocations.filter((a) => a.payment.status !== "VOID");
  if (activeAllocations.length > 0) {
    throw new Error("Invoice has payment allocations — remove them first");
  }
  if (!invoice.journalEntryId) {
    throw new Error(`Invoice ${invoice.invoiceNo} has no journal entry to reverse`);
  }
  // Reverses the entry (or throws, e.g. closed FY) BEFORE the status flip, so the
  // invoice stays POSTED if the reversal is impossible. Whole thing is one tx.
  const reversal = await reverseJournalEntry({
    entryId: invoice.journalEntryId,
    reason,
    date,
    createdById,
    tx: input.tx,
  });
  await input.tx.invoice.update({ where: { id: invoiceId }, data: { status: "VOID" } });
  return reversal;
}
