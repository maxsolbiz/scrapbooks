import { prisma } from "@/lib/db";
import type { Tx } from "@/lib/tx";
import { postJournalEntry, reverseJournalEntry } from "@/lib/accounting";
import { derivePaymentStatus } from "@/lib/invoice-status";
import type { DeductionReason } from "@/generated/prisma/enums";

const AR_CODE = "1130";
const AP_CODE = "2100";
const SALES_DEDUCTION_EXPENSE_CODE = "5700";
const PURCHASE_DEDUCTION_INCOME_CODE = "5800";

export interface CreateDeductionInput {
  tx: Tx;
  invoiceId: string;
  reason: DeductionReason;
  amountFils: bigint;
  notes?: string | null;
  createdById: string;
}

export async function createDeduction(input: CreateDeductionInput) {
  const { tx, invoiceId, reason, amountFils, notes, createdById } = input;

  if (amountFils <= 0n) throw new Error("Deduction amount must be positive");

  const invoice = await tx.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      allocations: { include: { payment: { select: { status: true } } } },
      deductions: true,
    },
  });
  if (!invoice) throw new Error("Invoice not found");
  if (invoice.status !== "POSTED") throw new Error("Only posted invoices can be deducted");

  const allocatedFils = invoice.allocations
    .filter((a) => a.payment.status !== "VOID")
    .reduce((acc, a) => acc + a.amountFils, 0n);
  const priorDeductions = invoice.deductions.reduce((acc, d) => acc + d.amountFils, 0n);
  const outstanding = invoice.totalFils - allocatedFils - priorDeductions;
  if (amountFils > outstanding) {
    throw new Error("Deduction exceeds the invoice outstanding balance");
  }

  const deduction = await tx.invoiceDeduction.create({
    data: {
      invoiceId,
      reason,
      amountFils,
      notes: notes && notes.trim() ? notes.trim() : null,
      createdById,
    },
  });

  const ar = await tx.account.findUnique({ where: { code: AR_CODE } });
  const ap = await tx.account.findUnique({ where: { code: AP_CODE } });
  const salesDeductionExpense = await tx.account.findUnique({ where: { code: SALES_DEDUCTION_EXPENSE_CODE } });
  const purchaseDeductionIncome = await tx.account.findUnique({ where: { code: PURCHASE_DEDUCTION_INCOME_CODE } });
  if (!ar || !ap || !salesDeductionExpense || !purchaseDeductionIncome) {
    throw new Error("Required accounts for deduction posting are missing (57xx/58xx)");
  }

  const journalEntry = await postJournalEntry({
    tx,
    date: invoice.date,
    narration: `Debit Note ${invoice.invoiceNo}: ${reason} — deduction ${deduction.id}`,
    sourceType: "MANUAL",
    sourceId: deduction.id,
    createdById,
    lines:
      invoice.direction === "SALES"
        ? [
            { accountId: salesDeductionExpense.id, debit: amountFils, description: `Debit Note ${invoice.invoiceNo}` },
            { accountId: ar.id, credit: amountFils, partyId: invoice.partyId, description: `Debit Note ${invoice.invoiceNo}` },
          ]
        : [
            { accountId: ap.id, debit: amountFils, partyId: invoice.partyId, description: `Debit Note ${invoice.invoiceNo}` },
            { accountId: purchaseDeductionIncome.id, credit: amountFils, description: `Debit Note ${invoice.invoiceNo}` },
          ],
  });

  await tx.invoiceDeduction.update({
    where: { id: deduction.id },
    data: { journalEntryId: journalEntry.id },
  });

  const netSettled = allocatedFils + priorDeductions + amountFils;
  const newStatus = derivePaymentStatus(invoice.totalFils, netSettled, invoice.dueDate);
  await tx.invoice.update({
    where: { id: invoice.id },
    data: { paymentStatus: newStatus },
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
  amountFils: bigint;
  notes?: string | null;
  createdById: string;
}

export async function updateDeduction(input: UpdateDeductionInput) {
  const { tx, invoiceId, deductionId, reason, amountFils, notes, createdById } = input;

  if (amountFils <= 0n) throw new Error("Deduction amount must be positive");

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

  const allocatedFils = invoice.allocations
    .filter((a) => a.payment.status !== "VOID")
    .reduce((acc, a) => acc + a.amountFils, 0n);
  const priorDeductions = invoice.deductions
    .filter((d) => d.id !== deduction.id)
    .reduce((acc, d) => acc + d.amountFils, 0n);
  const outstanding = invoice.totalFils - allocatedFils - priorDeductions - deduction.amountFils;
  if (amountFils > outstanding) {
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

  const ar = await tx.account.findUnique({ where: { code: AR_CODE } });
  const ap = await tx.account.findUnique({ where: { code: AP_CODE } });
  const salesDeductionExpense = await tx.account.findUnique({ where: { code: SALES_DEDUCTION_EXPENSE_CODE } });
  const purchaseDeductionIncome = await tx.account.findUnique({ where: { code: PURCHASE_DEDUCTION_INCOME_CODE } });
  if (!ar || !ap || !salesDeductionExpense || !purchaseDeductionIncome) {
    throw new Error("Required accounts for deduction posting are missing (57xx/58xx)");
  }

  await tx.invoiceDeduction.update({
    where: { id: deduction.id },
    data: { reason, amountFils, notes: trimmed },
  });

  const journalEntry = await postJournalEntry({
    tx,
    date: invoice.date,
    narration: `Debit Note ${invoice.invoiceNo}: ${reason} - deduction ${deduction.id}`,
    sourceType: "MANUAL",
    sourceId: deduction.id,
    createdById,
    lines:
      invoice.direction === "SALES"
        ? [
            { accountId: salesDeductionExpense.id, debit: amountFils, description: `Debit Note ${invoice.invoiceNo}` },
            { accountId: ar.id, credit: amountFils, partyId: invoice.partyId, description: `Debit Note ${invoice.invoiceNo}` },
          ]
        : [
            { accountId: ap.id, debit: amountFils, partyId: invoice.partyId, description: `Debit Note ${invoice.invoiceNo}` },
            { accountId: purchaseDeductionIncome.id, credit: amountFils, description: `Debit Note ${invoice.invoiceNo}` },
          ],
  });

  await tx.invoiceDeduction.update({
    where: { id: deduction.id },
    data: { journalEntryId: journalEntry.id },
  });

  const netSettled = allocatedFils + priorDeductions + amountFils;
  const newStatus = derivePaymentStatus(invoice.totalFils, netSettled, invoice.dueDate);
  await tx.invoice.update({
    where: { id: invoice.id },
    data: { paymentStatus: newStatus },
  });

  const updated = await tx.invoiceDeduction.findUnique({
    where: { id: deduction.id },
    include: { invoice: { select: { id: true, invoiceNo: true, status: true, paymentStatus: true } } },
  });

  return { deduction: updated, journalEntry };
}