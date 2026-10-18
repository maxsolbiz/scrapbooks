"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTransition, type ReactNode } from "react";
import {
  Banknote,
  BookText,
  Building2,
  CalendarRange,
  FileBarChart2,
  FileText,
  LayoutDashboard,
  LogOut,
  Package,
  Users,
  ChartColumnBig,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/components/i18n/LocaleProvider";
import type { Dictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n";
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

const NAV: { href: string; key: keyof Dictionary["nav"]; icon: React.ElementType }[] = [
  { href: "/dashboard", key: "dashboard", icon: LayoutDashboard },
  { href: "/accounts", key: "accounts", icon: BookText },
  { href: "/journals", key: "journals", icon: FileText },
  { href: "/sales-invoices", key: "sales", icon: FileBarChart2 },
  { href: "/purchase-invoices", key: "purchases", icon: FileText },
  { href: "/payments", key: "payments", icon: Banknote },
  { href: "/reports", key: "reports", icon: ChartColumnBig },
  { href: "/parties", key: "parties", icon: Building2 },
  { href: "/items", key: "items", icon: Package },
  { href: "/fiscal-years", key: "fiscalYears", icon: CalendarRange },
  { href: "/settings", key: "settings", icon: Users },
];

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
        className="hidden md:flex w-64 shrink-0 flex-col border-e bg-sidebar text-sidebar-foreground"
      >
        <div className="flex h-14 items-center gap-2 px-4 border-b">
          <Link href="/dashboard" className="font-semibold tracking-tight text-lg">
            {t.appName}
          </Link>
        </div>
        <nav className="flex-1 overflow-y-auto py-2">
          <ul className="space-y-0.5 px-2">
            {NAV.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                      active
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    )}
                  >
                    <Icon className="size-4" />
                    <span>{dict.nav[item.key]}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="border-t p-3 text-xs text-muted-foreground">{t.appSub}</div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b px-4">
          <div className="flex items-center gap-3 md:hidden">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm">
                  {t.appName}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                {NAV.map((item) => (
                  <DropdownMenuItem key={item.href} asChild>
                    <Link href={item.href}>{dict.nav[item.key]}</Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="ms-auto flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => switchLocale("en")}
            >
              EN
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => switchLocale("ar")}
            >
              ع
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="max-w-48 truncate">
                  {user.name}
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
                    className="flex w-full items-center gap-2 px-2 py-1.5 text-sm hover:bg-accent rounded-sm cursor-pointer"
                  >
                    <LogOut className="size-4" /> {dict.nav.logout}
                  </button>
                </form>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6 min-w-0">{children}</main>
      </div>
    </div>
  );
}
