import Link from "next/link";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUser, canEdit } from "@/lib/guard";
import { getServerLocale, getDictionary } from "@/lib/i18n";
import type { InvoiceDirection } from "@/generated/prisma/client";
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

export async function InvoiceListPage({ direction }: { direction: InvoiceDirection }) {
  const user = await requireUser();
  const locale = await getServerLocale();
  const t = getDictionary(locale);
  const path = direction === "SALES" ? "/sales-invoices" : "/purchase-invoices";
  const title = direction === "SALES" ? t.nav.sales : t.nav.purchases;

  const invoices = await prisma.invoice.findMany({
    where: { direction },
    orderBy: { date: "desc" },
    take: 100,
    select: {
      id: true,
      invoiceNo: true,
      date: true,
      status: true,
      subtotalFils: true,
      vatFils: true,
      totalFils: true,
      party: { select: { nameEn: true, nameAr: true, code: true } },
    },
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title={title}
        actions={
          canEdit(user) ? (
            <Button asChild>
              <Link href={`${path}/new`}>
                <Plus className="size-4" /> {t.invoices.new}
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
                <TableHead>{t.common.code}</TableHead>
                <TableHead>{t.common.date}</TableHead>
                <TableHead>{t.nav.parties}</TableHead>
                <TableHead className="hidden text-end sm:table-cell">{t.common.subtotal}</TableHead>
                <TableHead className="hidden text-end sm:table-cell">{t.common.vat}</TableHead>
                <TableHead className="text-end">{t.common.total}</TableHead>
                <TableHead>{t.common.status}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    {t.common.empty}
                  </TableCell>
                </TableRow>
              )}
              {invoices.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell className="font-mono text-xs">
                    <Link href={`${path}/${inv.id}`} className="hover:underline">
                      {inv.invoiceNo}
                    </Link>
                  </TableCell>
                  <TableCell>{inv.date.toISOString().slice(0, 10)}</TableCell>
                  <TableCell>
                    {inv.party.nameEn}
                    <span className="ms-2 text-xs text-muted-foreground" dir="rtl">
                      {inv.party.nameAr}
                    </span>
                  </TableCell>
                  <TableCell className="hidden text-end tabular-nums sm:table-cell">
                    {(Number(inv.subtotalFils) / 100).toFixed(2)}
                  </TableCell>
                  <TableCell className="hidden text-end tabular-nums sm:table-cell">
                    {(Number(inv.vatFils) / 100).toFixed(2)}
                  </TableCell>
                  <TableCell className="text-end tabular-nums font-medium">
                    {(Number(inv.totalFils) / 100).toFixed(2)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        inv.status === "POSTED" ? "default" : inv.status === "DRAFT" ? "secondary" : "outline"
                      }
                    >
                      {inv.status}
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
