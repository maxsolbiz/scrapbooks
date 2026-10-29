"use server";

import { requireModule } from "@/lib/guard";
import { calculateAgingBuckets } from "@/lib/aging";
import { getServerLocale, getDictionary } from "@/lib/i18n";
import { formatAED } from "@/lib/money";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";

export default async function AgingPage() {
  await requireModule("reports");
  const locale = await getServerLocale();
  const t = getDictionary(locale);

  const aging = await calculateAgingBuckets("CUST-001"); // Default to demo customer for now; filter can be added

  return (
    <div className="space-y-4">
      <PageHeader title={t.invoices.aging || "Aging Report"} />

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-normal text-muted-foreground">{t.invoices.agingCurrent || "Current (0-30 days)"}</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{formatAED(aging.current)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-normal text-muted-foreground">{t.invoices.aging31to60 || "31-60 Days"}</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{formatAED(aging.days31to60)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-normal text-muted-foreground">{t.invoices.aging61to90 || "61-90 Days"}</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{formatAED(aging.days61to90)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-normal text-muted-foreground">{t.invoices.agingOver90 || "90+ Days"}</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-destructive">{formatAED(aging.over90)}</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">{t.invoices.aging || "Aging Analysis"}</h3>
            <Link href="/api/reports/aging/csv" target="_blank">
              <Badge variant="outline" className="cursor-pointer hover:bg-accent">{t.invoices.downloadPDF || "Download CSV"}</Badge>
            </Link>
          </div>
          <div className="rounded-lg border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-3">{t.invoices.item || "Category"}</th>
                  <th className="text-right px-4 py-3">{t.common.amount || "Amount"}</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b hover:bg-muted/20"><td className="px-4 py-3">{t.invoices.agingCurrent || "Current (0-30 days)"}</td><td className="text-right px-4 py-3 font-mono">{formatAED(aging.current)} AED</td></tr>
                <tr className="border-b hover:bg-muted/20"><td className="px-4 py-3">{t.invoices.aging31to60 || "31-60 Days"}</td><td className="text-right px-4 py-3 font-mono">{formatAED(aging.days31to60)} AED</td></tr>
                <tr className="border-b hover:bg-muted/20"><td className="px-4 py-3">{t.invoices.aging61to90 || "61-90 Days"}</td><td className="text-right px-4 py-3 font-mono">{formatAED(aging.days61to90)} AED</td></tr>
                <tr className="hover:bg-muted/20"><td className="px-4 py-3">{t.invoices.agingOver90 || "90+ Days"}</td><td className="text-right px-4 py-3 font-mono text-destructive">{formatAED(aging.over90)} AED</td></tr>
                <tr className="border-t font-bold bg-muted/30"><td className="px-4 py-3">{t.invoices.aging || "Aging Total"}</td><td className="text-right px-4 py-3 font-mono">{formatAED(aging.total)} AED</td></tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}