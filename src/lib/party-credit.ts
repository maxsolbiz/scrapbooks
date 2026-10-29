import { prisma } from "@/lib/db";
import type { Tx } from "@/lib/tx";

/**
 * Calculate available credit for a party.
 * Available credit = sum of (payment.amountFils - allocated amount) for all POSTED payments.
 * Positive = customer has credit; Negative = customer owes money (outstanding invoices).
 */
export async function partyCreditBalance(partyId: string, tx?: Tx): Promise<bigint> {
  const client = tx ?? prisma;
  
  // Sum of all POSTED payment amounts for this party
  const totalPayments = await client.payment.aggregate({
    where: { partyId, status: "POSTED" },
    _sum: { amountFils: true },
  });

  // Sum of all allocations from this party's payments
  const totalAllocated = await client.paymentAllocation.aggregate({
    where: { payment: { partyId, status: "POSTED" } },
    _sum: { amountFils: true },
  });

  const payments = totalPayments._sum.amountFils ?? 0n;
  const allocated = totalAllocated._sum.amountFils ?? 0n;

  return payments - allocated;
}

/**
 * Get list of unallocated payments for a party (FIFO by date).
 * Returns payments with their remaining unallocated amount.
 */
export async function getUnallocatedPayments(partyId: string, tx?: Tx) {
  const client = tx ?? prisma;
  
  const payments = await client.payment.findMany({
    where: { partyId, status: "POSTED" },
    include: {
      allocations: { select: { amountFils: true } },
    },
    orderBy: { date: "asc" }, // FIFO
  });

  return payments
    .map((p) => {
      const allocated = p.allocations.reduce((sum, a) => sum + a.amountFils, 0n);
      const remaining = p.amountFils - allocated;
      return { ...p, remaining };
    })
    .filter((p) => p.remaining > 0n);
}