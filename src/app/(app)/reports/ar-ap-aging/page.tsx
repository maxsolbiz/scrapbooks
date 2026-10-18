import { requireModule } from "@/lib/guard";
import { getServerLocale, getDictionary } from "@/lib/i18n";
import { agingReport } from "@/lib/reports";
import Link from "next/link";
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

const fmt = (n: bigint) => (Number(n) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default async function AgingPage({
  searchParams,
}: {
  searchParams: Promise<{ direction?: string }>;
}) {
await requireModule("reports");
  const locale = await getServerLocale();
  const t = getDictionary(locale);
  const { direction } = await searchParams;
  const dir = direction === "PURCHASE" ? "PURCHASE" : "SALES";
  const rows = await agingReport(dir);

  const sum = (sel: (r: (typeof rows)[number]) => bigint) =>
    rows.reduce((acc, r) => acc + sel(r), 0n);
  const t030 = sum((r) => r.d0_30);
  const t3160 = sum((r) => r.d31_60);
  const t6190 = sum((r) => r.d61_90);
  const t90p = sum((r) => r.d90plus);
  const tOut = sum((r) => r.outstanding);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageHeader title={t.nav.arApAging} className="mb-0" />
        <div className="flex gap-2">
          <Link href="/reports/ar-ap-aging?direction=SALES">
            <Badge variant={dir === "SALES" ? "default" : "outline"}>AR</Badge>
          </Link>
          <Link href="/reports/ar-ap-aging?direction=PURCHASE">
            <Badge variant={dir === "PURCHASE" ? "default" : "outline"}>AP</Badge>
          </Link>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        {dir === "SALES" ? t.payments.receipt : t.payments.payment} \u2014 {t.nav.reportsSub}
      </p>
      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.payments.invoice}</TableHead>
                <TableHead>{t.nav.parties}</TableHead>
                <TableHead className="hidden sm:table-cell">{t.common.date}</TableHead>
                <TableHead className="text-end">{t.nav.outstanding}</TableHead>
                <TableHead className="hidden text-end sm:table-cell">1-30</TableHead>
                <TableHead className="hidden text-end sm:table-cell">31-60</TableHead>
                <TableHead className="hidden text-end sm:table-cell">61-90</TableHead>
                <TableHead className="hidden text-end sm:table-cell">90+</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.invoiceNo}>
                  <TableCell className="hidden font-mono text-xs sm:table-cell">{r.invoiceNo}</TableCell>
                  <TableCell>{r.partyName}</TableCell>
                  <TableCell className="hidden sm:table-cell">{r.invoiceDate}</TableCell>
                  <TableCell className="text-end tabular-nums">{fmt(r.outstanding)}</TableCell>
<TableCell className="hidden text-end tabular-nums sm:table-cell">{r.d0_30 ? fmt(r.d0_30) : "\u2014"}</TableCell>
<TableCell className="hidden text-end tabular-nums sm:table-cell">{r.d31_60 ? fmt(r.d31_60) : "\u2014"}</TableCell>
<TableCell className="hidden text-end tabular-nums sm:table-cell">{r.d61_90 ? fmt(r.d61_90) : "\u2014"}</TableCell>
<TableCell className="hidden text-end tabular-nums sm:table-cell">{r.d90plus ? fmt(r.d90plus) : "\u2014"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={3} className="font-semibold">{t.nav.total}</TableCell>
                <TableCell className="text-end tabular-nums font-semibold">{fmt(tOut)}</TableCell>
                <TableCell className="hidden text-end tabular-nums font-semibold sm:table-cell">{fmt(t030)}</TableCell>
                <TableCell className="hidden text-end tabular-nums font-semibold sm:table-cell">{fmt(t3160)}</TableCell>
                <TableCell className="hidden text-end tabular-nums font-semibold sm:table-cell">{fmt(t6190)}</TableCell>
                <TableCell className="hidden text-end tabular-nums font-semibold sm:table-cell">{fmt(t90p)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
