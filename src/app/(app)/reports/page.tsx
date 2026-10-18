import Link from "next/link";
import { ChartColumnBig } from "lucide-react";
import { requireUser } from "@/lib/guard";
import { getServerLocale, getDictionary } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/PageHeader";

const REPORTS = [
  { href: "/reports/trial-balance", key: "trialBalance" },
  { href: "/reports/profit-loss", key: "profitLoss" },
  { href: "/reports/balance-sheet", key: "balanceSheet" },
  { href: "/reports/account-ledger", key: "accountLedger" },
  { href: "/reports/party-ledger", key: "partyLedger" },
  { href: "/reports/ar-ap-aging", key: "arApAging" },
] as const;

export default async function ReportsPage() {
  await requireUser();
  const locale = await getServerLocale();
  const t = getDictionary(locale);

  return (
    <div className="space-y-4">
      <PageHeader title={t.nav.reports} description={t.nav.reportsSub} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {REPORTS.map((r) => (
          <Link key={r.href} href={r.href}>
            <Card className="transition-colors hover:bg-accent/40 h-full">
              <CardHeader className="flex-row items-center gap-2">
                <ChartColumnBig className="size-5 text-muted-foreground" />
                <CardTitle className="text-base">{t.nav[r.key as keyof typeof t.nav]}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {t.nav.reportsSub}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
