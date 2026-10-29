import { InvoicePaymentStatus } from "@/generated/prisma/client";

export function derivePaymentStatus(
  totalFils: bigint,
  allocatedFils: bigint,
  dueDate: Date | null,
): InvoicePaymentStatus {
  if (allocatedFils >= totalFils) return "PAID";

  const isOverdue = dueDate && new Date() > dueDate;
  if (allocatedFils === 0n) {
    return isOverdue ? "OVERDUE" : "UNPAID";
  }

  return isOverdue ? "OVERDUE" : "PARTIAL";
}
