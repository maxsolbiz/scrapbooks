import { prisma } from "@/lib/db";
import { calculateAgingBuckets } from "@/lib/aging";
import { partyCreditBalance } from "@/lib/party-credit";
import { derivePaymentStatus } from "@/lib/invoice-status";

export interface PartyStatement {
  party: {
    id: string;
    code: string;
    nameEn: string;
    nameAr: string;
    type: string;
  };
  summary: {
    totalInvoiced: bigint;
    totalPaid: bigint;
    outstanding: bigint;
    availableCredit: bigint;
  };
  aging: Awaited<ReturnType<typeof calculateAgingBuckets>>;
  transactions: Array<{
    type: "invoice" | "payment";
    date: Date;
    documentNo: string;
    amount: bigint;
    allocated: bigint;
    outstanding: bigint;
    status: string;
  }>;
}

/**
 * Generate a full statement for a party.
 */
export async function partyStatement(partyId: string): Promise<PartyStatement> {
  const party = await prisma.party.findUniqueOrThrow({ where: { id: partyId } });

  // Get all invoices
  const invoices = await prisma.invoice.findMany({
    where: { partyId, status: "POSTED" },
    include: {
      allocations: {
        where: { payment: { status: "POSTED" } },
        select: { amountFils: true },
      },
    },
    orderBy: { date: "asc" },
  });

  // Get all payments
  const payments = await prisma.payment.findMany({
    where: { partyId, status: "POSTED" },
    include: {
      allocations: { select: { invoiceId: true, amountFils: true } },
    },
    orderBy: { date: "asc" },
  });

  // Calculate totals
  const totalInvoiced = invoices.reduce((sum, inv) => sum + inv.totalFils, 0n);
  const totalPaid = payments.reduce((sum, pay) => sum + pay.amountFils, 0n);
  const outstanding = totalInvoiced - totalPaid;
  const availableCredit = await partyCreditBalance(partyId);

  // Calculate aging
  const aging = await calculateAgingBuckets(partyId);

  // Build transaction history
  const transactions: PartyStatement["transactions"] = [];

  for (const invoice of invoices) {
    const allocatedFils = invoice.allocations.reduce((sum, a) => sum + a.amountFils, 0n);
    const status = derivePaymentStatus(invoice.totalFils, allocatedFils, invoice.dueDate);
    transactions.push({
      type: "invoice",
      date: invoice.date,
      documentNo: invoice.invoiceNo,
      amount: invoice.totalFils,
      allocated: allocatedFils,
      outstanding: invoice.totalFils - allocatedFils,
      status,
    });
  }

  for (const payment of payments) {
    const allocatedFils = payment.allocations.reduce((sum, a) => sum + a.amountFils, 0n);
    transactions.push({
      type: "payment",
      date: payment.date,
      documentNo: payment.paymentNo,
      amount: payment.amountFils,
      allocated: allocatedFils,
      outstanding: payment.amountFils - allocatedFils,
      status: allocatedFils === payment.amountFils ? "fully allocated" : "unallocated",
    });
  }

  // Sort by date
  transactions.sort((a, b) => a.date.getTime() - b.date.getTime());

  return {
    party: {
      id: party.id,
      code: party.code,
      nameEn: party.nameEn,
      nameAr: party.nameAr,
      type: party.type,
    },
    summary: {
      totalInvoiced,
      totalPaid,
      outstanding,
      availableCredit,
    },
    aging: await calculateAgingBuckets(partyId),
    transactions,
  };
}