import type { Invoice } from "@/generated/prisma/client";

export const UNITS: Record<string, { en: string; ar: string }> = {
  KG: { en: "kg", ar: "كجم" },
  TON: { en: "ton", ar: "طن" },
  PCS: { en: "pcs", ar: "قطعة" },
  BAG: { en: "bag", ar: "كيس" },
  OTHER: { en: "unit", ar: "وحدة" },
};

import { formatAED } from "@/lib/money";

function money(fils: bigint) {
  return formatAED(fils);
}

export interface InvoicePrintData {
  invoice: Invoice & {
    lines: {
      id: string;
      description: string;
      descriptionAr: string | null;
      wbtNo: string | null;
      qty: string | number | { toString(): string };
      unit: string;
      rateFils: bigint;
      vatRate: string | number | { toString(): string };
      lineValueFils: bigint;
      lineVatFils: bigint;
      lineTotalFils: bigint;
    }[];
    party: { nameEn: string; nameAr: string; trn: string | null; addressEn: string | null; addressAr: string | null };
  };
  company: { nameEn: string; nameAr: string; trn: string; addressEn: string; addressAr: string; phone: string; email: string; bankDetailsEn: string; bankDetailsAr: string };
}

export function InvoicePrintView({
  data,
  isTaxInvoice,
}: {
  data: InvoicePrintData;
  isTaxInvoice: boolean;
}) {
  const { invoice, company } = data;
  const invNo = invoice.invoiceNo;
  const title = isTaxInvoice ? "TAX INVOICE / فاتورة ضريبية" : invoice.direction === "SALES" ? "DELIVERY NOTE / سند تسليم" : "TAX INVOICE / فاتورة ضريبية";

  return (
    <div className="mx-auto max-w-3xl bg-white text-black print:bg-white print:text-black" dir="ltr">
      <style>{`@media print { .no-print, nav, aside { display: none !important; } }@page { size: letter; margin: 0; }`}</style>

      <div className="border-2 border-black p-6 text-sm">
        {/* Header */}
        <div className="flex justify-between gap-6 border-b-2 border-black pb-3">
          <div>
            <h1 className="text-lg font-bold">{company.nameEn}</h1>
            <p className="text-xs text-neutral-700">{company.addressEn}</p>
            <p className="text-xs text-neutral-700">
              TRN: <span className="font-semibold">{company.trn || "—"}</span>
            </p>
            <p className="text-xs text-neutral-700">{company.phone} · {company.email}</p>
          </div>
          <div dir="rtl" className="text-right">
            <h1 className="text-lg font-bold">{company.nameAr}</h1>
            <p className="text-xs text-neutral-700">{company.addressAr}</p>
            <p className="text-xs text-neutral-700">الترخيص الضريبي: <span className="font-semibold">{company.trn || "—"}</span></p>
          </div>
        </div>

        {/* Title + meta */}
        <div className="flex justify-between items-center py-3 border-b border-neutral-400">
          <span className="text-base font-bold">{title}</span>
          <span className="font-mono">{invNo}</span>
        </div>
        <div className="grid grid-cols-2 gap-4 py-3 text-xs">
          <div>
            <p className="font-semibold uppercase text-[10px] text-neutral-500">
              {invoice.direction === "SALES" ? "Bill To / إلى" : "From / من"}
            </p>
            <p className="font-bold">{invoice.party.nameEn} — {invoice.party.nameAr}</p>
            {invoice.party.addressEn && <p>{invoice.party.addressEn}</p>}
            <p>TRN / الرقم الضريبي: {invoice.party.trn || "—"}</p>
          </div>
          <div className="text-right">
            <p>Date: {invoice.date.toISOString().slice(0, 10)}</p>
            <p>Status: {invoice.status}</p>
          </div>
        </div>

        {/* Lines */}
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-neutral-100">
              <th className="border border-neutral-400 p-1.5 text-start">#</th>
              <th className="border border-neutral-400 p-1.5 text-start">Description</th>
              <th className="border border-neutral-400 p-1.5 text-start text-right" dir="rtl">الوصف</th>
              <th className="border border-neutral-400 p-1.5 text-end">Qty</th>
              <th className="border border-neutral-400 p-1.5 text-end">Unit</th>
              <th className="border border-neutral-400 p-1.5 text-end">Rate</th>
              <th className="border border-neutral-400 p-1.5 text-end">VAT %</th>
              <th className="border border-neutral-400 p-1.5 text-end">Amount (AED)</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((l, idx) => (
              <tr key={l.id}>
                <td className="border border-neutral-400 p-1.5">{idx + 1}</td>
                <td className="border border-neutral-400 p-1.5">
                  {l.description}
                  {l.wbtNo ? <div className="text-[10px] text-neutral-600">WBT # {l.wbtNo}</div> : null}
                </td>
                <td className="border border-neutral-400 p-1.5 text-right" dir="rtl">{l.descriptionAr ?? ""}</td>
                <td className="border border-neutral-400 p-1.5 text-end tabular-nums">{String(l.qty)}</td>
                <td className="border border-neutral-400 p-1.5 text-center">{UNITS[l.unit]?.en ?? l.unit}</td>
                <td className="border border-neutral-400 p-1.5 text-end tabular-nums">{money(l.rateFils)}</td>
                <td className="border border-neutral-400 p-1.5 text-end tabular-nums">{(Number(l.vatRate) * 100).toFixed(0)}%</td>
                <td className="border border-neutral-400 p-1.5 text-end tabular-nums">{money(l.lineValueFils)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals + VAT summary */}
        <div className="mt-3 flex flex-col items-end gap-2">
          <div className="w-56 text-xs">
            <div className="flex justify-between border-b border-neutral-300 py-0.5">
              <span>Subtotal / المجموع</span><span className="tabular-nums">{money(invoice.subtotalFils)}</span>
            </div>
            {[...new Map(invoice.lines.map((l) => [l.vatRate, invoice.lines.filter((x) => x.vatRate === l.vatRate)]))].map(([rate, group]) => (
              <div key={String(rate)} className="flex justify-between border-b border-neutral-300 py-0.5">
                <span>VAT {(Number(rate) * 100).toFixed(0)}% / ض.ق.</span>
                <span className="tabular-nums">{money(group.reduce((a, g) => a + g.lineVatFils, 0n))}</span>
              </div>
            ))}
            <div className="flex justify-between py-1 text-sm font-bold">
              <span>Total (AED)</span>
              <span className="tabular-nums">{money(invoice.totalFils)}</span>
            </div>
            <div className="flex justify-between" dir="rtl">
              <span className="text-sm font-bold">الإجمالي</span>
              <span className="tabular-nums text-sm font-bold">{money(invoice.totalFils)}</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-4 border-t border-neutral-400 pt-2 text-[10px] text-neutral-700">
          {company.bankDetailsEn
            ? (company.bankDetailsEn.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)).map((line, i) => (
                <p key={i}>{line}</p>
              ))
            : null}
          {company.bankDetailsAr
            ? (company.bankDetailsAr.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)).map((line, i) => (
                <p key={`ar-${i}`} dir="rtl">{line}</p>
              ))
            : null}
          {isTaxInvoice && (
            <p className="mt-1">
              This is a Tax Invoice issued in compliance with UAE Federal Decree-Law No. 8 of 2017 on VAT.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
