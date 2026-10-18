"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireModule } from "@/lib/guard";
import { logAudit } from "@/lib/audit";
import { decimalStringToFils } from "@/lib/money";
import { createInvoice, voidInvoice } from "@/lib/invoices";
import type { InvoiceDirection, UnitType } from "@/generated/prisma/client";

function directionModule(direction: InvoiceDirection) {
  return direction === "SALES" ? "sales-invoices" : "purchase-invoices";
}

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

const lineSchema = z.object({
  itemId: z.string().optional(),
  description: z.string().min(1),
  descriptionAr: z.string().optional(),
  qty: z.string().min(1),
  unit: z.enum(["KG", "TON", "PCS", "BAG", "OTHER"]),
  rate: z.string().min(1),
  vatRate: z.string().min(1),
});

const invoiceSchema = z.object({
  date: z.string().min(1),
  partyId: z.string().min(1),
  notes: z.string().optional(),
  notesAr: z.string().optional(),
  lines: z.array(lineSchema).min(1, "At least one line"),
});

export async function createInvoiceAction(
  direction: InvoiceDirection,
  input: z.input<typeof invoiceSchema>,
): Promise<ActionResult<{ id: string; invoiceNo: string }>> {
  const user = await requireModule(directionModule(direction), "write");
  const parsed = invoiceSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const v = parsed.data;
  try {
    const invoice = await prisma.$transaction(async (tx) =>
      createInvoice({
        tx,
        direction,
        date: new Date(v.date),
        partyId: v.partyId,
        notes: v.notes,
        notesAr: v.notesAr,
        createdById: user.id,
        lines: v.lines.map((l) => ({
          itemId: l.itemId || undefined,
          description: l.description,
          descriptionAr: l.descriptionAr || undefined,
          qty: l.qty,
          unit: l.unit as UnitType,
          rateFils: decimalStringToFils(l.rate),
          vatRate: (() => {
            const n = parseFloat(l.vatRate);
            if (Number.isNaN(n) || n < 0 || n > 100) throw new Error("Invalid VAT rate");
            return n <= 1 ? n : n / 100;
          })(),
        })),
      }),
    );
    await logAudit(user, "INVOICE_CREATE", "Invoice", invoice.id, `${direction} ${invoice.invoiceNo}`);
    revalidatePath(direction === "SALES" ? "/sales-invoices" : "/purchase-invoices");
    revalidatePath("/dashboard");
    return { ok: true, data: { id: invoice.id, invoiceNo: invoice.invoiceNo } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to post invoice" };
  }
}

export async function voidInvoiceAction(
  invoiceId: string,
  direction: InvoiceDirection,
): Promise<ActionResult> {
  const user = await requireModule(directionModule(direction), "write");
  try {
    await prisma.$transaction(async (tx) => voidInvoice(tx, invoiceId));
    await logAudit(user, "INVOICE_VOID", "Invoice", invoiceId, `Voided ${direction} invoice`);
    revalidatePath(direction === "SALES" ? "/sales-invoices" : "/purchase-invoices");
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to void invoice" };
  }
}
