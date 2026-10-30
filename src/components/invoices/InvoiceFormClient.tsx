"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { InvoiceDirection } from "@/generated/prisma/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createInvoiceAction, amendInvoiceAction } from "@/lib/invoice-actions";
import { formatAED, filsToDecimalString, multiplyFilsLenient, vatOf, vatForLine } from "@/lib/money";
import type { Dictionary } from "@/lib/i18n";

export interface PartyOption {
  id: string;
  code: string;
  nameEn: string;
  nameAr: string;
  trn: string | null;
  type: string;
}

export interface ItemOption {
  id: string;
  code: string | null;
  nameEn: string;
  nameAr: string;
  unit: string;
  defaultRate: string | null;
  vatRate: number;
}

/** P3.2: serializable snapshot of the original invoice used to prefill the amend
 * form (built server-side in NewInvoicePage). Party and direction are locked. */
export interface ReviseFromData {
  id: string;
  invoiceNo: string;
  partyId: string;
  date: string;
  notes: string;
  dueDate: string;
  paymentTerms: string;
  lines: Array<{
    itemId: string;
    description: string;
    qty: string;
    unit: string;
    rate: string;
    vatRate: string;
    wbtNo: string;
  }>;
  printDetails: {
    purchaseOrder: string;
    deliveryNote: string;
    deliveryNoteDate: string;
    vehicleNo: string;
    modeOfPayment: string;
    termsOfDelivery: string;
  };
}

interface Line {
  id: string;
  itemId: string;
  description: string;
  qty: string;
  unit: string;
  rate: string;
  vatRate: string;
  wbtNo: string;
}

interface PrintDetails {
  supplierRef: string;
  purchaseOrder: string;
  deliveryNote: string;
  deliveryNoteDate: string;
  vehicleNo: string;
  modeOfPayment: string;
  termsOfDelivery: string;
}

function toFils(value: string): bigint {
  const trimmed = value.trim();
  if (!trimmed || !/^\d+(\.\d{1,2})?$/.test(trimmed)) return 0n;
  const [whole, part = ""] = trimmed.split(".");
  return BigInt(whole || "0") * 100n + BigInt((part + "0").slice(0, 2));
}

interface InvoiceFormClientProps {
  direction: InvoiceDirection;
  parties: PartyOption[];
  items: ItemOption[];
  dict: Dictionary;
  today: string;
  defaultVatRate: string;
  reviseFrom?: ReviseFromData | null;
  amendReason?: string;
}

export function InvoiceFormClient({
  direction,
  parties,
  items,
  dict,
  today,
  defaultVatRate,
  reviseFrom,
  amendReason: initialAmendReason,
}: InvoiceFormClientProps) {
  const t = dict;
  const router = useRouter();
  const isSales = direction === "SALES";
  const isRevision = Boolean(reviseFrom);
  const eligible = parties.filter(
    (p) => p.type === "BOTH" || (isSales ? p.type === "CUSTOMER" : p.type === "VENDOR"),
  );

  const [date, setDate] = useState(reviseFrom?.date ?? today);
  const [partyId, setPartyId] = useState(reviseFrom?.partyId ?? "");
  const [dueDate, setDueDate] = useState(reviseFrom?.dueDate ?? "");
  const [paymentTerms, setPaymentTerms] = useState(reviseFrom?.paymentTerms ?? "");
  const [lines, setLines] = useState<Line[]>(() =>
    reviseFrom
      ? reviseFrom.lines.map((l, i) => ({ id: `rev${i + 1}`, ...l }))
      : [{ id: "l1", itemId: "", description: "", qty: "", unit: "KG", rate: "", vatRate: defaultVatRate, wbtNo: "" }],
  );
  const [notes, setNotes] = useState(reviseFrom?.notes ?? "");
  const [printDetails, setPrintDetails] = useState<PrintDetails>({
    supplierRef: "",
    purchaseOrder: reviseFrom?.printDetails.purchaseOrder ?? "",
    deliveryNote: reviseFrom?.printDetails.deliveryNote ?? "",
    deliveryNoteDate: reviseFrom?.printDetails.deliveryNoteDate ?? "",
    vehicleNo: reviseFrom?.printDetails.vehicleNo ?? "",
    modeOfPayment: reviseFrom?.printDetails.modeOfPayment ?? "",
    termsOfDelivery: reviseFrom?.printDetails.termsOfDelivery ?? "",
  });
  const [amendReason, setAmendReason] = useState(initialAmendReason ?? "");
  const [submitting, setSubmitting] = useState(false);

  const totals = useMemo(() => {
    let subtotal = 0n;
    let vat = 0n;
    for (const l of lines) {
      const value = multiplyFilsLenient(toFils(l.rate), l.qty);
      const lineVat = vatOf(value, l.vatRate);
      subtotal += value;
      vat += lineVat;
    }
    return { subtotal, vat, total: subtotal + vat };
  }, [lines]);

  // Auto-calculate dueDate when paymentTerms changes. When amending an invoice
  // that already had an explicit dueDate, skip the mount-time recalculation so
  // the original due date is not silently replaced by date+terms.
  const skipAutoDueOnMount = useRef(Boolean(reviseFrom?.dueDate));
  useEffect(() => {
    if (skipAutoDueOnMount.current) {
      skipAutoDueOnMount.current = false;
      return;
    }
    if (paymentTerms && date) {
      const days = parseInt(paymentTerms, 10);
      if (!Number.isNaN(days) && days > 0) {
        const d = new Date(date);
        d.setDate(d.getDate() + days);
        const iso = d.toISOString().slice(0, 10);
        if (iso !== dueDate) {
          setDueDate(iso);
        }
      }
    }
  }, [paymentTerms, date]);

  function pickItem(lineId: string, itemId: string) {
    const item = items.find((i) => i.id === itemId);
    setLines((prev) =>
      prev.map((l) =>
        l.id === lineId
          ? {
              ...l,
              itemId,
              unit: item?.unit ?? l.unit,
              rate: item?.defaultRate ? filsToDecimalString(BigInt(item.defaultRate)) : l.rate,
              // Keep the company default VAT rate on the line; the item's
              // stored default rate no longer overrides it. Users can still
              // change the rate per line (e.g. back to 5% when VAT applies).
              description: l.description || item?.nameEn || "",
            }
          : l,
      ),
    );
  }

  function setLine(lineId: string, patch: Partial<Line>) {
    setLines((prev) => prev.map((l) => (l.id === lineId ? { ...l, ...patch } : l)));
  }

  function addLine() {
    setLines((prev) => [
      ...prev,
      { id: `l${Date.now()}`, itemId: "", description: "", qty: "", unit: "KG", rate: "", vatRate: defaultVatRate, wbtNo: "" },
    ]);
  }

  function removeLine(id: string) {
    setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.id !== id) : prev));
  }

  async function submit() {
    if (!partyId) {
      toast.error(t.common.required);
      return;
    }
    if (lines.some((l) => !l.description.trim() || !l.qty.trim() || !l.rate.trim())) {
      toast.error(t.common.required);
      return;
    }
    if (isRevision && !amendReason.trim()) {
      toast.error(t.common.required);
      return;
    }
    setSubmitting(true);
    const linePayload = lines.map((l) => ({
      itemId: l.itemId || undefined,
      description: l.description,
      qty: l.qty,
      unit: l.unit as "KG",
      rate: l.rate,
      vatRate: l.vatRate,
      wbtNo: l.wbtNo.trim() || undefined,
    }));
    // P3.2: revision submit reverses the original (+ VOID) and posts the new
    // invoice in ONE server transaction; party/direction are copied from the
    // original server-side. supplierRef is never sent (P1.7 unique guard keeps
    // the original row's reference reserved while it is VOID).
    const res = isRevision && reviseFrom
      ? await amendInvoiceAction(reviseFrom.id, direction, amendReason, {
          date,
          notes,
          dueDate: dueDate || undefined,
          paymentTerms: paymentTerms ? parseInt(paymentTerms, 10) : undefined,
          purchaseOrder: printDetails.purchaseOrder || undefined,
          deliveryNote: printDetails.deliveryNote || undefined,
          deliveryNoteDate: printDetails.deliveryNoteDate || undefined,
          vehicleNo: printDetails.vehicleNo || undefined,
          modeOfPayment: printDetails.modeOfPayment || undefined,
          termsOfDelivery: printDetails.termsOfDelivery || undefined,
          lines: linePayload,
        })
      : await createInvoiceAction(direction, {
          date,
          partyId,
          notes,
          supplierRef: printDetails.supplierRef || undefined,
          purchaseOrder: printDetails.purchaseOrder || undefined,
          deliveryNote: printDetails.deliveryNote || undefined,
          deliveryNoteDate: printDetails.deliveryNoteDate || undefined,
          vehicleNo: printDetails.vehicleNo || undefined,
          modeOfPayment: printDetails.modeOfPayment || undefined,
          termsOfDelivery: printDetails.termsOfDelivery || undefined,
          dueDate: dueDate || undefined,
          paymentTerms: paymentTerms ? parseInt(paymentTerms, 10) : undefined,
          lines: linePayload,
        });
    setSubmitting(false);
    if (!res.ok || !res.data) {
      if (!res.ok) toast.error(res.error);
      return;
    }
    toast.success(isRevision ? t.invoices.revisionPosted : t.invoices.posted);
    router.push(`${isSales ? "/sales-invoices" : "/purchase-invoices"}/${res.data.id}`);
  }

  return (
    <div className="space-y-4 max-w-6xl">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t.invoices.new}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {reviseFrom && (
            <div className="space-y-1.5 rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
              <p className="font-medium">
                {t.invoices.revisionOf} <span className="font-mono">{reviseFrom.invoiceNo}</span>
              </p>
              {initialAmendReason ? (
                <p className="text-muted-foreground">
                  {t.invoices.amendReason}: {amendReason}
                </p>
              ) : (
                <div className="flex items-center gap-2">
                  <Label htmlFor="amend-reason" className="whitespace-nowrap">
                    {t.invoices.amendReason}
                  </Label>
                  <Input
                    id="amend-reason"
                    value={amendReason}
                    onChange={(e) => setAmendReason(e.target.value)}
                    placeholder={t.invoices.amendReasonPlaceholder}
                    maxLength={2000}
                  />
                </div>
              )}
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>{t.common.date}</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>{isSales ? t.nav.parties : t.nav.parties}</Label>
              <Select value={partyId} onValueChange={setPartyId} disabled={isRevision}>
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {eligible.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      <span className="font-mono text-xs">{p.code}</span> {p.nameEn}
                      {p.trn ? (
                        <span className="ms-2 text-xs text-muted-foreground">TRN {p.trn}</span>
                      ) : null}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t.invoices.dueDate}</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t.invoices.paymentTerms}</Label>
              <Input
                type="number"
                min="1"
                max="365"
                placeholder={t.invoices.paymentTermsPlaceholder}
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
              />
            </div>
          </div>

          {/* Mobile layout - shown on screens < 640px */}
          <div className="block sm:hidden">
            {lines.map((l, idx) => {
              const value = multiplyFilsLenient(toFils(l.rate), l.qty);
              const lineTotal = value + vatOf(value, l.vatRate);
              return (
                <Card key={l.id} className="p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-sm">{t.invoices.line} {idx + 1}</span>
                    <Button variant="ghost" size="sm" onClick={() => removeLine(l.id)} disabled={lines.length <= 1} className="text-destructive">
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">{t.invoices.item}</Label>
                      <Select value={l.itemId} onValueChange={(v) => pickItem(l.id, v)}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="—" />
                        </SelectTrigger>
                        <SelectContent className="max-h-64">
                          {items.map((i) => (
                            <SelectItem key={i.id} value={i.id}>
                              {i.nameEn}
                              <span className="ms-2 text-xs text-muted-foreground">{i.nameAr}</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        placeholder={t.common.description}
                        value={l.description}
                        onChange={(e) => setLine(l.id, { description: e.target.value })}
                      />
                      <Input
                        placeholder={t.invoices.wbtNo}
                        value={l.wbtNo}
                        onChange={(e) => setLine(l.id, { wbtNo: e.target.value })}
                        dir="ltr"
                        maxLength={60}
                      />
                    </div>
                    <div className="grid gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">{t.invoices.qty}</Label>
                        <Input
                          type="number" min="0" step="0.001"
                          value={l.qty}
                          onChange={(e) => setLine(l.id, { qty: e.target.value })}
                          dir="ltr"
                          className="w-full"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">{t.items.unit}</Label>
                        <Select value={l.unit} onValueChange={(v) => setLine(l.id, { unit: v })}>
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {["KG", "TON", "PCS", "BAG", "OTHER"].map((u) => (
                              <SelectItem key={u} value={u}>{u}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">{t.invoices.rate}</Label>
                        <Input
                          type="number" min="0" step="0.01"
                          value={l.rate}
                          onChange={(e) => setLine(l.id, { rate: e.target.value })}
                          dir="ltr"
                          className="w-full"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">{t.items.vat}</Label>
                        <Input
                          value={l.vatRate}
                          onChange={(e) => setLine(l.id, { vatRate: e.target.value })}
                          dir="ltr"
                          className="w-full"
                        />
                      </div>
                    </div>
                    <div className="text-end text-sm font-medium">
                      {formatAED(lineTotal)}
                    </div>
                  </div>
                </Card>
              );
            })}
            </div>

          {/* Desktop layout - shown on screens >= 640px */}
          <div className="hidden sm:block">
            <div className="rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-3 py-2 text-start text-xs font-medium text-muted-foreground">{t.invoices.item}</th>
                    <th className="px-3 py-2 text-start text-xs font-medium text-muted-foreground">{t.invoices.qty}</th>
                    <th className="w-20 px-3 py-2 text-start text-xs font-medium text-muted-foreground">{t.items.unit}</th>
                    <th className="px-3 py-2 text-start text-xs font-medium text-muted-foreground">{t.invoices.rate}</th>
                    <th className="w-20 px-3 py-2 text-start text-xs font-medium text-muted-foreground">{t.items.vat}</th>
                    <th className="px-3 py-2 text-end text-xs font-medium text-muted-foreground">{t.invoices.lineTotal}</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => {
const value = multiplyFilsLenient(toFils(l.rate), l.qty);
                    const lineTotal = value + vatOf(value, l.vatRate);
                    return (
                      <tr key={l.id} className="border-b last:border-b-0 align-top">
                        <td className="px-3 py-2 space-y-1">
                          <Select value={l.itemId} onValueChange={(v) => pickItem(l.id, v)}>
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="—" />
                            </SelectTrigger>
                            <SelectContent className="max-h-64">
                              {items.map((i) => (
                                <SelectItem key={i.id} value={i.id}>
                                  {i.nameEn}
                                  <span className="ms-2 text-xs text-muted-foreground">{i.nameAr}</span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input
                            placeholder={t.common.description}
                            value={l.description}
                            onChange={(e) => setLine(l.id, { description: e.target.value })}
                          />
                          <Input
                            placeholder={t.invoices.wbtNo}
                            value={l.wbtNo}
                            onChange={(e) => setLine(l.id, { wbtNo: e.target.value })}
                            dir="ltr"
                            maxLength={60}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            type="number" min="0" step="0.001"
                            value={l.qty}
                            onChange={(e) => setLine(l.id, { qty: e.target.value })}
                            dir="ltr"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Select value={l.unit} onValueChange={(v) => setLine(l.id, { unit: v })}>
                            <SelectTrigger className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {["KG", "TON", "PCS", "BAG", "OTHER"].map((u) => (
                                <SelectItem key={u} value={u}>{u}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            type="number" min="0" step="0.01"
                            value={l.rate}
                            onChange={(e) => setLine(l.id, { rate: e.target.value })}
                            dir="ltr"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            value={l.vatRate}
                            onChange={(e) => setLine(l.id, { vatRate: e.target.value })}
                            dir="ltr"
                          />
                        </td>
                        <td className="px-3 py-2 text-end tabular-nums">{formatAED(lineTotal)}</td>
                        <td className="px-1 py-2">
                          <Button variant="ghost" size="sm" onClick={() => removeLine(l.id)} disabled={lines.length <= 1}>
                            <Trash2 className="size-4 text-destructive" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t bg-muted/30">
                    <td colSpan={4} className="px-3 py-1.5 font-medium">{t.common.subtotal}</td>
                    <td />
                    <td className="px-3 py-1.5 text-end tabular-nums">{formatAED(totals.subtotal)}</td>
                    <td />
                  </tr>
                  <tr className="bg-muted/30">
                    <td colSpan={4} className="px-3 py-1.5 font-medium">{t.common.vat}</td>
                    <td />
                    <td className="px-3 py-1.5 text-end tabular-nums">{formatAED(totals.vat)}</td>
                    <td />
                  </tr>
                  <tr className="bg-muted/50 border-t">
                    <td colSpan={4} className="px-3 py-1.5 font-semibold">{t.common.grandTotal}</td>
                    <td />
                    <td className="px-3 py-1.5 text-end tabular-nums font-semibold">{formatAED(totals.total)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <Input
            placeholder={t.common.notes}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />

          <div className="rounded-md border p-3">
            <p className="mb-2 text-sm font-medium">{t.invoices.printDetails}</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label className="text-xs">{t.invoices.supplierRef}</Label>
                <Input value={printDetails.supplierRef} onChange={(e) => setPrintDetails({ ...printDetails, supplierRef: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t.invoices.purchaseOrder}</Label>
                <Input value={printDetails.purchaseOrder} onChange={(e) => setPrintDetails({ ...printDetails, purchaseOrder: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t.invoices.modeOfPayment}</Label>
                <Input value={printDetails.modeOfPayment} onChange={(e) => setPrintDetails({ ...printDetails, modeOfPayment: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t.invoices.deliveryNote}</Label>
                <Input value={printDetails.deliveryNote} onChange={(e) => setPrintDetails({ ...printDetails, deliveryNote: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t.invoices.deliveryNoteDate}</Label>
                <Input type="date" value={printDetails.deliveryNoteDate} onChange={(e) => setPrintDetails({ ...printDetails, deliveryNoteDate: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t.invoices.vehicleNo}</Label>
                <Input value={printDetails.vehicleNo} onChange={(e) => setPrintDetails({ ...printDetails, vehicleNo: e.target.value })} />
              </div>
              <div className="space-y-1.5 sm:col-span-3">
                <Label className="text-xs">{t.invoices.termsOfDelivery}</Label>
                <Input value={printDetails.termsOfDelivery} onChange={(e) => setPrintDetails({ ...printDetails, termsOfDelivery: e.target.value })} />
              </div>
            </div>
          </div>

          <div className="flex justify-between">
            <Button variant="outline" onClick={addLine}>
              <Plus className="size-4" /> {t.invoices.addLine}
            </Button>
            <Button onClick={submit} disabled={submitting || totals.total === 0n}>
              {isRevision ? t.invoices.postRevision : t.common.post}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}


