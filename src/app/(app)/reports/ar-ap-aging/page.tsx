import { requireUser } from "@/lib/guard";
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

function fmt(fils: bigint) {
  return (Number(fils) / 100).toFixed(2);
}

export default async function AgingPage({
  searchParams,
}: {
  searchParams: Promise<{ direction?: string }>;
}) {
  await requireUser();
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
        <h1 className="text-2xl font-semibold tracking-tight">{t.nav.arApAging}</h1>
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
        {dir === "SALES" ? t.payments.receipt : t.payments.payment} — {t.nav.reportsSub}
      </p>
      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.payments.invoice}</TableHead>
                <TableHead>{t.nav.parties}</TableHead>
                <TableHead>{t.common.date}</TableHead>
                <TableHead className="text-end">{t.nav.outstanding}</TableHead>
                <TableHead className="text-end">1-30</TableHead>
                <TableHead className="text-end">31-60</TableHead>
                <TableHead className="text-end">61-90</TableHead>
                <TableHead className="text-end">90+</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.invoiceNo}>
                  <TableCell className="font-mono text-xs">{r.invoiceNo}</TableCell>
                  <TableCell>{r.partyName}</TableCell>
                  <TableCell>{r.invoiceDate}</TableCell>
                  <TableCell className="text-end tabular-nums">{fmt(r.outstanding)}</TableCell>
                  <TableCell className="text-end tabular-nums">{r.d0_30 ? fmt(r.d0_30) : "—"}</TableCell>
                  <TableCell className="text-end tabular-nums">{r.d31_60 ? fmt(r.d31_60) : "—"}</TableCell>
                  <TableCell className="text-end tabular-nums">{r.d61_90 ? fmt(r.d61_90) : "—"}</TableCell>
                  <TableCell className="text-end tabular-nums">{r.d90plus ? fmt(r.d90plus) : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={3} className="font-semibold">{t.nav.total}</TableCell>
                <TableCell className="text-end tabular-nums font-semibold">{fmt(tOut)}</TableCell>
                <TableCell className="text-end tabular-nums font-semibold">{fmt(t030)}</TableCell>
                <TableCell className="text-end tabular-nums font-semibold">{fmt(t3160)}</TableCell>
                <TableCell className="text-end tabular-nums font-semibold">{fmt(t6190)}</TableCell>
                <TableCell className="text-end tabular-nums font-semibold">{fmt(t90p)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
