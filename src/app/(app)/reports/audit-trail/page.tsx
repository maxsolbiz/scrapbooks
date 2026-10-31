import { requireAuditAccess } from "@/lib/guard";
import { getServerLocale, getDictionary } from "@/lib/i18n";
import {
  getAuditTrail,
  parseAuditTrailParams,
  formatDubaiDate,
  AUDIT_ACTIONS,
  AUDIT_ACTION_SEVERITY,
} from "@/lib/reports";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AuditCsvButton } from "@/components/reports/AuditCsvButton";
import { AuditRow } from "@/components/reports/AuditRow";
import Link from "next/link";

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
  const pageSize = parsed.pageSize;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  // Clamp page to valid range so ?page=999 doesn't show an empty table.
  const clampedPage = Math.min(Math.max(1, parsed.page), pageCount);
  const hasPrev = clampedPage > 1;
  const hasNext = clampedPage < pageCount;

  const buildUrl = (overrides: Record<string, string | string[] | undefined>): string => {
    const search = new URLSearchParams();
    if (params.fromDate) search.set("fromDate", params.fromDate);
    if (params.toDate) search.set("toDate", params.toDate);
    if (params.userEmail) search.set("userEmail", params.userEmail);
    if (params.action) search.set("action", params.action);
    if (params.sort) search.set("sort", params.sort);
    if (params.order) search.set("order", params.order);
    search.set("pageSize", String(pageSize));
    for (const [key, value] of Object.entries(overrides)) {
      if (value === undefined || value === "") {
        search.delete(key);
      } else if (Array.isArray(value)) {
        value.forEach((v) => search.append(key, v));
      } else {
        search.set(key, value);
      }
    }
    return `/reports/audit-trail?${search.toString()}`;
  };

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
                <Label>{t.reports.auditTrail?.action || "Action"}</Label>
                <Select
                  name="action"
                  defaultValue={params.action && params.action !== "" && params.action !== "ALL" ? params.action : undefined}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t.reports.auditTrail?.action || "Action"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">{t.common.all || "All"}</SelectItem>
                    {AUDIT_ACTIONS.map((action) => (
                      <SelectItem key={action} value={action}>
                        {action}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="submit" variant="outline">{t.reports.auditTrail.filters || "Filter"}</Button>
              <Button asChild variant="outline">
                <Link href="/reports/audit-trail">{t.reports.auditTrail.reset || "Reset"}</Link>
              </Button>
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
          {total === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <p>{t.common.empty || "No records found"}</p>
            </div>
          ) : (
            <>
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
                    <AuditRow key={r.id} row={r} severity={AUDIT_ACTION_SEVERITY} />
                  ))}
                </tbody>
              </table>
              <div className="flex items-center justify-between gap-2 mt-2">
                {hasPrev ? (
                  <Link href={buildUrl({ page: String(clampedPage - 1) })}>
                    <Button variant="outline" size="sm">
                      {t.reports.auditTrail.prev || "Previous"}
                    </Button>
                  </Link>
                ) : (
                  <Button variant="outline" size="sm" disabled>
                    {t.reports.auditTrail.prev || "Previous"}
                  </Button>
                )}
                <span className="text-xs text-muted-foreground">
                  {t.reports.auditTrail.page || "Page"} {clampedPage} {t.reports.auditTrail.of || "of"} {pageCount}
                </span>
                {hasNext ? (
                  <Link href={buildUrl({ page: String(clampedPage + 1) })}>
                    <Button variant="outline" size="sm">
                      {t.reports.auditTrail.next || "Next"}
                    </Button>
                  </Link>
                ) : (
                  <Button variant="outline" size="sm" disabled>
                    {t.reports.auditTrail.next || "Next"}
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {(t.reports.auditTrail?.showing || "Showing {count} of {total} records")
                  .replace("{count}", String(rows.length))
                  .replace("{total}", String(total))}
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
