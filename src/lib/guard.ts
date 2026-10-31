import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  canRead,
  canWrite,
  effectiveAccess,
  parseOverrides,
  type ModuleKey,
  type ModuleAccess,
  type ModuleOverrides,
  type ModulePerms,
  type UserRole,
} from "@/lib/permissions";

export type SessionUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  role?: string | null;
};

export async function requireUser(): Promise<SessionUser> {
  const session = await auth();
  const user = session?.user;
  if (!user) redirect("/login");
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

/**
 * Load the user's effective module access with a fresh DB read, so role and
 * permission changes by an admin take effect without a new login.
 */
export async function loadAccess(user: SessionUser): Promise<{
  role: UserRole;
  overrides: ModuleOverrides;
  perms: ModulePerms;
}> {
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { role: true, permissions: true },
  });
  const role = (dbUser?.role ?? user.role ?? "VIEWER") as UserRole;
  const overrides = parseOverrides(dbUser?.permissions);
  return { role, overrides, perms: effectiveAccess(role, overrides) };
}

/** Boolean per-module check (non-redirecting), for UI toggles in server components. */
export async function moduleCan(
  user: SessionUser,
  key: ModuleKey,
  level: "read" | "write",
): Promise<boolean> {
  const { role, overrides } = await loadAccess(user);
  return level === "read"
    ? canRead(role, overrides, key)
    : canWrite(role, overrides, key);
}

/**
 * Guard a module route or server action: the user must have at least `level`
 * access to the given module, otherwise they are redirected to /dashboard.
 */
export async function requireModule(
  key: ModuleKey,
  level: "read" | "write" = "read",
): Promise<SessionUser> {
  const user = await requireUser();
  const { role, overrides } = await loadAccess(user);
  const allowed =
    level === "read"
      ? canRead(role, overrides, key)
      : canWrite(role, overrides, key);
  if (!allowed) redirect("/dashboard");
  return { ...user, role };
}

/** Effective access snapshot for the (app) layout / AppShell nav filtering. */
export async function getAccess(): Promise<{
  user: SessionUser;
  perms: ModulePerms;
} | null> {
  const session = await auth();
  if (!session?.user) return null;
  const user: SessionUser = {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    role: session.user.role,
  };
  const { perms } = await loadAccess(user);
  return { user, perms };
}

/** ADMIN + ACCOUNTANT legacy check — still used for company settings. */
export async function requireEditor(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role === "VIEWER") redirect("/dashboard");
  return user;
}

/** ADMIN and SUPER_ADMIN pass; everyone else is redirected to /dashboard. */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") redirect("/dashboard");
  return user;
}

/** Read audit logs: ADMIN, ACCOUNTANT, and SUPER_ADMIN only; deny by default. */
export async function requireAuditAccess(): Promise<SessionUser> {
  const user = await requireUser();
  if (
    user.role !== "ADMIN" &&
    user.role !== "ACCOUNTANT" &&
    user.role !== "SUPER_ADMIN"
  ) {
    redirect("/dashboard");
  }
  return user;
}

/** Non-redirecting audit-access check for API routes: returns the session user
 * when allowed, or a denial reason otherwise. Callers decide how to respond:
 * unauthenticated → 401 without writing an audit row; forbidden → 403 with
 * an AUDIT_EXPORT_DENIED row so the denial itself is auditable. */
export type AuditAccessResult =
  | { ok: true; user: SessionUser }
  | { ok: false; reason: "unauthenticated" | "forbidden" };

export async function getAuditAccess(): Promise<AuditAccessResult> {
  const session = await auth();
  const user = session?.user;
  if (!user) return { ok: false, reason: "unauthenticated" };
  if (
    user.role !== "ADMIN" &&
    user.role !== "ACCOUNTANT" &&
    user.role !== "SUPER_ADMIN"
  ) {
    return { ok: false, reason: "forbidden" };
  }
  return { ok: true, user: { id: user.id, name: user.name, email: user.email, role: user.role ?? null } };
}

/** Only SUPER_ADMIN passes; everyone else is redirected to /dashboard. */
export async function requireSuperAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "SUPER_ADMIN") redirect("/dashboard");
  return user;
}

export function canEdit(user: SessionUser): boolean {
  return user.role === "ADMIN" || user.role === "ACCOUNTANT" || user.role === "SUPER_ADMIN";
}

// Re-exported so module pages can work with module access types.
export type { ModuleKey, ModuleAccess, ModulePerms };
