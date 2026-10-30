import { prisma } from "@/lib/db";
import type { Tx } from "@/lib/tx";
import { postJournalEntry, reverseJournalEntry } from "@/lib/accounting";
import { AuditLog } from "@/generated/prisma/client";

const PDC_RECEIVABLE_CODE = "1150";
const PDC_PAYABLE_CODE = "2150";
const BANK_CODE = "1120";

export interface ClearPDCInput {
  paymentId: string;
  clearedDate: Date;
  bankAccountId: string;
  createdById: string;
  tx: Tx;
}

export interface BouncePDCInput {
  paymentId: string;
  bounceDate: Date;
  reason: string;
  bankFeeFils?: bigint;
  createdById: string;
  tx: Tx;
}

export async function clearPDC(input: ClearPDCInput) {
  const { paymentId, clearedDate, bankAccountId, createdById, tx } = input;

  const payment = await tx.payment.findUnique({
    where: { id: paymentId },
    include: { journalEntry: true },
  });
  if (!payment) throw new Error("Payment not found");
  if (payment.method !== "PDC_IN" && payment.method !== "PDC_OUT") {
    throw new Error("Only PDC payments can be cleared");
  }
  if (payment.pdcStatus !== "PENDING") {
    throw new Error(`PDC status is ${payment.pdcStatus} — only PENDING can be cleared`);
  }

  const pdcAccountCode = payment.method === "PDC_IN" ? PDC_RECEIVABLE_CODE : PDC_PAYABLE_CODE;
  const pdcAccount = await tx.account.findUnique({ where: { code: pdcAccountCode } });
  const bankAccount = await tx.account.findUnique({ where: { id: bankAccountId } });
  if (!pdcAccount || !bankAccount) {
    throw new Error("PDC or bank account not found");
  }

  // Create journal entry: move from PDC account to bank
  const je = await postJournalEntry({
    tx,
    date: clearedDate,
    narration: `PDC Cleared: ${payment.paymentNo}`,
    sourceType: "PAYMENT",
    sourceId: paymentId,
    createdById,
    lines: [
      { accountId: bankAccount.id, debit: payment.amountFils },
      { accountId: pdcAccount.id, credit: payment.amountFils },
    ],
  });

  await tx.payment.update({
    where: { id: paymentId },
    data: {
      pdcStatus: "CLEARED",
      clearanceDate: clearedDate,
    },
  });

  await tx.auditLog.create({
    data: {
      userEmail: createdById,
      action: "CLEAR_PDC",
      entityType: "Payment",
      entityId: paymentId,
      detail: `PDC ${payment.paymentNo} cleared to bank ${bankAccount.code} on ${clearedDate.toISOString()}`,
    },
  });

  return { journalEntry: je, paymentId };
}

export async function bouncePDC(input: BouncePDCInput) {
  const { paymentId, bounceDate, reason, bankFeeFils, createdById, tx } = input;
  if (!reason || reason.trim().length === 0) throw new Error("Bounce reason is required");
  if (reason.length > 2000) throw new Error("Reason must be at most 2000 characters");

  const payment = await tx.payment.findUnique({
    where: { id: paymentId },
    include: { allocations: true, journalEntry: true },
  });
  if (!payment) throw new Error("Payment not found");
  if (payment.method !== "PDC_IN" && payment.method !== "PDC_OUT") {
    throw new Error("Only PDC payments can be bounced");
  }
  if (payment.pdcStatus !== "PENDING") {
    throw new Error(`PDC status is ${payment.pdcStatus} — only PENDING can be bounced`);
  }

  // Reverse invoice allocations if any
  if (payment.allocations.length > 0) {
    for (const alloc of payment.allocations) {
      await tx.paymentAllocation.deleteMany({
        where: { paymentId, invoiceId: alloc.invoiceId },
      });
    }
  }

  // Reverse the original journal entry (PDC was posted, not cleared yet)
  if (payment.journalEntryId) {
    await reverseJournalEntry({
      entryId: payment.journalEntryId,
      reason: `PDC Bounced: ${reason}`,
      date: bounceDate,
      createdById,
      tx,
    });
  }

  // Optional bank fee journal entry
  if (bankFeeFils && bankFeeFils > 0n) {
    const feeAccount = await tx.account.findUnique({ where: { code: "6200" } }); // bank fees expense
    const bankAccount = await tx.account.findUnique({ where: { code: BANK_CODE } });
    if (feeAccount && bankAccount) {
      await postJournalEntry({
        tx,
        date: bounceDate,
        narration: `Bank fee for bounced PDC ${payment.paymentNo}`,
        sourceType: "MANUAL",
        sourceId: paymentId,
        createdById,
        lines: [
          { accountId: feeAccount.id, debit: bankFeeFils },
          { accountId: bankAccount.id, credit: bankFeeFils },
        ],
      });
    }
  }

  await tx.payment.update({
    where: { id: paymentId },
    data: { pdcStatus: "BOUNCED", notes: `${payment.notes ?? ""}\nBounced on ${bounceDate.toISOString()}: ${reason}`.trim() },
  });

  await tx.auditLog.create({
    data: {
      userEmail: createdById,
      action: "BOUNCE_PDC",
      entityType: "Payment",
      entityId: paymentId,
      detail: `PDC ${payment.paymentNo} bounced: ${reason}${bankFeeFils ? ` (fee ${bankFeeFils})` : ""}`,
    },
  });

  return { paymentId, bounced: true };
}
