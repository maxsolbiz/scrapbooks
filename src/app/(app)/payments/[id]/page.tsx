import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { moduleCan, requireModule, type SessionUser } from "@/lib/guard";
import { getServerLocale, getDictionary } from "@/lib/i18n";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { VoidPaymentButton } from "./VoidPaymentButton";

export default async function PaymentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user: SessionUser = await requireModule("payments");
  const { id } = await params;
  const locale = await getServerLocale();
  const t = getDictionary(locale);

  const payment = await prisma.payment.findUnique({
    where: { id },
    include: {
      party: true,
      allocations: {
        include: {
          invoice: { select: { invoiceNo: true, totalFils: true } },
        },
      },
    },
  });
  if (!payment) notFound();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-mono text-xl font-semibold">{payment.paymentNo}</h1>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{payment.date.toISOString().slice(0, 10)}</span>
            <span className="text-xs">{payment.type} / {payment.method}</span>
            {payment.party && <span>{payment.party.nameEn} ({payment.party.code})</span>}
            <Badge variant={payment.status === "POSTED" ? "default" : payment.status === "DRAFT" ? "secondary" : "outline"}>
              {payment.status}
            </Badge>
          </div>
          {payment.reference && <span className="text-sm">{payment.reference}</span>}
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/payments">{t.common.back}</Link>
          </Button>
          {payment.journalEntryId && (
            <Button asChild variant="outline">
              <Link href={`/journals/${payment.journalEntryId}`}>{t.journals.viewEntry}</Link>
            </Button>
          )}
          {(await moduleCan(user, "payments", "write")) && payment.status === "POSTED" && (
            <VoidPaymentButton paymentId={payment.id} label={t.payments.voidPayment} />
          )}
        </div>
      </div>

      <div className="w-64 space-y-1 text-sm">
        <div className="flex justify-between font-semibold border-t pt-1">
          <span>{t.common.amount} (AED)</span>
          <span className="tabular-nums">{(Number(payment.amountFils) / 100).toFixed(2)}</span>
        </div>
      </div>

      {payment.allocations.length > 0 && (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.payments.invoice}</TableHead>
                <TableHead className="text-end">{t.payments.allocAmount}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payment.allocations.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>
                    <Link href={`/sales-invoices/${a.invoiceId}`} className="hover:underline font-mono text-xs">
                      {a.invoice.invoiceNo}
                    </Link>
                  </TableCell>
                  <TableCell className="text-end tabular-nums">
                    {(Number(a.amountFils) / 100).toFixed(2)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
