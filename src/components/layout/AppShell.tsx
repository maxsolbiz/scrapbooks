"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTransition, type ReactNode } from "react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import {
  Banknote,
  BookText,
  Building2,
  CalendarRange,
  ChartColumnBig,
  ChevronDown,
  FileBarChart2,
  FileText,
  LayoutDashboard,
  LogOut,
  Moon,
  MoreHorizontal,
  Package,
  Settings,
  ShieldCheck,
  Sun,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useT, useLocale } from "@/components/i18n/LocaleProvider";
import type { Dictionary, Locale } from "@/lib/i18n";
import type { ModuleKey, ModulePerms } from "@/lib/permissions";
import { setLocale } from "@/app/actions/ui";
import { signOutAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { InstallAppButton } from "@/components/pwa/PwaRegister";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type NavItem = {
  href: string;
  key: keyof Dictionary["nav"];
  icon: React.ElementType;
  prefetch?: boolean;
  module?: ModuleKey;
  adminOnly?: boolean;
};
type NavGroup = { labelKey: string; items: NavItem[] };

const GROUPS: NavGroup[] = [
  {
    labelKey: "OPERATE",
    items: [
      { href: "/sales-invoices", key: "sales", icon: FileBarChart2, module: "sales-invoices" },
      { href: "/purchase-invoices", key: "purchases", icon: FileText, module: "purchase-invoices" },
      { href: "/payments", key: "payments", icon: Banknote, module: "payments" },
    ],
  },
  {
    labelKey: "BOOKS",
    items: [
      { href: "/accounts", key: "accounts", icon: BookText, prefetch: false, module: "accounts" },
      { href: "/journals", key: "journals", icon: LayoutDashboard, module: "journals" },
    ],
  },
  {
    labelKey: "PEOPLE & CATALOG",
    items: [
      { href: "/parties", key: "parties", icon: Building2, module: "parties" },
      { href: "/items", key: "items", icon: Package, module: "items" },
    ],
  },
  {
    labelKey: "INSIGHTS",
    items: [
      { href: "/reports", key: "reports", icon: ChartColumnBig, prefetch: false, module: "reports" },
      { href: "/reports/vat-201", key: "vat201Return", icon: FileText, prefetch: false, module: "reports" },
      { href: "/reports/invoice-register", key: "invoiceRegister", icon: FileText, prefetch: false, module: "reports" },
      { href: "/reports/audit-trail", key: "auditTrail", icon: ShieldCheck, prefetch: false, module: "reports" },
    ],
  },
  {
    labelKey: "ADMIN",
    items: [
      { href: "/fiscal-years", key: "fiscalYears", icon: CalendarRange, module: "fiscal-years" },
      { href: "/settings", key: "settings", icon: Settings, prefetch: false, adminOnly: true },
      { href: "/audit", key: "audit", icon: ShieldCheck, prefetch: false, adminOnly: true },
    ],
  },
];

const ALL_ITEMS: NavItem[] = [
  { href: "/dashboard", key: "dashboard", icon: LayoutDashboard },
  ...GROUPS.flatMap((g) => g.items),
];

function isAllowed(item: NavItem, perms: ModulePerms, isAdmin: boolean): boolean {
  if (item.adminOnly) return isAdmin;
  if (!item.module) return true; // dashboard
  return perms[item.module] !== "none";
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <Button
      variant="ghost"
      size="sm"
      aria-label="Toggle theme"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
    >
      {mounted && theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
}

function LocaleSwitcher({
  locale,
  pending,
  onSelect,
}: {
  locale: Locale;
  pending: boolean;
  onSelect: (l: Locale) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={pending}>
        <Button variant="ghost" size="sm" className="gap-1 px-2 font-medium">
          {locale.toUpperCase()}
          <ChevronDown className="size-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onSelect("en")} className={cn(locale === "en" && "bg-accent")}>
          {locale === "en" ? "✓ " : ""}English
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onSelect("ar")} className={cn(locale === "ar" && "bg-accent")}>
          {locale === "ar" ? "✓ " : ""}العربية
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MobileTabBar({ pathname, allowed }: { pathname: string; allowed: NavItem[] }) {
  const t = useT();
  function Tab({ item }: { item: NavItem }) {
    const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href + "/"));
    const Icon = item.icon;
    return (
      <Link
        href={item.href}
        prefetch={item.prefetch === false ? false : undefined}
        className={cn(
          "flex flex-1 flex-col items-center gap-0.5 py-1.5 text-[10px] font-medium transition-colors",
          active ? "text-sidebar-primary" : "text-muted-foreground",
        )}
      >
        <Icon className="size-5" />
        <span className="max-w-20 truncate">{t.nav[item.key]}</span>
      </Link>
    );
  }
  const tabs = allowed.slice(0, 3);
  const moreItems = allowed.slice(3);
  return (
    <nav
      aria-label="Mobile navigation"
      className="fixed inset-x-0 bottom-0 z-40 flex border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {tabs.map((tab) => (
        <Tab key={tab.href} item={tab} />
      ))}
      {moreItems.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex flex-1 flex-col items-center gap-0.5 py-1.5 text-[10px] font-medium text-muted-foreground">
              <MoreHorizontal className="size-5" />
              <span>More</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="end" className="w-52">
            {moreItems.map((item) => (
              <DropdownMenuItem key={item.href} asChild>
                <Link href={item.href} prefetch={item.prefetch === false ? false : undefined}>
                  <item.icon className="size-4" /> {t.nav[item.key]}
                </Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </nav>
  );
}

function Breadcrumb({ pathname }: { pathname: string }) {
  const t = useT();
  const segments = pathname.split("/").filter(Boolean);
  const first = segments[0] ?? "";
  const moduleItem = ALL_ITEMS.find((i) => i.href.endsWith("/" + first) || i.href === "/" + first);
  const rest = segments.slice(moduleItem ? 1 : 0);
  return (
    <nav className="flex items-center gap-1.5 text-sm" aria-label="Breadcrumb">
      <Link href="/dashboard" className="text-muted-foreground hover:text-foreground">
        {t.appName}
      </Link>
      {moduleItem && [
        <ChevronDown key="sep1" className="size-3 -rotate-90 text-muted-foreground/60" />,
        <Link key="mod" href={moduleItem.href} className="text-muted-foreground hover:text-foreground">
          {t.nav[moduleItem.key]}
        </Link>,
      ]}
      {rest.length > 0 && (
        <>
          <ChevronDown className="size-3 -rotate-90 text-muted-foreground/60" />
          <span className="font-medium capitalize">{rest[0] === "new" ? t.common.create : rest[0].slice(0, 12)}</span>
        </>
      )}
    </nav>
  );
}

export function AppShell({
  user,
  dict,
  perms,
  children,
}: {
  user: { name: string; email: string; role?: string };
  dict: Dictionary;
  perms: ModulePerms;
  children: ReactNode;
}) {
  const t = useT();
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const isAdmin = user.role === "ADMIN" || user.role === "SUPER_ADMIN";
  const allowed = ALL_ITEMS.filter((i) => isAllowed(i, perms, isAdmin));
  const allowedSet = new Set(allowed.map((i) => i.href));
  const groups = GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => allowedSet.has(i.href)),
  })).filter((g) => g.items.length > 0);

  function switchLocale(next: Locale) {
    startTransition(async () => {
      await setLocale(next);
      router.refresh();
    });
  }

  return (
    <div className="flex min-h-screen w-full">
      <aside
        id="app-sidebar"
        className="hidden md:flex w-60 shrink-0 flex-col bg-sidebar text-sidebar-foreground"
      >
        <Link href="/dashboard" className="flex h-14 items-center gap-2.5 px-4 border-b border-sidebar-border">
          <span className="flex size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <BookText className="size-4.5" />
          </span>
          <span className="min-w-0">
            <span className="block font-semibold tracking-tight leading-tight text-sidebar-accent-foreground">
              {t.appName}
            </span>
            <span className="block text-[10px] text-sidebar-foreground/60 leading-tight">
              {t.appSub}
            </span>
          </span>
        </Link>
        <nav className="flex-1 overflow-y-auto py-3">
          {groups.map((group) => (
            <div key={group.labelKey} className="mb-4 px-2">
              <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/45">
                {group.labelKey}
              </p>
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const active =
                    pathname === item.href || pathname.startsWith(item.href + "/");
                  const Icon = item.icon;
                  return (
                    <li key={item.href} className="relative">
                      {active && (
                        <span className="absolute inline-start-1 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-sidebar-primary" />
                      )}
                      <Link
                        href={item.href}
                        prefetch={item.prefetch === false ? false : undefined}
                        className={cn(
                          "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                          active
                            ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                            : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                        )}
                      >
                        <Icon
                          className={cn("size-4 shrink-0", active ? "text-sidebar-primary" : "text-sidebar-foreground/55")}
                        />
                        <span>{dict.nav[item.key]}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
        <div className="border-t border-sidebar-border p-3 text-[10px] text-sidebar-foreground/50">
          {t.appName} · {user.role}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b bg-background px-4 md:px-6">
          <div className="flex items-center gap-3">
            <div className="md:hidden">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-1">
                    <LayoutDashboard className="size-4" />
                    <ChevronDown className="size-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  {allowed.map((item) => (
                    <DropdownMenuItem key={item.href} asChild>
                      <Link href={item.href}>{dict.nav[item.key]}</Link>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="hidden md:block">
              <Breadcrumb pathname={pathname} />
            </div>
          </div>

          <div className="ms-auto flex items-center gap-1.5">
            <InstallAppButton />
            <LocaleSwitcher locale={locale} pending={pending} onSelect={switchLocale} />
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="max-w-48 gap-2">
                  <span className="flex size-7 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    {(user.name || "?").slice(0, 1).toUpperCase()}
                  </span>
                  <span className="hidden sm:inline truncate">{user.name}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>
                  <div className="text-sm font-medium">{user.name}</div>
                  <div className="text-xs text-muted-foreground truncate">{user.email}</div>
                  <div className="text-xs text-muted-foreground">{user.role}</div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <form action={signOutAction}>
                  <button
                    type="submit"
                    className="flex w-full items-center gap-2 px-2 py-1.5 text-sm text-destructive hover:bg-accent rounded-sm cursor-pointer"
                  >
                    <LogOut className="size-4" /> {dict.nav.logout}
                  </button>
                </form>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="flex-1 p-4 pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-6 md:p-6 min-w-0">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
        <MobileTabBar pathname={pathname} allowed={allowed} />
      </div>
    </div>
  );
}
