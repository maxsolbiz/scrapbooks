import { prisma } from "@/lib/db";
import { requireModule } from "@/lib/guard";
import { getServerLocale, getDictionary } from "@/lib/i18n";
import { accountLedger } from "@/lib/reports";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
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

const fmt = (n: bigint) => (Number(n) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default async function AccountLedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string }>;
}) {
await requireModule("reports");
  const locale = await getServerLocale();
  const t = getDictionary(locale);
  const { account } = await searchParams;

  const [accounts, active] = await Promise.all([
    prisma.account.findMany({ orderBy: { code: "asc" } }),
    prisma.fiscalYear.findFirst({ where: { status: "OPEN" }, orderBy: { starts: "desc" } }),
  ]);
  const selected = accounts.find((a) => a.id === account) ?? accounts[0];
  const fiscal = active ?? (await prisma.fiscalYear.findFirst({ orderBy: { starts: "desc" } }));
  const ledger = selected && fiscal ? await accountLedger(selected.id, fiscal) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageHeader title={t.nav.accountLedger} className="mb-0" />
        <form action="/reports/account-ledger" method="get" className="flex items-center gap-2">
          <input type="hidden" name="open" value="1" />
          <Select name="account" defaultValue={selected?.id}>
            <SelectTrigger className="w-96">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-80">
              {accounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  <span className="font-mono text-xs">{a.code}</span> {a.nameEn}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="submit" variant="outline">
            {t.common.post}
          </Button>
        </form>
      </div>

      {selected && fiscal && ledger && (
        <Card>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t.common.date}</TableHead>
                  <TableHead className="hidden sm:table-cell">{t.nav.journals}</TableHead>
                  <TableHead>{t.common.notes}</TableHead>
                  <TableHead className="hidden text-end sm:table-cell">{t.common.debit}</TableHead>
                  <TableHead className="hidden text-end sm:table-cell">{t.common.credit}</TableHead>
                  <TableHead className="text-end">{t.nav.runningBalance}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                  <TableRow>
                    <TableCell colSpan={2} className="text-xs text-muted-foreground">
                      {t.nav.opening}
                    </TableCell>
                    <TableCell colSpan={4} className="text-end tabular-nums">
                      {fmt(ledger.startingBalance)}
                    </TableCell>
                  </TableRow>
                {ledger.rows.map((row, i) => (
                  <TableRow key={i}>
                    <TableCell>{row.date}</TableCell>
                    <TableCell className="hidden font-mono text-xs sm:table-cell">{row.entryNo}</TableCell>
                    <TableCell className="text-xs">{row.narration}</TableCell>
                    <TableCell className="hidden text-end tabular-nums sm:table-cell">
                      {row.debit ? fmt(row.debit) : "\u2014"}
                    </TableCell>
                    <TableCell className="hidden text-end tabular-nums sm:table-cell">
                      {row.credit ? fmt(row.credit) : "\u2014"}
                    </TableCell>
                    <TableCell className="text-end tabular-nums">{fmt(row.balance)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={5} className="font-semibold">
                    {t.nav.closing}
                  </TableCell>
                  <TableCell className="text-end tabular-nums font-semibold">
                    {fmt(ledger.endingBalance)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
