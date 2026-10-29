import { prisma } from "@/lib/db";
import { derivePaymentStatus } from "@/lib/invoice-status";

export interface AgingBucket {
  current: bigint;      // 0-30 days
  days31to60: bigint;   // 31-60 days
  days61to90: bigint;   // 61-90 days
  over90: bigint;       // 90+ days
  total: bigint;
}

/**
 * Calculate aging buckets for a party's outstanding invoices.
 * Computes paymentStatus on-the-fly for accuracy.
 */
export async function calculateAgingBuckets(partyId: string): Promise<AgingBucket> {
  const invoices = await prisma.invoice.findMany({
    where: { partyId, status: "POSTED" },
    include: {
      allocations: {
        where: { payment: { status: "POSTED" } },
        select: { amountFils: true },
      },
    },
  });

  const now = new Date();
  const buckets: AgingBucket = {
    current: 0n,
    days31to60: 0n,
    days61to90: 0n,
    over90: 0n,
    total: 0n,
  };

  for (const invoice of invoices) {
    const allocatedFils = invoice.allocations.reduce((sum, a) => sum + a.amountFils, 0n);
    const status = derivePaymentStatus(invoice.totalFils, allocatedFils, invoice.dueDate);
    
    // Only count UNPAID, PARTIAL, OVERDUE (not PAID)
    if (status === "PAID") continue;

    const outstanding = invoice.totalFils - allocatedFils;
    if (outstanding <= 0n) continue;

    // Calculate days past due
    if (!invoice.dueDate) {
      // No due date = current
      buckets.current += outstanding;
    } else {
      const daysPastDue = Math.floor((now.getTime() - invoice.dueDate.getTime()) / (1000 * 60 * 60 * 24));
      
      if (daysPastDue <= 0) {
        buckets.current += outstanding;
      } else if (daysPastDue <= 30) {
        buckets.current += outstanding;
      } else if (daysPastDue <= 60) {
        buckets.days31to60 += outstanding;
      } else if (daysPastDue <= 90) {
        buckets.days61to90 += outstanding;
      } else {
        buckets.over90 += outstanding;
      }
    }

    buckets.total += outstanding;
  }

  return buckets;
}