import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireModule } from "@/lib/guard";
import { getServerLocale, getDictionary } from "@/lib/i18n";
import { partyLedger } from "@/lib/reports";
import { partyLedgerHref, partyLedgerLabelKey } from "@/lib/party-ledger-kind";
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
  TableRow,
  TableHeader,
  TableHead,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/PageHeader";

const fmt = (n: bigint) => (Number(n) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default async function PartyLedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ party?: string }>;
}) {
await requireModule("reports");
  const locale = await getServerLocale();
  const t = getDictionary(locale);
  const { party } = await searchParams;

  const [parties, active] = await Promise.all([
    prisma.party.findMany({ orderBy: { code: "asc" } }),
    prisma.fiscalYear.findFirst({ where: { status: "OPEN" }, orderBy: { starts: "desc" } }),
  ]);
  const fiscal = active ?? (await prisma.fiscalYear.findFirst({ orderBy: { starts: "desc" } }));
  const selected = party ? parties.find((p) => p.id === party) : undefined;
  const rows = selected && fiscal ? await partyLedger(selected.id, fiscal) : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageHeader title={t.nav.partyLedger} className="mb-0" />
        <form action="/reports/party-ledger" method="get" className="flex items-center gap-2">
          <Select name="party" defaultValue={selected?.id ?? ""}>
            <SelectTrigger className="w-96">
              <SelectValue placeholder="\u2014" />
            </SelectTrigger>
            <SelectContent className="max-h-80">
              {parties.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  <span className="font-mono text-xs">{p.code}</span> {p.nameEn}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="submit" variant="outline">
            {t.common.post}
          </Button>
        </form>
      </div>

      {selected && (
        <Card>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t.common.date}</TableHead>
                  <TableHead className="hidden sm:table-cell">{t.common.type}</TableHead>
                  <TableHead>{t.payments.reference}</TableHead>
                  <TableHead className="hidden text-end sm:table-cell">{t.common.debit}</TableHead>
                  <TableHead className="hidden text-end sm:table-cell">{t.common.credit}</TableHead>
                  <TableHead className="text-end">{t.nav.runningBalance}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      {t.common.empty}
                    </TableCell>
                  </TableRow>
                )}
                {rows.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell>{r.date}</TableCell>
                    <TableCell className="hidden text-xs sm:table-cell">{(t as any).partyLedgerKind ? (t as any).partyLedgerKind[partyLedgerLabelKey(r.kind as any)] : r.kind}</TableCell>
                    <TableCell>
                      <Link
                        href={partyLedgerHref(r.kind as any, r.docId)}
                        className="hover:underline font-mono text-xs"
                      >
                        {r.docNo}
                      </Link>
                    </TableCell>
                    <TableCell className="hidden text-end tabular-nums sm:table-cell">{r.debit ? fmt(r.debit) : "\u2014"}</TableCell>
                    <TableCell className="hidden text-end tabular-nums sm:table-cell">{r.credit ? fmt(r.credit) : "\u2014"}</TableCell>
                    <TableCell className="text-end tabular-nums">{fmt(r.balance)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
