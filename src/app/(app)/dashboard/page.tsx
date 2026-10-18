import Link from "next/link";
import {
  Banknote,
  Building2,
  CalendarClock,
  Landmark,
  Scale,
  TrendingUp,
  Wallet,
  ShieldCheck,
} from "lucide-react";
import { prisma } from "@/lib/db";
import { accountBalance } from "@/lib/accounting";
import { formatAED } from "@/lib/money";
import { getServerLocale, getDictionary } from "@/lib/i18n";
import { KpiCard } from "@/components/ui/kpi-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { BarsChart, SparkLine } from "@/components/reports/ChartSVG";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default async function DashboardPage() {
  await prisma.$connect();
  const locale = await getServerLocale();
  const t = getDictionary(locale);

  const [cash, bank, ar, ap, vat, activeFy] = await Promise.all([
    prisma.account.findUnique({ where: { code: "1110" } }),
    prisma.account.findUnique({ where: { code: "1120" } }),
    prisma.account.findUnique({ where: { code: "1130" } }),
    prisma.account.findUnique({ where: { code: "2100" } }),
    prisma.account.findUnique({ where: { code: "2150" } }),
    prisma.fiscalYear.findFirst({ where: { status: "OPEN" }, orderBy: { starts: "desc" } }),
  ]);

  const asOf = new Date();
  const yearStart = activeFy ? activeFy.starts : new Date(asOf.getFullYear(), 0, 1);

  const [cashBal, bankBal, arBal, apBal, vatBal, plLines, cashLines, recent] = await Promise.all([
    cash ? accountBalance(prisma, cash.id) : null,
    bank ? accountBalance(prisma, bank.id) : null,
    ar ? accountBalance(prisma, ar.id) : null,
    ap ? accountBalance(prisma, ap.id) : null,
    vat ? accountBalance(prisma, vat.id) : null,
    prisma.journalLine.findMany({
      where: {
        entry: { status: "POSTED" },
        account: { type: { in: ["INCOME", "EXPENSE"] as ("INCOME" | "EXPENSE")[] } },
      },
      include: { account: { select: { type: true } }, entry: { select: { date: true } } },
    }),
    cash
      ? prisma.journalLine.findMany({
          where: {
            accountId: cash.id,
            entry: { status: "POSTED" },
          },
          orderBy: [{ entry: { date: "asc" } }, { id: "asc" }],
          select: { debit: true, credit: true, entry: { select: { date: true } } },
        })
      : [],
    prisma.journalEntry.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        entryNo: true,
        date: true,
        narration: true,
        status: true,
        sourceType: true,
      },
    }),
  ]);

  // monthly revenue / expense for the active year
  const monthMap = new Map<string, { revenue: bigint; expense: bigint }>();
  const year = yearStart.getFullYear();
  for (let m = 0; m < 12; m++) {
    monthMap.set(`${year}-${m}`, { revenue: 0n, expense: 0n });
  }
  let revenueTotal = 0n;
  let expenseTotal = 0n;
  for (const l of plLines) {
    const d = l.entry.date;
    if (d < yearStart) continue;
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const bucket = monthMap.get(key);
    if (!bucket) continue;
    const credit = l.credit ?? 0n;
    const debit = l.debit ?? 0n;
    if (l.account.type === "INCOME") {
      const v = credit - debit;
      if (v > 0n) {
        bucket.revenue += v;
        revenueTotal += v;
      }
    } else {
      const v = debit - credit;
      if (v > 0n) {
        bucket.expense += v;
        expenseTotal += v;
      }
    }
  }
  const netProfit = revenueTotal - expenseTotal;
  const bars = monthMap.get(`${year}-${Math.min(asOf.getMonth(), 11)}`) ?? { revenue: 0n, expense: 0n };
  const chartData = Array.from({ length: asOf.getMonth() + 1 }, (_, m) => {
    const b = monthMap.get(`${year}-${m}`) ?? { revenue: 0n, expense: 0n };
    return { label: MONTHS[m], revenue: b.revenue, expense: b.expense };
  });

  // cash end-of-month running balance for sparkline
  let running = 0n;
  const monthEndBal = new Map<string, bigint>();
  for (const l of cashLines) {
    running += (l.debit ?? 0n) - (l.credit ?? 0n);
    const d = l.entry.date;
    if (d >= yearStart) {
      monthEndBal.set(`${d.getFullYear()}-${d.getMonth()}`, running);
    }
  }
  const sparkPoints = Array.from({ length: asOf.getMonth() + 1 }, (_, m) => ({
    label: MONTHS[m],
    balance: monthEndBal.get(`${year}-${m}`) ?? 0n,
  }));
  if (sparkPoints.length < 2) {
    sparkPoints.unshift({ label: MONTHS[0], balance: 0n }, { label: MONTHS[0], balance: running });
  }

  const kpis = [
    { label: t.dashboard.cashBalance, icon: Wallet, value: cashBal?.balance ?? 0n, href: "/reports/account-ledger?account=" + (cash?.id ?? ""), tone: "pos" },
    { label: t.dashboard.bankBalance, icon: Landmark, value: bankBal?.balance ?? 0n, href: "/reports/account-ledger?account=" + (bank?.id ?? ""), tone: "pos" },
    { label: t.dashboard.receivables, icon: Building2, value: arBal?.debit ?? 0n, href: "/reports/ar-ap-aging?direction=SALES", tone: "warn" },
    { label: t.dashboard.payables, icon: Scale, value: apBal?.credit ?? 0n, href: "/reports/ar-ap-aging?direction=PURCHASE", tone: "neg" },
    { label: t.dashboard.vatPayable, icon: ShieldCheck, value: vatBal?.credit ?? 0n, href: "/reports/trial-balance", tone: "neut" },
  ] as const;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {kpis.map((k) => (
          <KpiCard
            key={k.label}
            label={k.label}
            icon={k.icon}
            value={k.value}
            href={k.href}
          />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="text-sm font-medium">
                {t.nav.profitLoss}
              </CardTitle>
              <CardDescription className="text-xs">
                {activeFy ? `${activeFy.name}` : year}
              </CardDescription>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {t.dashboard.netProfit} (AED)
              </p>
              <p
                className={
                  "text-xl font-semibold tabular-nums font-mono " +
                  (netProfit >= 0n ? "text-emerald-700 dark:text-emerald-400" : "text-destructive")
                }
              >
                {netProfit < 0n ? "-" : ""}
                {formatAED(netProfit < 0n ? -netProfit : netProfit)}
              </p>
            </div>
          </CardHeader>
          <CardContent>
            <BarsChart data={chartData} />
            <div className="mt-2 flex gap-4 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="size-2 rounded-sm" style={{ background: "var(--chart-1)" }} /> {t.dashboard.revenue}
              </span>
              <span className="flex items-center gap-1">
                <span className="size-2 rounded-sm" style={{ background: "var(--chart-3)" }} /> {t.dashboard.expenses}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="text-sm font-medium">{t.dashboard.cashBalance}</CardTitle>
              <CardDescription className="text-xs">
                {MONTHS[0]} — {MONTHS[asOf.getMonth()]}
              </CardDescription>
            </div>
            <p className="text-sm font-semibold tabular-nums font-mono">
              {running < 0n ? "-" : ""}
              {formatAED(running < 0n ? -running : running)}
            </p>
          </CardHeader>
          <CardContent>
            <SparkLine points={sparkPoints} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2 flex-row items-center justify-between">
          <CardTitle className="text-base">{t.dashboard.recentEntries}</CardTitle>
          <CalendarClock className="size-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.common.code}</TableHead>
                <TableHead>{t.common.date}</TableHead>
                <TableHead>{t.common.description}</TableHead>
                <TableHead>{t.common.type}</TableHead>
                <TableHead>{t.common.status}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recent.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    {t.common.empty}
                  </TableCell>
                </TableRow>
              )}
              {recent.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="font-mono text-xs">
                    <Link href={`/journals/${entry.id}`} className="hover:underline">
                      {entry.entryNo}
                    </Link>
                  </TableCell>
                  <TableCell className="text-xs">{entry.date.toISOString().slice(0, 10)}</TableCell>
                  <TableCell className="max-w-64 truncate text-xs">
                    {entry.narration ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{entry.sourceType}</TableCell>
                  <TableCell>
                    <StatusBadge status={entry.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
