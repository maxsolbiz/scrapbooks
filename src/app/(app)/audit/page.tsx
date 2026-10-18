import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/guard";
import { getServerLocale, getDictionary } from "@/lib/i18n";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function AuditPage() {
  const user = await requireAdmin();
  void user;
  const locale = await getServerLocale();
  const t = getDictionary(locale);

  const entries = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <div className="space-y-4">
      <PageHeader title={t.audit.title} description={t.audit.description} />
      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.audit.when}</TableHead>
                <TableHead className="hidden sm:table-cell">{t.audit.who}</TableHead>
                <TableHead>{t.audit.action}</TableHead>
                <TableHead className="hidden sm:table-cell">{t.audit.entity}</TableHead>
                <TableHead className="hidden md:table-cell">{t.audit.detail}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    {t.common.empty}
                  </TableCell>
                </TableRow>
              )}
              {entries.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="text-xs whitespace-nowrap">
                    {e.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                  </TableCell>
                  <TableCell className="hidden text-xs sm:table-cell">{e.userEmail}</TableCell>
                  <TableCell>
                    <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{e.action}</span>
                  </TableCell>
                  <TableCell className="hidden max-w-32 truncate font-mono text-xs sm:table-cell">
                    {e.entityId ?? "—"}
                  </TableCell>
                  <TableCell className="hidden max-w-48 truncate text-xs text-muted-foreground md:table-cell">
                    {e.detail ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
