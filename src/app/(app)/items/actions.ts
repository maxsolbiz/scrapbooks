"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireEditor } from "@/lib/guard";
import { decimalStringToFils } from "@/lib/money";

const itemSchema = z.object({
  id: z.string().optional(),
  code: z.string().max(16).optional(),
  nameEn: z.string().min(1),
  nameAr: z.string().min(1),
  unit: z.enum(["KG", "TON", "PCS", "BAG", "OTHER"]),
  defaultRate: z.string().optional(),
  vatRate: z.string(), // e.g. "0.05" or "5"
  isActive: z.boolean().optional(),
});

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

function parseVatRate(value: string): number {
  if (value.includes("%")) value = value.replace("%", "");
  const pct = parseFloat(value);
  if (Number.isNaN(pct) || pct < 0 || pct > 100) throw new Error("Invalid VAT rate");
  // accept either "5" as percent or "0.05" as fraction
  if (pct <= 1) return pct;
  return pct / 100;
}

export async function saveItem(input: z.input<typeof itemSchema>): Promise<ActionResult> {
  await requireEditor();
  const parsed = itemSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const v = parsed.data;
  try {
    let defaultRate: bigint | null = null;
    if (v.defaultRate?.trim()) {
      defaultRate = decimalStringToFils(v.defaultRate);
    }
    const vatRate = parseVatRate(v.vatRate);

    if (v.id) {
      await prisma.item.update({
        where: { id: v.id },
        data: {
          nameEn: v.nameEn,
          nameAr: v.nameAr,
          unit: v.unit,
          defaultRate,
          vatRate,
          ...(v.isActive === undefined ? {} : { isActive: v.isActive }),
        },
      });
    } else {
      const code = v.code?.trim().toUpperCase();
      if (code) {
        const dupe = await prisma.item.findUnique({ where: { code } });
        if (dupe) return { ok: false, error: `Item code ${code} already exists` };
      }
      await prisma.item.create({
        data: {
          code: code || null,
          nameEn: v.nameEn,
          nameAr: v.nameAr,
          unit: v.unit,
          defaultRate,
          vatRate,
        },
      });
    }
    revalidatePath("/items");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to save item" };
  }
}
