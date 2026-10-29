"use server";

import { requireUser } from "@/lib/guard";
import { prisma } from "@/lib/db";
import { applyCreditToInvoice } from "@/lib/payments";
import { z } from "zod";
import { revalidatePath } from "next/cache";

const schema = z.object({
  invoiceId: z.string().min(1),
  amountFils: z.coerce.bigint().positive(),
});

export async function applyCreditAction(input: z.input<typeof schema>) {
  const user = await requireUser();
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    await prisma.$transaction(async (tx) =>
      applyCreditToInvoice({ tx, invoiceId: parsed.data.invoiceId, amountFils: parsed.data.amountFils })
    );
    revalidatePath("/sales-invoices");
    revalidatePath("/parties");
    return { ok: true };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    return { ok: false, error: errorMessage };
  }
}