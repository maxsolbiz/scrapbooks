"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireModule } from "@/lib/guard";

const partySchema = z.object({
  id: z.string().optional(),
  code: z.string().min(1).max(32),
  type: z.enum(["CUSTOMER", "VENDOR", "BOTH"]),
  nameEn: z.string().min(1),
  nameAr: z.string().min(1),
  trn: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  addressEn: z.string().optional(),
  addressAr: z.string().optional(),
  isActive: z.boolean().optional(),
});

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

export async function saveParty(input: z.input<typeof partySchema>): Promise<ActionResult> {
  await requireModule("parties", "write");
  const parsed = partySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const v = parsed.data;
  try {
    if (v.trn && v.trn.length > 20) return { ok: false, error: "TRN too long" };
    if (v.id) {
      await prisma.party.update({
        where: { id: v.id },
        data: {
          type: v.type,
          nameEn: v.nameEn,
          nameAr: v.nameAr,
          trn: v.trn || null,
          phone: v.phone || null,
          email: v.email || null,
          addressEn: v.addressEn || null,
          addressAr: v.addressAr || null,
          ...(v.isActive === undefined ? {} : { isActive: v.isActive }),
        },
      });
    } else {
      const dupe = await prisma.party.findUnique({ where: { code: v.code } });
      if (dupe) return { ok: false, error: `Party code ${v.code} already exists` };
      await prisma.party.create({
        data: {
          code: v.code,
          type: v.type,
          nameEn: v.nameEn,
          nameAr: v.nameAr,
          trn: v.trn || null,
          phone: v.phone || null,
          email: v.email || null,
          addressEn: v.addressEn || null,
          addressAr: v.addressAr || null,
        },
      });
    }
    revalidatePath("/parties");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to save party" };
  }
}
