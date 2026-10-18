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
  Package,
  Settings,
  Sun,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useT, useLocale } from "@/components/i18n/LocaleProvider";
import type { Dictionary, Locale } from "@/lib/i18n";
import { setLocale } from "@/app/actions/ui";
import { signOutAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type NavItem = { href: string; key: keyof Dictionary["nav"]; icon: React.ElementType; prefetch?: boolean };
type NavGroup = { labelKey: string; items: NavItem[] };

const GROUPS: NavGroup[] = [
  {
    labelKey: "OPERATE",
    items: [
      { href: "/sales-invoices", key: "sales", icon: FileBarChart2 },
      { href: "/purchase-invoices", key: "purchases", icon: FileText },
      { href: "/payments", key: "payments", icon: Banknote },
    ],
  },
  {
    labelKey: "BOOKS",
    items: [
      { href: "/accounts", key: "accounts", icon: BookText, prefetch: false },
      { href: "/journals", key: "journals", icon: LayoutDashboard },
    ],
  },
  {
    labelKey: "PEOPLE & CATALOG",
    items: [
      { href: "/parties", key: "parties", icon: Building2 },
      { href: "/items", key: "items", icon: Package },
    ],
  },
  {
    labelKey: "INSIGHTS",
    items: [{ href: "/reports", key: "reports", icon: ChartColumnBig, prefetch: false }],
  },
  {
    labelKey: "ADMIN",
    items: [
      { href: "/fiscal-years", key: "fiscalYears", icon: CalendarRange, prefetch: false },
      { href: "/settings", key: "settings", icon: Settings, prefetch: false },
    ],
  },
];

const ALL_ITEMS: NavItem[] = [
  { href: "/dashboard", key: "dashboard", icon: LayoutDashboard },
  ...GROUPS.flatMap((g) => g.items),
];

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
  children,
}: {
  user: { name: string; email: string; role?: string };
  dict: Dictionary;
  children: ReactNode;
}) {
  const t = useT();
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

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
          {GROUPS.map((group) => (
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
                  {ALL_ITEMS.map((item) => (
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

        <main className="flex-1 p-4 md:p-6 min-w-0">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
