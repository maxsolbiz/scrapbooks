"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { canEdit, requireUser } from "@/lib/guard";
import { isModuleKey } from "@/lib/permissions";
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
  // Per-module overrides; null clears all overrides (fall back to role defaults).
  permissions: z.record(z.string(), z.enum(["none", "read", "write"])).nullable().optional(),
});

export async function saveUserAction(input: z.input<typeof userSchema>): Promise<SettingsActionResult> {
  const user = await requireUser();
  if (user.role !== "ADMIN") return { ok: false, error: "Admin role required" };
  const parsed = userSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const v = parsed.data;
  if (v.id === user.id && (v.role !== "ADMIN" || !v.isActive)) {
    return { ok: false, error: "You cannot change your own role or deactivate yourself" };
  }
  const data: Record<string, unknown> = {
    role: v.role as Role,
    isActive: v.isActive,
  };
  if (v.permissions !== undefined) {
    if (v.permissions === null) {
      data.permissions = Prisma.DbNull;
    } else {
      const overrides: Record<string, string> = {};
      for (const [key, value] of Object.entries(v.permissions)) {
        if (isModuleKey(key)) overrides[key] = value;
      }
      data.permissions = overrides;
    }
  }
  if (v.newPassword) {
    if (v.newPassword.length < 8) return { ok: false, error: "Password must be at least 8 characters" };
    data.passwordHash = await bcrypt.hash(v.newPassword, 10);
  }
  await prisma.user.update({ where: { id: v.id }, data });
  const permsSummary = v.permissions
    ? ` ${JSON.stringify(v.permissions)}`
    : v.permissions === null
      ? " permissions=default"
      : "";
  await logAudit(
    user,
    "USER_UPDATE",
    "User",
    v.id,
    `role=${v.role} active=${v.isActive}${v.newPassword ? " password-reset" : ""}${permsSummary}`,
  );
  revalidatePath("/settings");
  return { ok: true };
}
