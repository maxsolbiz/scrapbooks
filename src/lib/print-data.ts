import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

export type PrintDirection = "SALES" | "PURCHASE";

/**
 * Single source of truth for the relations the print templates need:
 * line items, party snapshot fields, deductions (P2.6), and revision
 * lineage (P3.2/P3.3) — revisionNumber/revisesInvoiceId scalars already
 * ride along on every Invoice select.
 */
export function printInvoiceInclude() {
  return {
    lines: { orderBy: { id: "asc" as const } },
    party: {
      select: {
        nameEn: true,
        nameAr: true,
        trn: true,
        addressEn: true,
        addressAr: true,
        phone: true,
        email: true,
      },
    },
    deductions: { orderBy: { createdAt: "asc" as const } },
    revisesInvoice: { select: { invoiceNo: true } },
    revisedBy: {
      select: { invoiceNo: true },
      orderBy: { revisionNumber: "desc" as const },
      take: 1,
    },
  } satisfies Prisma.InvoiceInclude;
}

export async function getPrintInvoice(id: string, direction: PrintDirection) {
  return prisma.invoice.findFirst({
    where: { id, direction },
    include: printInvoiceInclude(),
  });
}
