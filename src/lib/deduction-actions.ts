import { prisma } from "@/lib/db";
import type { Tx } from "@/lib/tx";
import { postJournalEntry, reverseJournalEntry } from "@/lib/accounting";
import { derivePaymentStatus } from "@/lib/invoice-status";
import { vatForLine } from "@/lib/money";
import type { DeductionReason } from "@/generated/prisma/enums";

const AR_CODE = "1130";
const AP_CODE = "2100";
// D1: single VAT account for both directions (chart of accounts has one
// 2150 "VAT Payable (FTA)" — SALES debit reduces the payable, PURCHASE
// credit reduces the receivable position in the same account).
const VAT_CODE = "2150";
const SALES_DEDUCTION_EXPENSE_CODE = "5700";
const PURCHASE_DEDUCTION_INCOME_CODE = "5800";

/**
 * D1: invoice-level effective VAT rate as a fraction (e.g. 0.05), rounded
 * half-up to 4 decimals to fit Decimal(5, 4). Zero for RCM/zero-VAT invoices.
 */
export function effectiveInvoiceVatRate(subtotalFils: bigint, vatFils: bigint): number {
  if (subtotalFils <= 0n) return 0;
  return Math.round((Number(vatFils) / Number(subtotalFils)) * 10000) / 10000;
}

export interface CreateDeductionInput {
  tx: Tx;
  invoiceId: string;
  reason: DeductionReason;
  /** D1: VAT-exclusive base amount entered by the user. */
  baseAmountFils: bigint;
  /** Optional rate override (fraction, e.g. 0.05); defaults to the invoice's effective rate. */
  vatRate?: number | null;
  notes?: string | null;
  createdById: string;
  createdByEmail?: string | null;
}

export async function createDeduction(input: CreateDeductionInput) {
  const { tx, invoiceId, reason, baseAmountFils, notes, createdById } = input;

  if (baseAmountFils <= 0n) throw new Error("Deduction base amount must be positive");

  const invoice = await tx.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      allocations: { include: { payment: { select: { status: true } } } },
      deductions: true,
    },
  });
  if (!invoice) throw new Error("Invoice not found");
  if (invoice.status !== "POSTED") throw new Error("Only posted invoices can be deducted");

  // D1: rate = explicit override when given, else the invoice's effective rate.
  const vatRate = normalizeRate(input.vatRate) ?? effectiveInvoiceVatRate(invoice.subtotalFils, invoice.vatFils);
  const vatFils = vatForLine(baseAmountFils, vatRate);
  const totalFils = baseAmountFils + vatFils;

  const allocatedFils = invoice.allocations
    .filter((a) => a.payment.status !== "VOID")
    .reduce((acc, a) => acc + a.amountFils, 0n);
  const priorDeductions = invoice.deductions.reduce((acc, d) => acc + d.totalFils, 0n);
  const outstanding = invoice.totalFils - allocatedFils - priorDeductions;
  if (totalFils > outstanding) {
    throw new Error("Deduction exceeds the invoice outstanding balance");
  }

  const deduction = await tx.invoiceDeduction.create({
    data: {
      invoiceId,
      reason,
      baseAmountFils,
      vatRate,
      vatFils,
      totalFils,
      notes: notes && notes.trim() ? notes.trim() : null,
      createdById,
    },
  });

  const journalEntry = await postDeductionEntry({
    tx,
    invoice,
    reason,
    baseAmountFils,
    vatFils,
    totalFils,
    deductionId: deduction.id,
    createdById,
  });

  await tx.invoiceDeduction.update({
    where: { id: deduction.id },
    data: { journalEntryId: journalEntry.id },
  });

  const netSettled = allocatedFils + priorDeductions + totalFils;
  const newStatus = derivePaymentStatus(invoice.totalFils, netSettled, invoice.dueDate);
  await tx.invoice.update({
    where: { id: invoice.id },
    data: { paymentStatus: newStatus },
  });

  // Audit INSIDE the tx (pdc-actions / P3.2 precedent): a deduction without its
  // audit record must not commit.
  await tx.auditLog.create({
    data: {
      userId: createdById,
      userEmail: input.createdByEmail ?? createdById,
      action: "DEDUCTION_POSTED",
      entityType: "InvoiceDeduction",
      entityId: deduction.id,
      detail:
        `Posted ${invoice.direction} deduction ${reason} on ${invoice.invoiceNo}: ` +
        `base ${baseAmountFils} fils @ ${(vatRate * 100).toFixed(2)}% -> VAT ${vatFils} fils, total ${totalFils} fils (JE ${journalEntry.entryNo})`,
    },
  });

  const updated = await tx.invoiceDeduction.findUnique({
    where: { id: deduction.id },
    include: { invoice: { select: { id: true, invoiceNo: true, status: true, paymentStatus: true } } },
  });

  return { deduction: updated, journalEntry };
}

export interface UpdateDeductionInput {
  tx: Tx;
  invoiceId: string;
  deductionId: string;
  reason: DeductionReason;
  /** D1: new VAT-exclusive base amount. */
  baseAmountFils: bigint;
  /** Optional rate override; defaults to the invoice's effective rate. */
  vatRate?: number | null;
  notes?: string | null;
  createdById: string;
  createdByEmail?: string | null;
}

export async function updateDeduction(input: UpdateDeductionInput) {
  const { tx, invoiceId, deductionId, reason, baseAmountFils, notes, createdById } = input;

  if (baseAmountFils <= 0n) throw new Error("Deduction base amount must be positive");

  const invoice = await tx.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      allocations: { include: { payment: { select: { status: true } } } },
      deductions: true,
    },
  });
  if (!invoice) throw new Error("Invoice not found");
  if (invoice.status !== "POSTED") throw new Error("Only posted invoices can be deducted");

  const deduction = await tx.invoiceDeduction.findUnique({
    where: { id: deductionId },
    include: { invoice: { select: { id: true } } },
  });
  if (!deduction || deduction.invoiceId !== invoiceId) throw new Error("Deduction not found");

  const vatRate = normalizeRate(input.vatRate) ?? effectiveInvoiceVatRate(invoice.subtotalFils, invoice.vatFils);
  const vatFils = vatForLine(baseAmountFils, vatRate);
  const totalFils = baseAmountFils + vatFils;

  const allocatedFils = invoice.allocations
    .filter((a) => a.payment.status !== "VOID")
    .reduce((acc, a) => acc + a.amountFils, 0n);
  const priorDeductions = invoice.deductions
    .filter((d) => d.id !== deduction.id)
    .reduce((acc, d) => acc + d.totalFils, 0n);
  const outstanding = invoice.totalFils - allocatedFils - priorDeductions;
  if (totalFils > outstanding) {
    throw new Error("Deduction exceeds the invoice outstanding balance");
  }

  const trimmed = notes && notes.trim() ? notes.trim() : null;

  if (deduction.journalEntryId) {
    await reverseJournalEntry({
      entryId: deduction.journalEntryId,
      reason: `Edit of deduction ${deduction.id}`,
      date: invoice.date,
      createdById,
      tx,
    });
  }

  await tx.invoiceDeduction.update({
    where: { id: deduction.id },
    data: { reason, baseAmountFils, vatRate, vatFils, totalFils, notes: trimmed },
  });

  const journalEntry = await postDeductionEntry({
    tx,
    invoice,
    reason,
    baseAmountFils,
    vatFils,
    totalFils,
    deductionId: deduction.id,
    createdById,
  });

  await tx.invoiceDeduction.update({
    where: { id: deduction.id },
    data: { journalEntryId: journalEntry.id },
  });

  const netSettled = allocatedFils + priorDeductions + totalFils;
  const newStatus = derivePaymentStatus(invoice.totalFils, netSettled, invoice.dueDate);
  await tx.invoice.update({
    where: { id: invoice.id },
    data: { paymentStatus: newStatus },
  });

  await tx.auditLog.create({
    data: {
      userId: createdById,
      userEmail: input.createdByEmail ?? createdById,
      action: "DEDUCTION_UPDATED",
      entityType: "InvoiceDeduction",
      entityId: deduction.id,
      detail:
        `Updated ${invoice.direction} deduction ${reason} on ${invoice.invoiceNo}: ` +
        `base ${baseAmountFils} fils @ ${(vatRate * 100).toFixed(2)}% -> VAT ${vatFils} fils, total ${totalFils} fils (JE ${journalEntry.entryNo})`,
    },
  });

  const updated = await tx.invoiceDeduction.findUnique({
    where: { id: deduction.id },
    include: { invoice: { select: { id: true, invoiceNo: true, status: true, paymentStatus: true } } },
  });

  return { deduction: updated, journalEntry };
}

function normalizeRate(rate: number | null | undefined): number | null {
  if (rate === undefined || rate === null || Number.isNaN(rate) || rate < 0) return null;
  return Math.round(rate * 10000) / 10000;
}

/**
 * D1 balanced JE adjusting Base + VAT + AR/AP. A zero VAT leg (RCM /
 * zero-rate invoices, or legacy backfilled rows) is omitted so the entry
 * stays two lines, exactly like the pre-D1 posting.
 */
async function postDeductionEntry(
  input: Pick<CreateDeductionInput, "tx" | "createdById"> & {
    invoice: { id: string; invoiceNo: string; direction: string; partyId: string; date: Date };
    reason: DeductionReason;
    baseAmountFils: bigint;
    vatFils: bigint;
    totalFils: bigint;
    deductionId: string;
  }
) {
  const { tx, invoice, reason, baseAmountFils, vatFils, totalFils, deductionId, createdById } = input;

  const ar = await tx.account.findUnique({ where: { code: AR_CODE } });
  const ap = await tx.account.findUnique({ where: { code: AP_CODE } });
  const vat = await tx.account.findUnique({ where: { code: VAT_CODE } });
  const salesDeductionExpense = await tx.account.findUnique({ where: { code: SALES_DEDUCTION_EXPENSE_CODE } });
  const purchaseDeductionIncome = await tx.account.findUnique({ where: { code: PURCHASE_DEDUCTION_INCOME_CODE } });
  if (!ar || !ap || !vat || !salesDeductionExpense || !purchaseDeductionIncome) {
    throw new Error("Required accounts for deduction posting are missing (57xx/58xx/2150)");
  }

  const desc = `Debit Note ${invoice.invoiceNo}`;
  const lines =
    invoice.direction === "SALES"
      ? [
          { accountId: salesDeductionExpense.id, debit: baseAmountFils, description: desc },
          ...(vatFils > 0n ? [{ accountId: vat.id, debit: vatFils, description: `${desc} VAT` }] : []),
          { accountId: ar.id, credit: totalFils, partyId: invoice.partyId, description: desc },
        ]
      : [
          { accountId: ap.id, debit: totalFils, partyId: invoice.partyId, description: desc },
          { accountId: purchaseDeductionIncome.id, credit: baseAmountFils, description: desc },
          ...(vatFils > 0n ? [{ accountId: vat.id, credit: vatFils, description: `${desc} VAT` }] : []),
        ];

  return postJournalEntry({
    tx,
    date: invoice.date,
    narration: `Debit Note ${invoice.invoiceNo}: ${reason} - deduction ${deductionId}`,
    sourceType: "MANUAL",
    sourceId: deductionId,
    createdById,
    lines,
  });
}
