import { prisma } from "@/lib/db";
import { requireModule } from "@/lib/guard";
import { getServerLocale, getDictionary } from "@/lib/i18n";
import { profitAndLoss } from "@/lib/reports";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/PageHeader";

export default async function ProfitLossPage() {
await requireModule("reports");
  const locale = await getServerLocale();
  const t = getDictionary(locale);

  const active = await prisma.fiscalYear.findFirst({
    where: { status: "OPEN" },
    orderBy: { starts: "desc" },
  });
  if (!active) {
    return <p className="text-muted-foreground">{t.common.empty}</p>;
  }
  const pl = await profitAndLoss(active);

  const row = (label: string, amount: bigint, strong = false) => (
    <TableRow key={label} className={strong ? "font-semibold" : undefined}>
      <TableCell className={strong ? "font-semibold" : undefined}>{label}</TableCell>
      <TableCell className="text-end tabular-nums">{(Number(amount) / 100).toFixed(2)}</TableCell>
    </TableRow>
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title={t.nav.profitLoss}
        description={`${t.nav.period} ${active.starts.toISOString().slice(0, 10)} â†’ ${active.ends.toISOString().slice(0, 10)}`}
      />
      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.nav.reportsSub}</TableHead>
                <TableHead className="text-end">AED</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pl.revenue.map((r) => row(r.account.nameEn, r.amount))}
              {row(t.nav.subtotal, pl.revenueTotal, true)}
              {pl.expenses.map((r) => row(r.account.nameEn, r.amount))}
              {row(t.nav.subtotal, pl.expenseTotal, true)}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className="font-semibold">{t.nav.netProfit}</TableCell>
                <TableCell className="text-end tabular-nums font-semibold">
                  {(Number(pl.net) / 100).toFixed(2)}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
