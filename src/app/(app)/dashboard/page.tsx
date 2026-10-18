import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { accountBalance } from "@/lib/accounting";
import { formatAED } from "@/lib/money";
import { getServerLocale, getDictionary } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export default async function DashboardPage() {
  await auth();
  const locale = await getServerLocale();
  const t = getDictionary(locale);

  const [cash, bank, ar, ap] = await Promise.all([
    prisma.account.findUnique({ where: { code: "1110" } }),
    prisma.account.findUnique({ where: { code: "1120" } }),
    prisma.account.findUnique({ where: { code: "1130" } }),
    prisma.account.findUnique({ where: { code: "2100" } }),
  ]);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [cashBal, bankBal, arBal, apBal, revenue, recent] = await Promise.all([
    cash ? accountBalance(prisma, cash.id) : null,
    bank ? accountBalance(prisma, bank.id) : null,
    ar ? accountBalance(prisma, ar.id) : null,
    ap ? accountBalance(prisma, ap.id) : null,
    prisma.journalLine.aggregate({
      where: {
        entry: {
          status: "POSTED",
          date: { gte: monthStart, lte: now },
        },
        account: { code: { in: ["4100", "4200"] } },
      },
      _sum: { credit: true },
    }),
    prisma.journalEntry.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        entryNo: true,
        date: true,
        narration: true,
        status: true,
        sourceType: true,
      },
    }),
  ]);

  const cards = [
    { title: t.dashboard.cashBalance, value: cashBal?.balance ?? 0n },
    { title: t.dashboard.bankBalance, value: bankBal?.balance ?? 0n },
    { title: t.dashboard.receivables, value: arBal?.balance ?? 0n },
    { title: t.dashboard.payables, value: apBal?.balance ?? 0n },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t.dashboard.title}</h1>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.title}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {c.title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tabular-nums">
                {formatAED(c.value < 0n ? -c.value : c.value)}
              </div>
              <div className="text-xs text-muted-foreground">AED</div>
            </CardContent>
          </Card>
        ))}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t.dashboard.revenueThisMonth}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">
              {formatAED(revenue._sum.credit ?? 0n)}
            </div>
            <div className="text-xs text-muted-foreground">AED</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t.dashboard.recentEntries}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.common.code}</TableHead>
                <TableHead>{t.common.date}</TableHead>
                <TableHead>{t.common.description}</TableHead>
                <TableHead>{t.common.type}</TableHead>
                <TableHead>{t.common.status}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recent.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    {t.common.empty}
                  </TableCell>
                </TableRow>
              )}
              {recent.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="font-mono text-xs">
                    <Link
                      href={`/journals/${entry.id}`}
                      className="hover:underline"
                    >
                      {entry.entryNo}
                    </Link>
                  </TableCell>
                  <TableCell>{entry.date.toISOString().slice(0, 10)}</TableCell>
                  <TableCell className="max-w-64 truncate">{entry.narration ?? "—"}</TableCell>
                  <TableCell className="text-xs">{entry.sourceType}</TableCell>
                  <TableCell>
                    <Badge variant={entry.status === "POSTED" ? "default" : "secondary"}>
                      {entry.status}
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
