"use server";

import { requireModule } from "@/lib/guard";
import { getServerLocale, getDictionary } from "@/lib/i18n";
import { getInvoiceRegister, type InvoiceRegisterFilter } from "@/lib/reports";
import { PageHeader } from "@/components/layout/PageHeader";
import { formatAED } from "@/lib/money";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ExportCsvButton } from "@/components/reports/ExportCsvButton";

export default async function InvoiceRegisterPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireModule("reports");
  const locale = await getServerLocale();
  const t = getDictionary(locale);
  const params = await searchParams;

  const filters: InvoiceRegisterFilter = {
    fromDate: params.fromDate ? new Date(params.fromDate) : undefined,
    toDate: params.toDate ? new Date(params.toDate) : undefined,
    partyId: params.partyId || undefined,
    direction: (params.direction as any) || "ALL",
    status: (params.status as any) || "ALL",
  };

  const rows = await getInvoiceRegister(filters);

  return (
    <div className="space-y-4">
      <PageHeader title={t.reports.invoiceRegister.title} />
      
      <Card>
        <CardContent>
          <form action="/reports/invoice-register" method="get" className="space-y-4">
            <div className="grid gap-3 md:grid-cols-4">
              <div className="space-y-1.5">
                <Label htmlFor="fromDate">{t.invoices.aging}</Label>
                <Input type="date" id="fromDate" name="fromDate" defaultValue={params.fromDate ?? ""} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="toDate">{t.common.to}</Label>
                <Input type="date" id="toDate" name="toDate" defaultValue={params.toDate ?? ""} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="direction">{t.invoices.statementTransactions}</Label>
                <Select name="direction" defaultValue={params.direction ?? "ALL"}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All</SelectItem>
                    <SelectItem value="SALES">Sales</SelectItem>
                    <SelectItem value="PURCHASE">Purchase</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="status">Status</Label>
                <Select name="status" defaultValue={params.status ?? "ALL"}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All</SelectItem>
                    <SelectItem value="POSTED">Posted</SelectItem>
                    <SelectItem value="VOID">Void</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="submit" variant="outline">Filter</Button>
              <ExportCsvButton
                filters={{
                  fromDate: params.fromDate ?? undefined,
                  toDate: params.toDate ?? undefined,
                  partyId: params.partyId ?? undefined,
                  direction: (params.direction as string) || "ALL",
                  status: (params.status as string) || "ALL",
                }}
                exportCsvLabel={t.reports.invoiceRegister.exportCsv}
              />
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2">{t.common.date}</th>
                <th className="text-left py-2">{t.invoices.item}</th>
                <th className="text-left py-2">{t.nav.parties}</th>
                <th className="text-right py-2">{t.invoices.lineTotal}</th>
                <th className="text-right py-2">{t.invoices.statementTotalPaid}</th>
                <th className="text-right py-2">{t.invoices.statementOutstanding}</th>
                <th className="text-left py-2">{t.invoices.paymentStatus}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((inv) => (
                <tr key={inv.id} className="border-b">
                  <td className="py-2">{inv.date.toISOString().slice(0, 10)}</td>
                  <td className="py-2 font-mono text-xs">{inv.invoiceNo}</td>
                  <td className="py-2">{inv.partyName}</td>
                  <td className="text-right py-2">{formatAED(inv.totalFils)}</td>
                  <td className="text-right py-2">{formatAED(inv.paidFils)}</td>
                  <td className="text-right py-2">{inv.outstandingFils > 0n ? formatAED(inv.outstandingFils) : "—"}</td>
                  <td className="py-2 capitalize">{inv.paymentStatus}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}