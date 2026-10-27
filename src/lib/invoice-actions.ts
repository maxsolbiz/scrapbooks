"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireModule } from "@/lib/guard";
import { logAudit } from "@/lib/audit";
import { decimalStringToFils } from "@/lib/money";
import { createInvoice, voidInvoiceWithReversal } from "@/lib/invoices";
import { todayDubai } from "@/lib/dates";
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
  wbtNo: z
    .string()
    .max(60, "WBT # must be 60 characters or fewer")
    .optional(),
});

const invoiceSchema = z.object({
  date: z.string().min(1),
  partyId: z.string().min(1),
  notes: z.string().optional(),
  notesAr: z.string().optional(),
  supplierRef: z.string().optional(),
  purchaseOrder: z.string().optional(),
  deliveryNote: z.string().optional(),
  deliveryNoteDate: z.string().optional(),
  vehicleNo: z.string().optional(),
  modeOfPayment: z.string().optional(),
  termsOfDelivery: z.string().optional(),
  lines: z.array(lineSchema).min(1, "At least one line"),
});

const invoicePrintDetailsSchema = z.object({
  supplierRef: z.string().optional(),
  purchaseOrder: z.string().optional(),
  deliveryNote: z.string().optional(),
  deliveryNoteDate: z
    .string()
    .optional()
    .refine((v) => !v || !Number.isNaN(new Date(v).getTime()), "Invalid date"),
  vehicleNo: z.string().optional(),
  modeOfPayment: z.string().optional(),
  termsOfDelivery: z.string().optional(),
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
        supplierRef: v.supplierRef,
        purchaseOrder: v.purchaseOrder,
        deliveryNote: v.deliveryNote,
        deliveryNoteDate: v.deliveryNoteDate ? new Date(v.deliveryNoteDate) : undefined,
        vehicleNo: v.vehicleNo,
        modeOfPayment: v.modeOfPayment,
        termsOfDelivery: v.termsOfDelivery,
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
          wbtNo: l.wbtNo,
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

const voidReasonSchema = z
  .string()
  .trim()
  .min(1, "A reason is required to void an invoice")
  .max(2000, "Reason must be at most 2000 characters");

export async function voidInvoiceAction(
  invoiceId: string,
  direction: InvoiceDirection,
  reason: string,
): Promise<ActionResult> {
  const user = await requireModule(directionModule(direction), "write");
  const parsed = voidReasonSchema.safeParse(reason);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid reason" };
  }
  try {
    const reversal = await prisma.$transaction(async (tx) =>
      voidInvoiceWithReversal({ invoiceId, reason: parsed.data, date: todayDubai(), createdById: user.id, tx }),
    );
    await logAudit(
      user,
      "INVOICE_VOID",
      "Invoice",
      invoiceId,
      `Voided ${direction} invoice ${
        reversal ? `with reversal entry ${reversal.entryNo}` : "(no journal entry)"
      } - reason: ${parsed.data}`,
    );
    revalidatePath(direction === "SALES" ? "/sales-invoices" : "/purchase-invoices");
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to void invoice" };
  }
}

function toNullIfEmpty(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export async function updateInvoicePrintDetailsAction(
  invoiceId: string,
  direction: InvoiceDirection,
  input: z.input<typeof invoicePrintDetailsSchema>,
): Promise<ActionResult> {
  const user = await requireModule(directionModule(direction), "write");
  const parsed = invoicePrintDetailsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const v = parsed.data;
  try {
    const existing = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { status: true, direction: true },
    });
    if (!existing || existing.direction !== direction) {
      return { ok: false, error: "Invoice not found" };
    }
    if (existing.status === "VOID") {
      return { ok: false, error: "Voided invoice cannot be edited" };
    }
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        supplierRef: toNullIfEmpty(v.supplierRef),
        purchaseOrder: toNullIfEmpty(v.purchaseOrder),
        deliveryNote: toNullIfEmpty(v.deliveryNote),
        deliveryNoteDate: v.deliveryNoteDate ? new Date(v.deliveryNoteDate) : null,
        vehicleNo: toNullIfEmpty(v.vehicleNo),
        modeOfPayment: toNullIfEmpty(v.modeOfPayment),
        termsOfDelivery: toNullIfEmpty(v.termsOfDelivery),
      },
    });
    await logAudit(
      user,
      "INVOICE_PRINT_DETAILS_UPDATE",
      "Invoice",
      invoiceId,
      `${direction} print details updated`,
    );
    revalidatePath(`/sales-invoices/${invoiceId}`);
    revalidatePath(`/purchase-invoices/${invoiceId}`);
    revalidatePath(`/sales-invoices/${invoiceId}/print`);
    revalidatePath(`/purchase-invoices/${invoiceId}/print`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to update print details" };
  }
}
