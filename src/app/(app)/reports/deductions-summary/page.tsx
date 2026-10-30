"use server";

import { requireModule } from "@/lib/guard";
import { getServerLocale, getDictionary } from "@/lib/i18n";
import { getDeductionsSummary, type DeductionsSummaryFilter } from "@/lib/reports";
import { PageHeader } from "@/components/layout/PageHeader";
import { formatAED } from "@/lib/money";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default async function DeductionsSummaryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireModule("reports", "read");
  const locale = await getServerLocale();
  const t = getDictionary(locale);
  const params = await searchParams;

  const filters: DeductionsSummaryFilter = {
    fromDate: params.fromDate ? new Date(params.fromDate) : undefined,
    toDate: params.toDate ? new Date(params.toDate) : undefined,
    reason: params.reason || undefined,
    partyId: params.partyId || undefined,
    direction: (params.direction as any) || "ALL",
  };

  const rows = await getDeductionsSummary(filters);

  return (
    <div className="space-y-4">
      <PageHeader title={t.reports.deductionsSummary?.title || "Deductions Summary"} />
      <Card>
        <CardContent>
          <form action="/reports/deductions-summary" method="get" className="space-y-4">
            <div className="grid gap-3 md:grid-cols-4">
              <div className="space-y-1.5">
                <Label htmlFor="fromDate">{t.reports.deductionsSummary?.fromDate || "From Date"}</Label>
                <Input type="date" id="fromDate" name="fromDate" defaultValue={params.fromDate ?? ""} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="toDate">{t.reports.deductionsSummary?.toDate || "To Date"}</Label>
                <Input type="date" id="toDate" name="toDate" defaultValue={params.toDate ?? ""} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reason">{t.reports.deductionsSummary?.reason || "Reason"}</Label>
                <Select name="reason" defaultValue={params.reason ?? "ALL"}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All</SelectItem>
                    <SelectItem value="SHORTAGE">Shortage</SelectItem>
                    <SelectItem value="DAMAGE">Damage</SelectItem>
                    <SelectItem value="COMMERCIAL_DISCOUNT">Commercial Discount</SelectItem>
                    <SelectItem value="RETURN">Return</SelectItem>
                    <SelectItem value="OTHER">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="direction">{t.reports.deductionsSummary?.direction || "Direction"}</Label>
                <Select name="direction" defaultValue={params.direction ?? "ALL"}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All</SelectItem>
                    <SelectItem value="SALES">Sales</SelectItem>
                    <SelectItem value="PURCHASE">Purchase</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="submit" variant="outline">Filter</Button>
              <Button type="button" variant="outline" onClick={() => {
                const url = "/api/reports/deductions-summary/csv";
                fetch(url, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    fromDate: params.fromDate || undefined,
                    toDate: params.toDate || undefined,
                    reason: params.reason || undefined,
                    partyId: params.partyId || undefined,
                    direction: params.direction || "ALL",
                  }),
                }).then(async (r) => {
                  if (!r.ok) { const e = await r.json(); alert(e.error || "Failed"); return; }
                  const blob = await r.blob();
                  const href = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = href; a.download = `deductions_summary_${new Date().toISOString().slice(0, 10)}.csv`; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(href);
                }).catch((e) => alert(e instanceof Error ? e.message : "Failed"));
              }}>
                {t.reports.deductionsSummary?.exportCsv || "Export CSV"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2">{t.reports.deductionsSummary?.colDate || "Date"}</th>
                <th className="text-left py-2">{t.reports.deductionsSummary?.colInvoiceNo || "Invoice No"}</th>
                <th className="text-left py-2">{t.reports.deductionsSummary?.colParty || "Party"}</th>
                <th className="text-left py-2">{t.reports.deductionsSummary?.colReason || "Reason"}</th>
                <th className="text-right py-2">{t.reports.deductionsSummary?.colBase || "Base (AED)"}</th>
                <th className="text-right py-2">{t.reports.deductionsSummary?.colVat || "VAT (AED)"}</th>
                <th className="text-right py-2">{t.reports.deductionsSummary?.colTotal || "Total (AED)"}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b">
                  <td className="py-2">{r.createdAt.toISOString().slice(0, 10)}</td>
                  <td className="py-2 font-mono text-xs">{r.invoiceNo}</td>
                  <td className="py-2">{r.partyName}</td>
                  <td className="py-2">{r.reason}</td>
                  <td className="text-right py-2 font-mono">{formatAED(r.baseAmountFils)}</td>
                  <td className="text-right py-2 font-mono">{formatAED(r.vatFils)}</td>
                  <td className="text-right py-2 font-mono font-bold">{formatAED(r.totalFils)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
