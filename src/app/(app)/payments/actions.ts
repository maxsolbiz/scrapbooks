"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireModule } from "@/lib/guard";
import { logAudit } from "@/lib/audit";
import { decimalStringToFils } from "@/lib/money";
import { createPayment, voidPaymentWithReversal } from "@/lib/payments";
import { todayDubai } from "@/lib/dates";
import type { PaymentMethod, PaymentType } from "@/generated/prisma/enums";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

const schema = z.object({
  type: z.enum(["RECEIPT", "PAYMENT", "CONTRA"]),
  method: z.enum(["CASH", "BANK"]),
  date: z.string().min(1),
  partyId: z.string().optional(),
  amount: z.string().min(1),
  reference: z.string().optional(),
  notes: z.string().optional(),
  allocations: z
    .array(z.object({ invoiceId: z.string().min(1), amount: z.string().min(1) }))
    .optional(),
  idempotencyKey: z.string().uuid().optional(),
});

export async function createPaymentAction(
  input: z.input<typeof schema>,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireModule("payments", "write");
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const v = parsed.data;

  // Idempotency check
  if (v.idempotencyKey) {
    const existing = await prisma.payment.findUnique({
      where: { idempotencyKey: v.idempotencyKey },
    });
    if (existing) {
      return { ok: true, data: { id: existing.id } };
    }
  }

  try {
    const payment = await prisma.$transaction(async (tx) =>
      createPayment({
        tx,
        type: v.type as PaymentType,
        method: v.method as PaymentMethod,
        date: new Date(v.date),
        partyId: v.partyId || null,
        amountFils: decimalStringToFils(v.amount),
        reference: v.reference || null,
        notes: v.notes || null,
        createdById: user.id,
        idempotencyKey: v.idempotencyKey,
        allocations: (v.allocations ?? []).map((a) => ({
          invoiceId: a.invoiceId,
          amountFils: decimalStringToFils(a.amount),
        })),
      }),
    );
    await logAudit(user, "PAYMENT_CREATE", "Payment", payment.id, `${v.type} ${payment.paymentNo}`);
    revalidatePath("/payments");
    revalidatePath("/dashboard");
    return { ok: true, data: { id: payment.id } };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    if (errorMessage.includes("P2002")) {
      return { ok: false, error: "A payment with this idempotency key already exists." };
    }
    return { ok: false, error: e instanceof Error ? e.message : "Failed to post payment" };
  }
}

const voidReasonSchema = z
  .string()
  .trim()
  .min(1, "A reason is required to void a payment")
  .max(2000, "Reason must be at most 2000 characters");

export async function voidPaymentAction(paymentId: string, reason: string): Promise<ActionResult> {
  const user = await requireModule("payments", "write");
  const parsed = voidReasonSchema.safeParse(reason);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid reason" };
  }
  try {
    const reversal = await prisma.$transaction(async (tx) =>
      voidPaymentWithReversal({ paymentId, reason: parsed.data, date: todayDubai(), createdById: user.id, tx }),
    );
    try {
      await logAudit(
        user,
        "PAYMENT_VOID",
        "Payment",
        paymentId,
        `Voided payment ${
          reversal ? `with reversal entry ${reversal.entryNo}` : "(no journal entry)"
        } - reason: ${parsed.data}`,
      );
    } catch (auditErr) {
      console.error("PAYMENT_VOID audit failed:", auditErr);
    }
    revalidatePath("/payments");
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to void payment" };
  }
}
