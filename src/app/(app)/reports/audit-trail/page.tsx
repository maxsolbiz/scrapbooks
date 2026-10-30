import { requireAuditAccess } from "@/lib/guard";
import { getServerLocale, getDictionary } from "@/lib/i18n";
import {
  getAuditTrail,
  parseAuditTrailParams,
  formatDubaiDate,
  formatDubaiDateTime,
} from "@/lib/reports";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuditCsvButton } from "@/components/reports/AuditCsvButton";

export default async function AuditTrailPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireAuditAccess();
  const locale = await getServerLocale();
  const t = getDictionary(locale);
  const params = await searchParams;
  const parsed = parseAuditTrailParams(params);

  const { rows, total } = await getAuditTrail(parsed);

  return (
    <div className="space-y-4">
      <PageHeader title={t.reports.auditTrail?.title || "Audit Trail"} />
      <Card>
        <CardContent>
          <form action="/reports/audit-trail" method="get" className="space-y-4">
            <div className="grid gap-3 md:grid-cols-4">
              <div className="space-y-1.5">
                <Label htmlFor="fromDate">{t.reports.auditTrail?.fromDate || "From Date"}</Label>
                <Input
                  type="date"
                  id="fromDate"
                  name="fromDate"
                  defaultValue={parsed.fromDate ? formatDubaiDate(parsed.fromDate) : ""}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="toDate">{t.reports.auditTrail?.toDate || "To Date"}</Label>
                <Input
                  type="date"
                  id="toDate"
                  name="toDate"
                  defaultValue={parsed.toDate ? formatDubaiDate(parsed.toDate) : ""}
                />
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
              <AuditCsvButton
                filters={{
                  fromDate: params.fromDate || undefined,
                  toDate: params.toDate || undefined,
                  userEmail: params.userEmail || undefined,
                  action: params.action || undefined,
                }}
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
                <th className="text-left py-2">{t.common.date || "Date"}</th>
                <th className="text-left py-2">{t.reports.auditTrail?.userEmail || "User"}</th>
                <th className="text-left py-2">{t.reports.auditTrail?.action || "Action"}</th>
                <th className="text-left py-2">{t.reports.auditTrail?.entityType || "Entity"}</th>
                <th className="text-left py-2">{t.reports.auditTrail?.entityId || "Entity ID"}</th>
                <th className="text-left py-2">{t.reports.auditTrail?.detail || "Detail"}</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-4 text-center text-muted-foreground">
                    {t.common.empty || "No records found"}
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} className="border-b">
                  <td className="py-2">{formatDubaiDateTime(r.createdAt)}</td>
                  <td className="py-2 font-mono text-xs">{r.userEmail}</td>
                  <td className="py-2"><Badge variant="outline">{r.action}</Badge></td>
                  <td className="py-2 text-xs">{r.entityType ?? "—"}</td>
                  <td className="py-2 font-mono text-xs">{r.entityId ?? "—"}</td>
                  <td className="py-2 text-xs truncate max-w-xs">{r.detail ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-muted-foreground">
            {(t.reports.auditTrail?.showing || "Showing {count} of {total} records")
              .replace("{count}", String(rows.length))
              .replace("{total}", String(total))}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
