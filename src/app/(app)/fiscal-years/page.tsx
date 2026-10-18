import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/guard";
import { getServerLocale, getDictionary } from "@/lib/i18n";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function FiscalYearsPage() {
  await requireUser();
  const locale = await getServerLocale();
  const t = getDictionary(locale);

  const years = await prisma.fiscalYear.findMany({ orderBy: { starts: "desc" } });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">{t.nav.fiscalYears}</h1>
      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.common.name}</TableHead>
                <TableHead>{t.nav.from}</TableHead>
                <TableHead>{t.nav.to}</TableHead>
                <TableHead>{t.common.status}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {years.map((y) => (
                <TableRow key={y.id}>
                  <TableCell className="font-medium">{y.name}</TableCell>
                  <TableCell>{y.starts.toISOString().slice(0, 10)}</TableCell>
                  <TableCell>{y.ends.toISOString().slice(0, 10)}</TableCell>
                  <TableCell>
                    <Badge variant={y.status === "OPEN" ? "default" : y.status === "CLOSED" ? "outline" : "secondary"}>
                      {y.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              {years.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    {t.common.empty}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
