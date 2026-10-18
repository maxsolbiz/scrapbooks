import Link from "next/link";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/db";
import { moduleCan, requireModule, type SessionUser } from "@/lib/guard";
import { getServerLocale, getDictionary } from "@/lib/i18n";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function JournalsPage() {
  const user: SessionUser = await requireModule("journals");
  const locale = await getServerLocale();
  const t = getDictionary(locale);
  const ar = locale === "ar";

  const entries = await prisma.journalEntry.findMany({
    orderBy: { date: "desc" },
    take: 100,
    select: {
      id: true,
      entryNo: true,
      date: true,
      narration: true,
      narrationAr: true,
      status: true,
      sourceType: true,
    },
  });

  const canWrite = await moduleCan(user, "journals", "write");

  return (
    <div className="space-y-4">
      <PageHeader
        title={t.nav.journals}
        actions={
          canWrite ? (
            <Button asChild>
              <Link href="/journals/new">
                <Plus className="size-4" /> {t.journals.new}
              </Link>
            </Button>
          ) : undefined
        }
      />

      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.journals.entryNo}</TableHead>
                <TableHead>{t.common.date}</TableHead>
                <TableHead>{t.common.narration}</TableHead>
                <TableHead className="hidden sm:table-cell">{t.journals.source}</TableHead>
                <TableHead>{t.common.status}</TableHead>
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
                  <TableCell className="font-mono text-xs">
                    <Link href={`/journals/${e.id}`} className="hover:underline">
                      {e.entryNo}
                    </Link>
                  </TableCell>
                  <TableCell>{e.date.toISOString().slice(0, 10)}</TableCell>
                  <TableCell className="max-w-72 truncate">
                    {ar ? (e.narrationAr ?? e.narration) : (e.narration ?? "—")}
                  </TableCell>
                  <TableCell className="hidden text-xs sm:table-cell">{e.sourceType}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        e.status === "POSTED" ? "default" : e.status === "DRAFT" ? "secondary" : "outline"
                      }
                    >
                      {e.status}
                    </Badge>
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

export const dynamic = "force-dynamic";
