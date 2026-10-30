import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireModule } from "@/lib/guard";
import { getServerLocale, getDictionary } from "@/lib/i18n";
import { filsToDecimalString } from "@/lib/money";
import type { InvoiceDirection } from "@/generated/prisma/client";
import { InvoiceFormWrapper } from "@/components/invoices/InvoiceFormWrapper";

export async function NewInvoicePage({
  direction,
  reviseId,
  amendReason,
}: {
  direction: InvoiceDirection;
  reviseId?: string;
  amendReason?: string;
}) {
  await requireModule(direction === "SALES" ? "sales-invoices" : "purchase-invoices", "write");

  // P3.2: prefill a revision of a POSTED original. The route already fixes the
  // direction, so a mismatched id 404s; a DRAFT should be edited directly and an
  // already-revision invoice cannot be amended again (amend the chain root) —
  // both 404 here as the deep-link guard behind the hidden detail-view button.
  let reviseFrom: NonNullable<Parameters<typeof InvoiceFormWrapper>[0]["reviseFrom"]> | null = null;
  if (reviseId) {
    const original = await prisma.invoice.findUnique({
      where: { id: reviseId },
      include: { lines: { orderBy: { id: "asc" } } },
    });
    if (
      !original ||
      original.direction !== direction ||
      original.status !== "POSTED" ||
      original.revisesInvoiceId
    ) {
      notFound();
    }
    reviseFrom = {
      id: original.id,
      invoiceNo: original.invoiceNo,
      partyId: original.partyId,
      date: original.date.toISOString().slice(0, 10),
      notes: original.notes ?? "",
      dueDate: original.dueDate ? original.dueDate.toISOString().slice(0, 10) : "",
      paymentTerms: original.paymentTerms ? String(original.paymentTerms) : "",
      lines: original.lines.map((l) => ({
        itemId: l.itemId ?? "",
        description: l.description,
        qty: l.qty.toString(),
        unit: l.unit,
        // Plain decimal, no thousands separators: the form's number inputs and
        // toFils() reject commas (filsToDecimalString adds them for display).
        rate: filsToDecimalString(l.rateFils).replace(/,/g, ""),
        vatRate: Number(l.vatRate).toString(),
        wbtNo: l.wbtNo ?? "",
      })),
      printDetails: {
        // supplierRef intentionally blank: the P1.7 per-vendor unique guard keeps
        // the original row's reference reserved even while it is VOID.
        purchaseOrder: original.purchaseOrder ?? "",
        deliveryNote: original.deliveryNote ?? "",
        deliveryNoteDate: original.deliveryNoteDate
          ? original.deliveryNoteDate.toISOString().slice(0, 10)
          : "",
        vehicleNo: original.vehicleNo ?? "",
        modeOfPayment: original.modeOfPayment ?? "",
        termsOfDelivery: original.termsOfDelivery ?? "",
      },
    };
  }

  const [partiesRaw, itemsRaw, locale, settings] = await Promise.all([
    prisma.party.findMany({
      where: { isActive: true },
      orderBy: { code: "asc" },
      select: { id: true, code: true, nameEn: true, nameAr: true, trn: true, type: true },
    }),
    prisma.item.findMany({
      where: { isActive: true },
      orderBy: { nameEn: "asc" },
      select: {
        id: true,
        code: true,
        nameEn: true,
        nameAr: true,
        unit: true,
        defaultRate: true,
        vatRate: true,
      },
    }),
    getServerLocale(),
    prisma.companySettings.findFirst({ select: { defaultVatRate: true } }),
  ]);
  const dict = getDictionary(locale);
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  return (
    <InvoiceFormWrapper
      direction={direction}
      parties={partiesRaw}
      items={itemsRaw.map((i) => ({
        id: i.id,
        code: i.code,
        nameEn: i.nameEn,
        nameAr: i.nameAr,
        unit: i.unit,
        defaultRate: i.defaultRate ? i.defaultRate.toString() : null,
        vatRate: Number(i.vatRate),
      }))}
      dict={dict}
      today={today}
      defaultVatRate={settings ? settings.defaultVatRate.toString() : "5"}
      reviseFrom={reviseFrom}
      amendReason={amendReason ?? ""}
    />
  );
}
