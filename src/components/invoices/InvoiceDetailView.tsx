import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { moduleCan, requireUser } from "@/lib/guard";
import { getServerLocale, getDictionary } from "@/lib/i18n";
import type { InvoiceDirection } from "@/generated/prisma/client";
import { Badge } from "@/components/ui/badge";
import { PaymentStatusBadge } from "./PaymentStatusBadge";
import { ApplyCreditDialog } from "./ApplyCreditDialog";
import { AddDeductionDialog } from "./AddDeductionDialog";
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
import { AmendInvoiceButton } from "./AmendInvoiceButton";
import { PrintDetailsForm } from "./PrintDetailsForm";
import { formatAED } from "@/lib/money";
import { partyCreditBalance } from "@/lib/party-credit";

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
      allocations: { include: { payment: { select: { paymentNo: true, id: true, status: true } } } },
      deductions: { orderBy: { createdAt: "asc" } },
      revisesInvoice: { select: { id: true, invoiceNo: true } },
      revisedBy: { select: { id: true, invoiceNo: true }, orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!invoice) notFound();

  // Fetch available credit for the party
  const availableCredit = await partyCreditBalance(invoice.partyId);
  const totalDue = invoice.totalFils - invoice.allocations
    .filter((a) => a.payment.status !== "VOID")
    .reduce((sum, a) => sum + a.amountFils, 0n);
  const totalDeductions = invoice.deductions.reduce((sum, d) => sum + d.totalFils, 0n);
  const outstanding = totalDue - totalDeductions;
  // D1: compute the invoice's effective VAT rate for deduction prefill / VAT calc.
  const effectiveVatRateFromInvoice =
    invoice.subtotalFils > 0n ? Math.round((Number(invoice.vatFils) / Number(invoice.subtotalFils)) * 10000) / 10000 : 0;
  const canDeduct =
    invoice.status === "POSTED" && outstanding > 0n;

  const canWrite = await moduleCan(
    user,
    direction === "SALES" ? "sales-invoices" : "purchase-invoices",
    "write",
  );
  const canVoid = canWrite && invoice.status === "POSTED";
  const canEditPrintDetails = canWrite && invoice.status !== "VOID";
  // P3.2: amend only a POSTED original that is not itself a revision (amend the
  // chain root instead) and has no ACTIVE payment allocations — amend reverses
  // the invoice, which rejects active allocations, so block here rather than
  // sending the user through a doomed form (void the payments first).
  const activeAllocations = invoice.allocations.filter((a) => a.payment.status !== "VOID");
  const canAmend =
    canWrite &&
    invoice.status === "POSTED" &&
    !invoice.revisesInvoiceId &&
    activeAllocations.length === 0;

  const statusBadge = (
    <>
      <Badge
        variant={
          invoice.status === "POSTED" ? "default" : invoice.status === "DRAFT" ? "secondary" : "outline"
        }
      >
        {invoice.status}
      </Badge>
      <PaymentStatusBadge status={invoice.paymentStatus} dict={t} />
      {invoice.revisionNumber > 0 && (
        <Badge variant="outline">
          {t.invoices.revisionNumber} {invoice.revisionNumber}
        </Badge>
      )}
    </>
  );

  const showApplyCredit = (invoice.paymentStatus === "UNPAID" || invoice.paymentStatus === "PARTIAL") && availableCredit > 0n;

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
          {(invoice.revisesInvoice || (invoice.status === "VOID" && invoice.revisedBy[0])) && (
            <div className="mt-1 text-sm text-muted-foreground">
              {invoice.revisesInvoice && (
                <span>
                  {t.invoices.revisionOf}{" "}
                  <Link className="underline underline-offset-2" href={`${path}/${invoice.revisesInvoice.id}`}>
                    {invoice.revisesInvoice.invoiceNo}
                  </Link>
                </span>
              )}
              {invoice.revisesInvoice && invoice.status === "VOID" && invoice.revisedBy[0] ? " · " : ""}
              {invoice.status === "VOID" && invoice.revisedBy[0] && (
                <span>
                  {t.invoices.revisedBy}{" "}
                  <Link className="underline underline-offset-2" href={`${path}/${invoice.revisedBy[0].id}`}>
                    {invoice.revisedBy[0].invoiceNo}
                  </Link>
                </span>
              )}
            </div>
          )}
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
          {canAmend && (
            <AmendInvoiceButton
              invoiceId={invoice.id}
              direction={direction}
              path={path}
              label={t.invoices.amendInvoice}
              confirmText={t.invoices.amendConfirm}
              cancelLabel={t.common.cancel}
              reasonLabel={t.invoices.amendReason}
              reasonPlaceholder={t.invoices.amendReasonPlaceholder}
            />
          )}
          {canVoid && (
            <VoidInvoiceButton
              invoiceId={invoice.id}
              direction={direction}
              label={t.invoices.voidInvoice}
              confirmText={t.invoices.voidConfirm}
              cancelLabel={t.common.cancel}
              reasonLabel={t.invoices.voidReason}
              reasonPlaceholder={t.invoices.voidReasonPlaceholder}
            />
          )}
          {showApplyCredit && (
            <ApplyCreditDialog
              invoiceId={invoice.id}
              availableCredit={availableCredit}
              totalDue={totalDue}
              dict={t}
            />
          )}
          {canDeduct && (
            <AddDeductionDialog
              invoiceId={invoice.id}
              outstanding={outstanding}
              vatRate={effectiveVatRateFromInvoice}
              deduction={null}
              dict={t}
            />
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
                <TableCell>
                  {l.description}
                  {l.wbtNo ? (
                    <div className="text-xs text-muted-foreground break-words">WBT # {l.wbtNo}</div>
                  ) : null}
                </TableCell>
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

      {invoice.allocations.filter((a) => a.payment.status !== "VOID").length > 0 && (
        <div className="text-sm text-muted-foreground">
          {invoice.allocations
            .filter((a) => a.payment.status !== "VOID")
            .map((a) => `${a.payment.paymentNo} — ${formatAED(a.amountFils)} AED`)
            .join(" · ")}
        </div>
      )}

      {invoice.deductions.length > 0 && (
        <div className="rounded-md border p-4 space-y-2">
          <h3 className="text-sm font-semibold">{t.invoices.deductions}</h3>
          <div className="text-sm text-muted-foreground">
            {invoice.deductions.map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-2">
                <span>
                  {d.reason} {d.notes ? `— ${d.notes}` : ""}
                </span>
                <span className="tabular-nums">{formatAED(d.totalFils)} AED</span>
                <AddDeductionDialog
                  invoiceId={invoice.id}
                  outstanding={outstanding}
                  vatRate={effectiveVatRateFromInvoice}
                  deduction={{ id: d.id, reason: d.reason, baseAmountFils: d.baseAmountFils, vatRate: String(d.vatRate ?? effectiveVatRateFromInvoice), notes: d.notes }}
                  dict={t}
                />
              </div>
            ))}
          </div>
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
