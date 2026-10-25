import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { moduleCan, requireUser } from "@/lib/guard";
import { getServerLocale, getDictionary } from "@/lib/i18n";
import type { InvoiceDirection } from "@/generated/prisma/client";
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
import { VoidInvoiceButton } from "./VoidInvoiceButton";
import { PrintDetailsForm } from "./PrintDetailsForm";
import { formatAED } from "@/lib/money";

export async function InvoiceDetailView({
  invoiceId,
  direction,
}: {
  invoiceId: string;
  direction: InvoiceDirection;
}) {
  const user = await requireUser();
  const locale = await getServerLocale();
  const t = getDictionary(locale);
  const path = direction === "SALES" ? "/sales-invoices" : "/purchase-invoices";

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId, direction },
    include: {
      party: true,
      lines: { orderBy: { id: "asc" } },
      allocations: { include: { payment: { select: { paymentNo: true, id: true } } } },
    },
  });
  if (!invoice) notFound();
  const canVoid =
    (await moduleCan(user, direction === "SALES" ? "sales-invoices" : "purchase-invoices", "write")) &&
    invoice.status === "POSTED";
  const canEditPrintDetails =
    (await moduleCan(user, direction === "SALES" ? "sales-invoices" : "purchase-invoices", "write")) &&
    invoice.status !== "VOID";

  const statusBadge = (
    <Badge
      variant={
        invoice.status === "POSTED" ? "default" : invoice.status === "DRAFT" ? "secondary" : "outline"
      }
    >
      {invoice.status}
    </Badge>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-mono text-xl font-semibold tracking-tight">{invoice.invoiceNo}</h1>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{invoice.date.toISOString().slice(0, 10)}</span>
            {statusBadge}
            <span>
              {invoice.party.nameEn}{" "}
              <span dir="rtl" className="text-xs">
                {invoice.party.nameAr}
              </span>{" "}
              ({invoice.party.code})
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href={path}>{t.common.back}</Link>
          </Button>
          {invoice.status === "POSTED" && (
            <Button asChild variant="outline">
              <Link href={`${path}/${invoice.id}/print`}>Print / طباعة</Link>
            </Button>
          )}
          {invoice.journalEntryId && (
            <Button asChild variant="outline">
              <Link href={`/journals/${invoice.journalEntryId}`}>{t.journals.viewEntry}</Link>
            </Button>
          )}
          {canVoid && (
            <VoidInvoiceButton invoiceId={invoice.id} direction={direction} label={t.invoices.voidInvoice} confirmText={t.invoices.voidConfirm} />
          )}
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t.common.description}</TableHead>
              <TableHead className="text-end">{t.invoices.qty}</TableHead>
              <TableHead className="hidden w-16 sm:table-cell">{t.items.unit}</TableHead>
              <TableHead className="text-end">{t.invoices.rate}</TableHead>
              <TableHead className="hidden text-end sm:table-cell">{t.items.vat}</TableHead>
              <TableHead className="text-end">{t.invoices.lineTotal}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoice.lines.map((l) => (
              <TableRow key={l.id}>
                <TableCell>{l.description}</TableCell>
                <TableCell className="text-end tabular-nums">{Number(l.qty)}</TableCell>
                <TableCell className="hidden text-xs sm:table-cell">{l.unit}</TableCell>
                <TableCell className="text-end tabular-nums">
                  {formatAED(l.rateFils)}
                </TableCell>
                <TableCell className="hidden text-end tabular-nums sm:table-cell">
                  {(Number(l.vatRate) * 100).toFixed(0)}%
                </TableCell>
                <TableCell className="text-end tabular-nums">
                  {formatAED(l.lineTotalFils)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex justify-end">
        <div className="w-64 space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t.common.subtotal}</span>
            <span className="tabular-nums">{formatAED(invoice.subtotalFils)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t.common.vat}</span>
            <span className="tabular-nums">{formatAED(invoice.vatFils)}</span>
          </div>
          <div className="flex justify-between border-t pt-1 font-semibold">
            <span>{t.common.grandTotal} (AED)</span>
            <span className="tabular-nums">{formatAED(invoice.totalFils)}</span>
          </div>
        </div>
      </div>

      {invoice.allocations.length > 0 && (
        <div className="text-sm text-muted-foreground">
          {invoice.allocations
            .map((a) => `${a.payment.paymentNo} — ${formatAED(a.amountFils)} AED`)
            .join(" · ")}
        </div>
      )}

      {canEditPrintDetails && (
        <PrintDetailsForm
          invoiceId={invoice.id}
          direction={direction}
          current={{
            supplierRef: invoice.supplierRef ?? "",
            purchaseOrder: invoice.purchaseOrder ?? "",
            deliveryNote: invoice.deliveryNote ?? "",
            deliveryNoteDate: invoice.deliveryNoteDate
              ? invoice.deliveryNoteDate.toISOString().slice(0, 10)
              : "",
            vehicleNo: invoice.vehicleNo ?? "",
            modeOfPayment: invoice.modeOfPayment ?? "",
            termsOfDelivery: invoice.termsOfDelivery ?? "",
          }}
          dict={t}
        />
      )}
    </div>
  );
}
