/**
 * Per-user module permissions.
 *
 * Every user gets access to modules either through their role defaults or
 * through explicit per-user overrides stored in `User.permissions` (JSON).
 * `write` implies `read`. Dashboard is always visible (it is the landing page).
 * Settings / Users / Audit stay ADMIN-only and are not assignable.
 */

export const MODULE_KEYS = [
  "sales-invoices",
  "purchase-invoices",
  "payments",
  "journals",
  "accounts",
  "parties",
  "items",
  "reports",
  "fiscal-years",
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];
export type ModuleAccess = "none" | "read" | "write";
/** Only the modules the admin explicitly changed; missing keys fall back to role defaults. */
export type ModuleOverrides = Partial<Record<ModuleKey, ModuleAccess>>;
export type ModulePerms = Record<ModuleKey, ModuleAccess>;

export type UserRole = "ADMIN" | "ACCOUNTANT" | "VIEWER" | "SUPER_ADMIN";

/** Keys of the nav dictionary that name modules. */
type NavLabelKey =
  | "sales"
  | "purchases"
  | "payments"
  | "journals"
  | "accounts"
  | "parties"
  | "items"
  | "reports"
  | "fiscalYears";

/** Dictionary nav key used as the display label for each module. */
export const MODULE_LABEL_KEY: Record<ModuleKey, NavLabelKey> = {
  "sales-invoices": "sales",
  "purchase-invoices": "purchases",
  payments: "payments",
  journals: "journals",
  accounts: "accounts",
  parties: "parties",
  items: "items",
  reports: "reports",
  "fiscal-years": "fiscalYears",
};

/** The form route path for each module (used by guards). */
export const MODULE_PATH: Record<ModuleKey, string> = {
  "sales-invoices": "/sales-invoices",
  "purchase-invoices": "/purchase-invoices",
  payments: "/payments",
  journals: "/journals",
  accounts: "/accounts",
  parties: "/parties",
  items: "/items",
  reports: "/reports",
  "fiscal-years": "/fiscal-years",
};

/** Reports is read-only data: writing means nothing there. */
export const MODULE_LEVELS: Record<ModuleKey, ModuleAccess[]> = MODULE_KEYS.reduce(
  (acc, key) => {
    acc[key] = key === "reports" ? ["none", "read"] : ["none", "read", "write"];
    return acc;
  },
  {} as Record<ModuleKey, ModuleAccess[]>,
);

const ALL_WRITE: ModulePerms = MODULE_KEYS.reduce(
  (acc, key) => {
    acc[key] = "write";
    return acc;
  },
  {} as ModulePerms,
);

const ROLE_DEFAULTS: Record<UserRole, ModulePerms> = {
  ADMIN: { ...ALL_WRITE },
  ACCOUNTANT: { ...ALL_WRITE },
  SUPER_ADMIN: { ...ALL_WRITE },
  VIEWER: {
    ...MODULE_KEYS.reduce(
      (acc, key) => {
        acc[key] = "none";
        return acc;
      },
      {} as ModulePerms,
    ),
    reports: "read",
  },
};

export function isModuleKey(value: string): value is ModuleKey {
  return (MODULE_KEYS as readonly string[]).includes(value);
}

export function isModuleAccess(value: unknown): value is ModuleAccess {
  return value === "none" || value === "read" || value === "write";
}

/** Validate + sanitize the raw JSON stored in User.permissions. */
export function parseOverrides(raw: unknown): ModuleOverrides {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: ModuleOverrides = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (isModuleKey(key) && isModuleAccess(value)) out[key] = value;
  }
  return out;
}

function normalizeRole(role?: string | null): UserRole {
  return role === "ADMIN" || role === "ACCOUNTANT" || role === "SUPER_ADMIN" ? role : "VIEWER";
}

/**
 * Effective per-module access: role defaults with explicit overrides applied.
 * ADMIN always keeps full write access everywhere.
 */
export function effectiveAccess(
  role: string | null | undefined,
  overrides: ModuleOverrides | null | undefined,
): ModulePerms {
  const r = normalizeRole(role);
  const base = { ...ROLE_DEFAULTS[r] };
  if (r === "ADMIN" || r === "SUPER_ADMIN") return base;
  for (const key of MODULE_KEYS) {
    const override = overrides?.[key];
    if (!override) continue;
    if (override === "write" && !MODULE_LEVELS[key].includes("write")) continue;
    base[key] = override;
  }
  return base;
}

export function canRead(
  role: string | null | undefined,
  overrides: ModuleOverrides | null | undefined,
  key: ModuleKey,
): boolean {
  return effectiveAccess(role, overrides)[key] !== "none";
}

export function canWrite(
  role: string | null | undefined,
  overrides: ModuleOverrides | null | undefined,
  key: ModuleKey,
): boolean {
  return effectiveAccess(role, overrides)[key] === "write";
}

/** Role defaults for display in the admin form. */
export function roleDefaults(role: string | null | undefined): ModulePerms {
  return effectiveAccess(role, {});
}
