import { requireUser } from "@/lib/guard";
import { getServerLocale, getDictionary } from "@/lib/i18n";
import { balanceSheet } from "@/lib/reports";
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
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/layout/PageHeader";

export default async function BalanceSheetPage() {
  await requireUser();
  const locale = await getServerLocale();
  const t = getDictionary(locale);
  const asOf = new Date();
  const bs = await balanceSheet(asOf);

  return (
    <div className="space-y-4">
      <PageHeader title={t.nav.balanceSheet} description={`${t.nav.asOf} ${asOf.toISOString().slice(0, 10)}`} />
      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>—</TableHead>
                <TableHead className="text-end">AED</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell colSpan={2} className="bg-muted/50 font-semibold">
                  ASSETS
                </TableCell>
              </TableRow>
              {bs.assets.map((r) => (
                <TableRow key={r.account.id}>
                  <TableCell className="ps-6">
                    <span className="font-mono text-xs text-muted-foreground">{r.account.code}</span>{" "}
                    {r.account.nameEn}
                  </TableCell>
                  <TableCell className="text-end tabular-nums">
                    {(Number(r.amount) / 100).toFixed(2)}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell className="font-semibold ps-6">{t.nav.subtotal}</TableCell>
                <TableCell className="text-end tabular-nums font-semibold">
                  {(Number(bs.assetsTotal) / 100).toFixed(2)}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell colSpan={2} className="bg-muted/50 font-semibold">
                  LIABILITIES
                </TableCell>
              </TableRow>
              {bs.liabilities.map((r) => (
                <TableRow key={r.account.id}>
                  <TableCell className="ps-6">
                    <span className="font-mono text-xs text-muted-foreground">{r.account.code}</span>{" "}
                    {r.account.nameEn}
                  </TableCell>
                  <TableCell className="text-end tabular-nums">
                    {(Number(r.amount) / 100).toFixed(2)}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell colSpan={2} className="bg-muted/50 font-semibold">
                  EQUITY
                </TableCell>
              </TableRow>
              {bs.equity.map((r) => (
                <TableRow key={r.account.id}>
                  <TableCell className="ps-6">
                    <span className="font-mono text-xs text-muted-foreground">{r.account.code}</span>{" "}
                    {r.account.nameEn}
                  </TableCell>
                  <TableCell className="text-end tabular-nums">
                    {(Number(r.amount) / 100).toFixed(2)}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell className="ps-6">{t.nav.earnedEquity}</TableCell>
                <TableCell className="text-end tabular-nums">
                  {(Number(bs.earnedEquity) / 100).toFixed(2)}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-semibold ps-6">{t.nav.subtotal}</TableCell>
                <TableCell className="text-end tabular-nums font-semibold">
                  {(Number(bs.liabilitiesTotal + bs.equityTotal + bs.earnedEquity) / 100).toFixed(2)}
                </TableCell>
              </TableRow>
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className="font-semibold">
                  {t.nav.balanceCheck}
                  <Badge variant={bs.grandTotal === 0n ? "default" : "destructive"} className="ms-2">
                    {bs.grandTotal === 0n ? "BALANCED" : "CHECK"}
                  </Badge>
                </TableCell>
                <TableCell className="text-end tabular-nums font-semibold">
                  {(Number(bs.grandTotal) / 100).toFixed(2)}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
