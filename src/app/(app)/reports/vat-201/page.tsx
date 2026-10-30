"use server";

import { requireModule } from "@/lib/guard";
import { getServerLocale, getDictionary } from "@/lib/i18n";
import { calculateVAT201, type VAT201Filter } from "@/lib/vat-return";
import { PageHeader } from "@/components/layout/PageHeader";
import { formatAED } from "@/lib/money";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default async function VAT201Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireModule("reports", "read");
  const locale = await getServerLocale();
  const t = getDictionary(locale);
  const params = await searchParams;

  // Default fiscal year from settings or current year — for simplicity use a parameter.
  const fyParam = params.fiscalYear || "FY2026";
  const fromDateParam = params.fromDate || "";
  const toDateParam = params.toDate || "";

  // Find fiscal year by name; fall back to a dummy if absent (for display only).
  const fiscalYears = await import("@/lib/db").then((db) =>
    db.prisma.fiscalYear.findMany({ orderBy: { starts: "desc" } })
  ).catch(() => [{ id: "fy-default", name: "FY2026", starts: new Date("2026-01-01"), ends: new Date("2026-12-31"), status: "OPEN" as const, createdAt: new Date(), updatedAt: new Date() }]);
  const fy = fiscalYears.find((y) => y.name === fyParam) ?? fiscalYears[0];

  const filters: VAT201Filter = {
    fiscalYearId: fy.id,
    fromDate: fromDateParam ? new Date(fromDateParam) : fy.starts,
    toDate: toDateParam ? new Date(toDateParam) : fy.ends,
  };

  const vat = await calculateVAT201(filters);

  const boxes = [
    { label: vat.box1.label, base: vat.box1.amountFils, vat: vat.box1.vatFils },
    { label: vat.box2.label, base: 0n, vat: vat.box2.vatFils },
    { label: vat.box3.label, base: vat.box3.amountFils, vat: vat.box3.vatFils },
    { label: vat.box6.label, base: vat.box6.amountFils, vat: vat.box6.vatFils },
    { label: vat.box7.label, base: 0n, vat: vat.box7.vatFils },
    { label: vat.box8Sales.label, base: vat.box8Sales.amountFils, vat: vat.box8Sales.vatFils },
    { label: vat.box9Sales.label, base: 0n, vat: vat.box9Sales.vatFils },
    { label: vat.box8Purchase.label, base: vat.box8Purchase.amountFils, vat: vat.box8Purchase.vatFils },
    { label: vat.box9Purchase.label, base: 0n, vat: vat.box9Purchase.vatFils },
  ];

  return (
    <div className="space-y-4">
      <PageHeader title={t.reports.auditTrail?.title ? t.reports.auditTrail.title.replace("Audit Trail", "VAT 201 Return") : "VAT 201 Return"} />
      <Card>
        <CardContent>
          <form action="/reports/vat-201" method="get" className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="fiscalYear">{t.reports.auditTrail?.userEmail || "Fiscal Year"}</Label>
                <Select name="fiscalYear" defaultValue={fyParam}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {fiscalYears.map((y) => (
                      <SelectItem key={y.id} value={y.name}>{y.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fromDate">{t.reports.auditTrail?.fromDate || "From Date"}</Label>
                <Input type="date" id="fromDate" name="fromDate" defaultValue={fromDateParam || fy.starts.toISOString().slice(0, 10)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="toDate">{t.reports.auditTrail?.toDate || "To Date"}</Label>
                <Input type="date" id="toDate" name="toDate" defaultValue={toDateParam || fy.ends.toISOString().slice(0, 10)} />
              </div>
            </div>
              <Button type="submit" variant="outline">{t.reports.vat201.filters || "Filter"}</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2">{t.reports.auditTrail?.action || "Box"}</th>
                <th className="text-right py-2">Base (AED)</th>
                <th className="text-right py-2">VAT (AED)</th>
              </tr>
            </thead>
            <tbody>
              {boxes.map((b) => (
                <tr key={b.label} className="border-b">
                  <td className="py-2 text-xs font-medium">{b.label}</td>
                  <td className="text-right py-2 font-mono">{formatAED(b.base)}</td>
                  <td className="text-right py-2 font-mono">{formatAED(b.vat)}</td>
                </tr>
              ))}
              <tr className="font-bold">
                <td className="py-2">{t.reports.vat201.netVatPayable || "Net VAT Payable (Recoverable)"}</td>
                <td />
                <td className="text-right py-2 font-mono">{formatAED(vat.netVatPayable)}</td>
              </tr>
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
