"use client";

import { useMemo, useState, useEffect } from "react";
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
import { createInvoiceAction } from "@/lib/invoice-actions";
import { formatAED, filsToDecimalString } from "@/lib/money";
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

interface Line {
  id: string;
  itemId: string;
  description: string;
  qty: string;
  unit: string;
  rate: string;
  vatRate: string;
}

function toFils(value: string): bigint {
  const trimmed = value.trim();
  if (!trimmed || !/^\d+(\.\d{1,2})?$/.test(trimmed)) return 0n;
  const [whole, part = ""] = trimmed.split(".");
  return BigInt(whole || "0") * 100n + BigInt((part + "0").slice(0, 2));
}

function multiply(rateFils: bigint, qty: string): bigint {
  const q = qty.trim();
  if (!q || !/^\d+(\.\d{1,3})?$/.test(q)) return 0n;
  const [whole, part = ""] = q.split(".");
  const thousandths = BigInt(whole) * 1000n + BigInt((part + "000").slice(0, 3));
  return (rateFils * thousandths) / 1000n;
}

function vatOf(value: bigint, vatRate: string): bigint {
  const n = parseFloat(vatRate || "0");
  if (Number.isNaN(n) || n <= 0) return 0n;
  const fraction = n <= 1 ? n : n / 100;
  const scaled = 100_000_000n;
  const scaledRate = BigInt(Math.round(fraction * Number(scaled)));
  return (value * scaledRate) / scaled;
}

interface InvoiceFormClientProps {
  direction: InvoiceDirection;
  parties: PartyOption[];
  items: ItemOption[];
  dict: Dictionary;
  today: string;
}

export function InvoiceFormClient({
  direction,
  parties,
  items,
  dict,
  today,
}: InvoiceFormClientProps) {
  const t = dict;
  const router = useRouter();
  const isSales = direction === "SALES";
  const eligible = parties.filter(
    (p) => p.type === "BOTH" || (isSales ? p.type === "CUSTOMER" : p.type === "VENDOR"),
  );

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => {
      const mobile = window.innerWidth < 640;
      console.log("isMobile check:", mobile, "width:", window.innerWidth);
      setIsMobile(mobile);
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const [date, setDate] = useState(today);
  const [partyId, setPartyId] = useState("");
  const [lines, setLines] = useState<Line[]>([
    { id: "l1", itemId: "", description: "", qty: "", unit: "KG", rate: "", vatRate: "5" },
  ]);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const totals = useMemo(() => {
    let subtotal = 0n;
    let vat = 0n;
    for (const l of lines) {
      const value = multiply(toFils(l.rate), l.qty);
      const lineVat = vatOf(value, l.vatRate);
      subtotal += value;
      vat += lineVat;
    }
    return { subtotal, vat, total: subtotal + vat };
  }, [lines]);

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
              vatRate: item ? String(Number(item.vatRate) * 100 === 0 ? 0 : Number(item.vatRate) * 100) : l.vatRate,
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
      { id: `l${Date.now()}`, itemId: "", description: "", qty: "", unit: "KG", rate: "", vatRate: "5" },
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
    setSubmitting(true);
    const res = await createInvoiceAction(direction, {
      date,
      partyId,
      notes,
      lines: lines.map((l) => ({
        itemId: l.itemId || undefined,
        description: l.description,
        qty: l.qty,
        unit: l.unit as "KG",
        rate: l.rate,
        vatRate: l.vatRate,
      })),
    });
    setSubmitting(false);
    if (!res.ok || !res.data) {
      if (!res.ok) toast.error(res.error);
      return;
    }
    toast.success(t.invoices.posted);
    router.push(`${isSales ? "/sales-invoices" : "/purchase-invoices"}/${res.data.id}`);
  }

  return (
    <div className="space-y-4 max-w-6xl">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t.invoices.new}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>{t.common.date}</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>{isSales ? t.nav.parties : t.nav.parties}</Label>
              <Select value={partyId} onValueChange={setPartyId}>
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
          </div>

          <div className="bg-yellow-100 border border-yellow-400 text-yellow-800 px-3 py-2 mb-4 rounded text-sm font-mono">
            DEBUG: isMobile={String(isMobile)} | width={typeof window !== 'undefined' ? window.innerWidth : 'server'} | lines={lines.length}
          </div>

          {isMobile ? (
            <div key="mobile" className="space-y-3">
              {lines.map((l, idx) => {
                const value = multiply(toFils(l.rate), l.qty);
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
          ) : (
            <div key="desktop" className="rounded-md border">
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
                    const value = multiply(toFils(l.rate), l.qty);
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
          )}

          <Input
            placeholder={t.common.notes}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />

          <div className="flex justify-between">
            <Button variant="outline" onClick={addLine}>
              <Plus className="size-4" /> {t.invoices.addLine}
            </Button>
            <Button onClick={submit} disabled={submitting || totals.total === 0n}>
              {t.common.post}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}