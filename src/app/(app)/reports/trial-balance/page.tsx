import { requireModule } from "@/lib/guard";
import { getServerLocale, getDictionary } from "@/lib/i18n";
import { trialBalance } from "@/lib/reports";
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

export default async function TrialBalancePage() {
await requireModule("reports");
  const locale = await getServerLocale();
  const t = getDictionary(locale);
  const asOf = new Date();
  const rows = await trialBalance(asOf);

  const debitGrand = rows.reduce((acc, r) => acc + (r.debitTotal > r.creditTotal ? r.debitTotal - r.creditTotal : 0n), 0n);
  const creditGrand = rows.reduce((acc, r) => acc + (r.creditTotal > r.debitTotal ? r.creditTotal - r.debitTotal : 0n), 0n);

  return (
    <div className="space-y-4">
      <PageHeader title={t.nav.trialBalance} description={`${t.nav.asOf} ${asOf.toISOString().slice(0, 10)}`} />
      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.common.code}</TableHead>
                <TableHead>{t.nav.accounts}</TableHead>
                <TableHead className="text-end">{t.common.debit}</TableHead>
                <TableHead className="text-end">{t.common.credit}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const balancingDebit = r.debitTotal - r.creditTotal;
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">{r.code}</TableCell>
                    <TableCell>{r.nameEn}</TableCell>
                    <TableCell className="text-end tabular-nums">
                      {balancingDebit > 0n ? (Number(balancingDebit) / 100).toFixed(2) : "â€”"}
                    </TableCell>
                    <TableCell className="text-end tabular-nums">
                      {balancingDebit < 0n ? (Number(-balancingDebit) / 100).toFixed(2) : "â€”"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={2} className="font-semibold">{t.nav.total}</TableCell>
                <TableCell className="text-end tabular-nums font-semibold">
                  {(Number(debitGrand) / 100).toFixed(2)}
                </TableCell>
                <TableCell className="text-end tabular-nums font-semibold">
                  {(Number(creditGrand) / 100).toFixed(2)}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
