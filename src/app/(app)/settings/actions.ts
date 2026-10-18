"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { canEdit, requireUser } from "@/lib/guard";
import { isModuleKey } from "@/lib/permissions";
import { resetDemoData } from "@/lib/demo-data";
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
  role: z.enum(["ADMIN", "ACCOUNTANT", "VIEWER", "SUPER_ADMIN"]),
  isActive: z.boolean(),
  newPassword: z.string().optional(),
  // Per-module overrides; null clears all overrides (fall back to role defaults).
  permissions: z.record(z.string(), z.enum(["none", "read", "write"])).nullable().optional(),
});

export async function saveUserAction(input: z.input<typeof userSchema>): Promise<SettingsActionResult> {
  const user = await requireUser();
  if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") return { ok: false, error: "Admin role required" };
  const parsed = userSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const v = parsed.data;
  const callerSuper = user.role === "SUPER_ADMIN";
  // Super-admin accounts are managed exclusively by super admins.
  const target = await prisma.user.findUnique({ where: { id: v.id }, select: { role: true } });
  if (!target) return { ok: false, error: "User not found" };
  if ((target.role === "SUPER_ADMIN" || v.role === "SUPER_ADMIN") && !callerSuper) {
    return { ok: false, error: "User not found" };
  }
  if (v.id === user.id && (v.role !== user.role || !v.isActive)) {
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

const createUserSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email().max(254),
  password: z.string().min(8).max(100),
  role: z.enum(["ADMIN", "ACCOUNTANT", "VIEWER", "SUPER_ADMIN"]),
  isActive: z.boolean(),
  permissions: z.record(z.string(), z.enum(["none", "read", "write"])).nullable().optional(),
});

export async function createUserAction(
  input: z.input<typeof createUserSchema>,
): Promise<SettingsActionResult & { id?: string }> {
  const user = await requireUser();
  if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") return { ok: false, error: "Admin role required" };
  const parsed = createUserSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const v = parsed.data;
  const callerSuper = user.role === "SUPER_ADMIN";
  if (v.role === "SUPER_ADMIN" && !callerSuper) return { ok: false, error: "User not found" };
  const email = v.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) return { ok: false, error: "Email already exists" };
  const created = await prisma.user.create({
    data: {
      name: v.name,
      email,
      passwordHash: await bcrypt.hash(v.password, 10),
      role: v.role as Role,
      isActive: v.isActive,
      permissions: (() => {
        if (v.permissions === undefined || v.permissions === null) return Prisma.DbNull;
        const overrides: Record<string, string> = {};
        for (const [key, value] of Object.entries(v.permissions)) {
          if (isModuleKey(key)) overrides[key] = value;
        }
        return overrides;
      })(),
    },
    select: { id: true },
  });
  await logAudit(user, "USER_CREATE", "User", created.id, `email=${email} role=${v.role} active=${v.isActive}`);
  revalidatePath("/settings");
  return { ok: true, id: created.id };
}

const deleteUserSchema = z.object({ id: z.string() });

export async function deleteUserAction(input: z.input<typeof deleteUserSchema>): Promise<SettingsActionResult> {
  const user = await requireUser();
  if (user.role !== "SUPER_ADMIN") return { ok: false, error: "Super admin role required" };
  const parsed = deleteUserSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input" };
  if (parsed.data.id === user.id) return { ok: false, error: "You cannot delete your own account" };
  const target = await prisma.user.findUnique({ where: { id: parsed.data.id } });
  if (!target) return { ok: false, error: "User not found" };
  const [entries, invoices, payments] = await Promise.all([
    prisma.journalEntry.count({ where: { createdById: target.id }, take: 1 }),
    prisma.invoice.count({ where: { createdById: target.id }, take: 1 }),
    prisma.payment.count({ where: { createdById: target.id }, take: 1 }),
  ]);
  if (entries > 0 || invoices > 0 || payments > 0) {
    return { ok: false, error: "User has accounting activity and cannot be deleted. Deactivate instead." };
  }
  try {
    await prisma.user.delete({ where: { id: target.id } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") {
      return { ok: false, error: "User has accounting activity and cannot be deleted. Deactivate instead." };
    }
    throw e;
  }
  await logAudit(user, "USER_DELETE", "User", target.id, `email=${target.email} role=${target.role}`);
  revalidatePath("/settings");
  return { ok: true };
}

export async function resetDemoDataAction(): Promise<SettingsActionResult> {
  const user = await requireUser();
  if (user.role !== "SUPER_ADMIN") return { ok: false, error: "Super admin role required" };
  await resetDemoData();
  await logAudit(user, "DEMO_RESET", "System", "demo", "All transactional data wiped and demo dataset re-seeded");
  revalidatePath("/", "layout");
  return { ok: true };
}
