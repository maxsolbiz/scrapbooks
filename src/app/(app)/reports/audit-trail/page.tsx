"use server";

import { requireModule } from "@/lib/guard";
import { getServerLocale, getDictionary } from "@/lib/i18n";
import { getAuditTrail, type AuditTrailFilter } from "@/lib/reports";
import { PageHeader } from "@/components/layout/PageHeader";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default async function AuditTrailPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireModule("reports", "read");
  const locale = await getServerLocale();
  const t = getDictionary(locale);
  const params = await searchParams;

  const filters: AuditTrailFilter = {
    fromDate: params.fromDate ? new Date(params.fromDate) : undefined,
    toDate: params.toDate ? new Date(params.toDate) : undefined,
    userEmail: params.userEmail || undefined,
    action: params.action && params.action !== "All" ? params.action : undefined,
  };

  const rows = await getAuditTrail(filters);

  return (
    <div className="space-y-4">
      <PageHeader title={t.reports.auditTrail?.title || "Audit Trail"} />
      <Card>
        <CardContent>
          <form action="/reports/audit-trail" method="get" className="space-y-4">
            <div className="grid gap-3 md:grid-cols-4">
              <div className="space-y-1.5">
                <Label htmlFor="fromDate">{t.invoices.aging}</Label>
                <Input type="date" id="fromDate" name="fromDate" defaultValue={params.fromDate ?? ""} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="toDate">{t.invoices.dueDate}</Label>
                <Input type="date" id="toDate" name="toDate" defaultValue={params.toDate ?? ""} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="userEmail">{t.reports.auditTrail?.userEmail || "User"}</Label>
                <Input type="text" id="userEmail" name="userEmail" defaultValue={params.userEmail ?? ""} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="action">{t.reports.auditTrail?.action || "Action"}</Label>
                <Input type="text" id="action" name="action" defaultValue={params.action ?? ""} placeholder="e.g. INVOICE_REVISE" />
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="submit" variant="outline">{t.reports.auditTrail.filters || "Filter"}</Button>
              <Button type="button" variant="outline" onClick={() => {
                const url = "/api/reports/audit-trail/csv";
                fetch(url, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    fromDate: params.fromDate || undefined,
                    toDate: params.toDate || undefined,
                    userEmail: params.userEmail || undefined,
                    action: params.action || undefined,
                  }),
                }).then(async (r) => {
                  if (!r.ok) { const e = await r.json(); alert(e.error || "Failed"); return; }
                  const blob = await r.blob();
                  const href = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = href; a.download = `audit_trail_${new Date().toISOString().slice(0,10)}.csv`; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(href);
                }).catch((e) => alert(e instanceof Error ? e.message : "Failed"));
              }}>
                {t.reports.auditTrail?.exportCsv || "Export CSV"}
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
                <th className="text-left py-2">{t.common.date || "Date"}</th>
                <th className="text-left py-2">{t.reports.auditTrail?.userEmail || "User"}</th>
                <th className="text-left py-2">{t.reports.auditTrail?.action || "Action"}</th>
                <th className="text-left py-2">{t.reports.auditTrail?.entityType || "Entity"}</th>
                <th className="text-left py-2">{t.reports.auditTrail?.entityId || "Entity ID"}</th>
                <th className="text-left py-2">{t.reports.auditTrail?.detail || "Detail"}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b">
                  <td className="py-2">{r.createdAt.toISOString().slice(0, 10)}</td>
                  <td className="py-2 font-mono text-xs">{r.userEmail}</td>
                  <td className="py-2"><Badge variant="outline">{r.action}</Badge></td>
                  <td className="py-2 text-xs">{r.entityType ?? "—"}</td>
                  <td className="py-2 font-mono text-xs">{r.entityId ?? "—"}</td>
                  <td className="py-2 text-xs truncate max-w-xs">{r.detail ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
