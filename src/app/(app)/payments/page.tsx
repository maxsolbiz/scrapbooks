import Link from "next/link";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/guard";
import { getServerLocale, getDictionary } from "@/lib/i18n";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function PaymentsPage() {
  await requireUser();
  const locale = await getServerLocale();
  const t = getDictionary(locale);

  const payments = await prisma.payment.findMany({
    orderBy: { date: "desc" },
    take: 100,
    select: {
      id: true,
      paymentNo: true,
      type: true,
      method: true,
      date: true,
      amountFils: true,
      status: true,
      party: { select: { nameEn: true, nameAr: true } },
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{t.nav.payments}</h1>
        <Button asChild>
          <Link href="/payments/new">
            <Plus className="size-4" /> {t.payments.new}
          </Link>
        </Button>
      </div>

      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.common.code}</TableHead>
                <TableHead>{t.common.date}</TableHead>
                <TableHead>{t.common.type}</TableHead>
                <TableHead>{t.nav.parties}</TableHead>
                <TableHead className="text-end">{t.common.amount}</TableHead>
                <TableHead>{t.common.status}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    {t.common.empty}
                  </TableCell>
                </TableRow>
              )}
              {payments.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-xs">
                    <Link href={`/payments/${p.id}`} className="hover:underline">
                      {p.paymentNo}
                    </Link>
                  </TableCell>
                  <TableCell>{p.date.toISOString().slice(0, 10)}</TableCell>
                  <TableCell className="text-xs">{p.type}</TableCell>
                  <TableCell>{p.party ? p.party.nameEn : "—"}</TableCell>
                  <TableCell className="text-end tabular-nums">
                    {(Number(p.amountFils) / 100).toFixed(2)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={p.status === "POSTED" ? "default" : p.status === "DRAFT" ? "secondary" : "outline"}
                    >
                      {p.status}
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
