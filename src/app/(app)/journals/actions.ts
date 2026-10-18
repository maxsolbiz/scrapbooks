"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireModule } from "@/lib/guard";
import { logAudit } from "@/lib/audit";
import { postJournalEntry, assertBalanced } from "@/lib/accounting";
import type { EntrySource } from "@/generated/prisma/enums";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

const createSchema = z.object({
  date: z.string().min(1),
  narration: z.string().optional(),
  narrationAr: z.string().optional(),
  lines: z
    .array(
      z.object({
        accountId: z.string().min(1),
        debit: z.string(),
        credit: z.string(),
      }),
    )
    .min(2, "At least two lines"),
});

function toFils(value: string): bigint {
  const trimmed = value.trim();
  if (!trimmed) return 0n;
  if (!/^-?\d+(\.\d{1,2})?$/.test(trimmed)) throw new Error(`Invalid amount: ${value}`);
  const [whole, part = ""] = trimmed.replace("-", "").split(".");
  const fils = BigInt(whole || "0") * 100n + BigInt((part + "0").slice(0, 2));
  return trimmed.startsWith("-") ? -fils : fils;
}

export async function createJournal(input: z.input<typeof createSchema>): Promise<ActionResult<{ id: string }>> {
  const user = await requireModule("journals", "write");
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const v = parsed.data;
  try {
    const lines = v.lines.map((l) => {
      const debit = toFils(l.debit);
      const credit = toFils(l.credit);
      if (debit > 0n && credit > 0n) throw new Error("Each line must be either a debit or a credit");
      return {
        accountId: l.accountId,
        debit,
        credit,
      };
    });
    assertBalanced(lines);
    const entry = await prisma.$transaction(async (tx) =>
      postJournalEntry({
        tx,
        date: new Date(v.date),
        narration: v.narration || null,
        narrationAr: v.narrationAr || null,
        sourceType: "MANUAL" as EntrySource,
        createdById: user.id,
        lines: lines.map((l) => ({
          accountId: l.accountId,
          debit: l.debit > 0n ? l.debit : undefined,
          credit: l.credit > 0n ? l.credit : undefined,
        })),
      }),
    );
    await logAudit(user, "JOURNAL_CREATE", "JournalEntry", entry.id, "Posted manual journal entry");
    revalidatePath("/journals");
    revalidatePath("/dashboard");
    return { ok: true, data: { id: entry.id } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to post journal" };
  }
}

export async function voidJournal(entryId: string): Promise<ActionResult> {
  const user = await requireModule("journals", "write");
  try {
    await prisma.journalEntry.update({
      where: { id: entryId },
      data: { status: "VOID" },
    });
    await logAudit(user, "JOURNAL_VOID", "JournalEntry", entryId, "Voided journal entry");
    revalidatePath("/journals");
    revalidatePath(`/journals/${entryId}`);
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to void entry" };
  }
}
