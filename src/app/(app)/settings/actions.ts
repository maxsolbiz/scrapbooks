"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { canEdit, requireUser } from "@/lib/guard";
import { logAudit } from "@/lib/audit";
import type { Role } from "@/generated/prisma/enums";

export type SettingsActionResult =
  | { ok: true }
  | { ok: false; error: string };

const companySchema = z.object({
  nameEn: z.string().min(1),
  nameAr: z.string().min(1),
  trn: z.string().max(64),
  addressEn: z.string().max(2000),
  addressAr: z.string().max(2000),
  phone: z.string().max(64),
  email: z.string().max(254),
  bankDetailsEn: z.string().max(2000),
  bankDetailsAr: z.string().max(2000),
});

export async function saveCompanyAction(
  input: z.input<typeof companySchema>,
): Promise<SettingsActionResult> {
  const user = await requireUser();
  if (!canEdit(user)) return { ok: false, error: "Viewer role cannot edit data" };
  const parsed = companySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  await prisma.companySettings.upsert({
    where: { id: "settings" },
    update: parsed.data,
    create: { id: "settings", ...parsed.data },
  });
  await logAudit(user, "COMPANY_UPDATE", "CompanySettings", "settings");
  revalidatePath("/settings");
  return { ok: true };
}

const userSchema = z.object({
  id: z.string(),
  role: z.enum(["ADMIN", "ACCOUNTANT", "VIEWER"]),
  isActive: z.boolean(),
  newPassword: z.string().optional(),
});

export async function saveUserAction(input: z.input<typeof userSchema>): Promise<SettingsActionResult> {
  const user = await requireUser();
  if (user.role !== "ADMIN") return { ok: false, error: "Admin role required" };
  const parsed = userSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const v = parsed.data;
  const data: Record<string, unknown> = {
    role: v.role as Role,
    isActive: v.isActive,
  };
  if (v.newPassword) {
    if (v.newPassword.length < 8) return { ok: false, error: "Password must be at least 8 characters" };
    data.passwordHash = await bcrypt.hash(v.newPassword, 10);
  }
  await prisma.user.update({ where: { id: v.id }, data });
  await logAudit(
    user,
    "USER_UPDATE",
    "User",
    v.id,
    `role=${v.role} active=${v.isActive}${v.newPassword ? " password-reset" : ""}`,
  );
  revalidatePath("/settings");
  return { ok: true };
}
