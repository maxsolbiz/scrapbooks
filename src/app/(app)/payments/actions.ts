"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireEditor } from "@/lib/guard";
import { decimalStringToFils } from "@/lib/money";
import { createPayment, voidPayment } from "@/lib/payments";
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
});

export async function createPaymentAction(
  input: z.input<typeof schema>,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireEditor();
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const v = parsed.data;
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
        allocations: (v.allocations ?? []).map((a) => ({
          invoiceId: a.invoiceId,
          amountFils: decimalStringToFils(a.amount),
        })),
      }),
    );
    revalidatePath("/payments");
    revalidatePath("/dashboard");
    return { ok: true, data: { id: payment.id } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to post payment" };
  }
}

export async function voidPaymentAction(paymentId: string): Promise<ActionResult> {
  await requireEditor();
  try {
    await prisma.$transaction(async (tx) => voidPayment(tx, paymentId));
    revalidatePath("/payments");
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to void payment" };
  }
}
