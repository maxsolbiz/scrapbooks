"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
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
import { createPaymentAction } from "./actions";
import type { Dictionary } from "@/lib/i18n";

export interface PartyOption {
  id: string;
  code: string;
  nameEn: string;
  nameAr: string;
  type: string;
}

export interface OpenInvoice {
  invoiceId: string;
  invoiceNo: string;
  direction: string;
  partyId: string;
  outstanding: string; // plain numeric string for the action
  outstandingFormatted: string; // formatted for display
}

export function PaymentForm({
  parties,
  openInvoices,
  dict,
  today,
}: {
  parties: PartyOption[];
  openInvoices: OpenInvoice[];
  dict: Dictionary;
  today: string;
}) {
  const t = dict;
  const router = useRouter();
  const [type, setType] = useState<"RECEIPT" | "PAYMENT" | "CONTRA">("RECEIPT");
  const [method, setMethod] = useState<"CASH" | "BANK" | "PDC_IN" | "PDC_OUT">("CASH");
  const [chequeNo, setChequeNo] = useState("");
  const [bankName, setBankName] = useState("");
  const [clearanceDate, setClearanceDate] = useState("");
  const [partyId, setPartyId] = useState("");
  const [date, setDate] = useState(today);
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [allocs, setAllocs] = useState<{ invoiceId: string; amount: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const eligible = parties.filter(
    (p) =>
      type === "CONTRA" ||
      p.type === "BOTH" ||
      (type === "RECEIPT" ? p.type === "CUSTOMER" : p.type === "VENDOR"),
  );

  const outstandingList = useMemo(
    () =>
      openInvoices.filter(
        (o) =>
          partyId &&
          o.partyId === partyId &&
          (type === "RECEIPT" ? o.direction === "SALES" : o.direction === "PURCHASE"),
      ),
    [openInvoices, partyId, type],
  );

  const allocTotal = allocs.reduce(
    (acc, a) => acc + (Number(a.amount) ? Math.round(Number(a.amount) * 100) : 0),
    0,
  );
  const amountFils = Number(amount) ? Math.round(Number(amount) * 100) : 0;
  const overAllocated = allocTotal > amountFils;

  function addAllocation() {
    if (!outstandingList.length) return;
    setAllocs((prev) => [
      ...prev,
      { invoiceId: outstandingList[0].invoiceId, amount: outstandingList[0].outstanding },
    ]);
  }

  async function submit() {
    if (!amount || Number(amount) <= 0) {
      toast.error(t.common.required);
      return;
    }
    if (type !== "CONTRA" && !partyId) {
      toast.error(t.common.required);
      return;
    }
    if (overAllocated) {
      toast.error(t.payments.overAlloc);
      return;
    }
    setSubmitting(true);
    const res = await createPaymentAction({
      type,
      method,
      date,
      partyId: type === "CONTRA" ? undefined : partyId,
      amount,
      reference,
      notes,
      chequeNo: method === "PDC_IN" || method === "PDC_OUT" ? chequeNo : undefined,
      bankName: method === "PDC_IN" || method === "PDC_OUT" ? bankName : undefined,
      clearanceDate: method === "PDC_IN" || method === "PDC_OUT" ? clearanceDate : undefined,
      allocations: allocs.filter((a) => a.amount && Number(a.amount) > 0),
    });
    setSubmitting(false);
    if (!res.ok || !res.data) {
      if (!res.ok) toast.error(res.error);
      return;
    }
    toast.success(t.payments.posted);
    router.push(`/payments/${res.data.id}`);
  }

  return (
    <div className="space-y-4 max-w-4xl">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t.payments.new}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>{t.common.type}</Label>
              <Select value={type} onValueChange={(v) => {
                setType(v as typeof type);
                setAllocs([]);
                setPartyId("");
              }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="RECEIPT">{t.payments.receipt}</SelectItem>
                  <SelectItem value="PAYMENT">{t.payments.payment}</SelectItem>
                  <SelectItem value="CONTRA">{t.payments.contra}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>
                {type === "CONTRA" ? t.payments.fromAccount : t.payments.method}
              </Label>
              <Select value={method} onValueChange={(v) => {
                setMethod(v as typeof method);
                if (v !== "PDC_IN" && v !== "PDC_OUT") {
                  setChequeNo("");
                  setBankName("");
                  setClearanceDate("");
                }
              }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CASH">{t.payments.cash}</SelectItem>
                  <SelectItem value="BANK">{t.payments.bank}</SelectItem>
                  <SelectItem value="PDC_IN">{t.payments.pdcIn}</SelectItem>
                  <SelectItem value="PDC_OUT">{t.payments.pdcOut}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t.common.date}</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          {type !== "CONTRA" && (
            <div className="space-y-1.5">
              <Label>{t.nav.parties}</Label>
              <Select value={partyId} onValueChange={(v) => { setPartyId(v); setAllocs([]); }}>
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {eligible.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      <span className="font-mono text-xs">{p.code}</span> {p.nameEn}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {(method === "PDC_IN" || method === "PDC_OUT") && (
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>{t.payments.chequeNo}</Label>
                <Input value={chequeNo} onChange={(e) => setChequeNo(e.target.value)} placeholder="e.g. 123456" />
              </div>
              <div className="space-y-1.5">
                <Label>{t.payments.bankName}</Label>
                <Input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="Bank name" />
              </div>
              <div className="space-y-1.5">
                <Label>{t.payments.clearanceDate}</Label>
                <Input type="date" value={clearanceDate} onChange={(e) => setClearanceDate(e.target.value)} />
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t.common.amount} (AED)</Label>
              <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} dir="ltr" />
            </div>
            <div className="space-y-1.5">
              <Label>{t.payments.reference}</Label>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} />
            </div>
          </div>

          {type !== "CONTRA" && partyId && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>{t.payments.allocations}</Label>
                <Button variant="outline" size="sm" onClick={addAllocation} disabled={!outstandingList.length}>
                  <Plus className="size-4" /> {t.payments.addAllocation}
                </Button>
              </div>
              {allocs.length > 0 && (
                <div className="space-y-2">
                  {allocs.map((a, idx) => {
                    const inv = openInvoices.find((o) => o.invoiceId === a.invoiceId);
                    const available = outstandingList.filter(
                      (o) => o.invoiceId === a.invoiceId || !allocs.some((x) => x.invoiceId === o.invoiceId),
                    );
                    return (
                      <div key={idx} className="flex items-center gap-2">
                        <Select
                          value={a.invoiceId}
                          onValueChange={(v) => {
                            const o = outstandingList.find((x) => x.invoiceId === v);
                            setAllocs((prev) =>
                              prev.map((x, i) => (i === idx ? { invoiceId: v, amount: o?.outstanding ?? "" } : x)),
                            );
                          }}
                        >
                          <SelectTrigger className="flex-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="max-h-64">
                            {available.map((o) => (
                              <SelectItem key={o.invoiceId} value={o.invoiceId}>
                                <span className="font-mono text-xs">{o.invoiceNo}</span>
                                {" — "}
                                <span className="tabular-nums">{o.outstandingFormatted}</span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          type="number" min="0" step="0.01"
                          value={a.amount}
                          onChange={(e) =>
                            setAllocs((prev) => prev.map((x, i) => (i === idx ? { ...x, amount: e.target.value } : x)))
                          }
                          className="w-40"
                          dir="ltr"
                        />
                        <span className="text-xs text-muted-foreground">
                          {inv ? `AED ${inv.outstandingFormatted}` : ""}
                        </span>
                        <Button variant="ghost" size="sm" onClick={() => setAllocs((prev) => prev.filter((_, i) => i !== idx))}>
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </div>
                    );
                  })}
                  {overAllocated && (
                    <p className="text-sm text-destructive">{t.payments.overAlloc}</p>
                  )}
                </div>
              )}
            </div>
          )}

          <Input placeholder={t.common.notes} value={notes} onChange={(e) => setNotes(e.target.value)} />

          <div className="flex justify-end">
            <Button onClick={submit} disabled={submitting}>
              {t.common.post}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
