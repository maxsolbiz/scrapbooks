"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireModule } from "@/lib/guard";
import { saveAccountRecord } from "@/lib/accounts";

const accountSchema = z.object({
  id: z.string().optional(),
  code: z
    .string()
    .regex(/^\d{4}$/, "Code must be 4 digits"),
  nameEn: z.string().min(1),
  nameAr: z.string().min(1),
  type: z.enum(["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"]),
  parentId: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

export async function saveAccount(input: z.input<typeof accountSchema>): Promise<ActionResult> {
  await requireModule("accounts", "write");
  const parsed = accountSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const v = parsed.data;
  try {
    if (v.parentId) {
      const parent = await prisma.account.findUnique({ where: { id: v.parentId } });
      if (!parent) return { ok: false, error: "Parent account not found" };
      if (!parent.isGroup) return { ok: false, error: "Parent must be a group account" };
    }
    if (!v.id) {
      const existing = await prisma.account.findUnique({ where: { code: v.code } });
      if (existing) return { ok: false, error: `Account code ${v.code} already exists` };
    }
    await saveAccountRecord({
      id: v.id,
      code: v.code,
      nameEn: v.nameEn,
      nameAr: v.nameAr,
      type: v.type,
      parentId: v.parentId ?? null,
      isActive: v.isActive,
    });
    revalidatePath("/accounts");
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to save account" };
  }
}
