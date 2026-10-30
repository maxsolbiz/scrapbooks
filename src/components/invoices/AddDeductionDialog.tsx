"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { MinusCircle, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { formatAED, vatOf } from "@/lib/money";
import type { Dictionary } from "@/lib/i18n";
import type { DeductionReason } from "@/generated/prisma/enums";

interface DeductionEditValue {
  id: string;
  reason: DeductionReason;
  baseAmountFils: bigint;
  vatRate: string;
  notes: string | null;
}

interface AddDeductionDialogProps {
  invoiceId: string;
  outstanding: bigint;
  /** D1: invoice's effective VAT rate (fraction, e.g. 0.05). */
  vatRate?: number;
  deduction?: DeductionEditValue | null;
  dict: Dictionary;
}

export function AddDeductionDialog({ invoiceId, outstanding, vatRate: vatRateProp, deduction, dict }: AddDeductionDialogProps) {
  const [reason, setReason] = useState<DeductionReason>(deduction?.reason ?? "SHORTAGE");
  const [amount, setAmount] = useState(deduction ? String(Number(deduction.baseAmountFils) / 100) : "");
  const [notes, setNotes] = useState(deduction?.notes ?? "");
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();
  const t = dict;

  const rateNum = useMemo(() => {
    if (vatRateProp !== undefined) return vatRateProp;
    if (deduction?.vatRate) return parseFloat(deduction.vatRate);
    return 0;
  }, [vatRateProp, deduction]);

  const baseFils = useMemo(() => {
    const val = parseFloat(amount);
    return Number.isFinite(val) && val > 0 ? BigInt(Math.round(val * 100)) : 0n;
  }, [amount]);

  const computedVat = vatOf(baseFils, String(rateNum));
  const totalFils = baseFils + computedVat;
  const maxAmount = outstanding;

  const handleSubmit = async () => {
    if (baseFils <= 0n) {
      toast.error(t.common.required);
      return;
    }
    if (Number(totalFils) > Number(maxAmount)) {
      toast.error(t.invoices.insufficientCredit);
      return;
    }

    setSubmitting(true);
    try {
      const url = deduction ? `/api/invoices/${invoiceId}/deduction/${deduction.id}` : `/api/invoices/${invoiceId}/deduction`;
      const res = await fetch(url, {
        method: deduction ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason,
          baseAmountFils: baseFils.toString(),
          vatRate: Math.round(Number(rateNum) * 10000) / 10000,
          notes: notes || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        toast.error(data.error ?? (deduction ? "Failed to update deduction" : "Failed to post deduction"));
        return;
      }
      toast.success(deduction ? t.invoices.deductionUpdated : t.invoices.deductionPosted);
      router.refresh();
    } catch {
      toast.error(deduction ? "Failed to update deduction" : "Failed to post deduction");
    } finally {
      setSubmitting(false);
    }
  };

  const vatPercent = Number((rateNum || 0) * 100);
  const rateVisible = !Number.isNaN(rateNum) && !(rateNum === 0 && deduction === undefined);
  const canSubmit = baseFils > 0n && Number(totalFils) <= Number(maxAmount);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <MinusCircle className="size-4" />
          {deduction ? t.invoices.editDeduction : t.invoices.addDeduction}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{deduction ? t.invoices.editDeductionDialog : t.invoices.addDeductionDialog}</DialogTitle>
        </DialogHeader>
        <Card className="p-4">
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              {t.common.total} due: <span className="font-semibold">{formatAED(outstanding)}</span>
            </div>
            <div className="space-y-2">
              <Label>{t.invoices.deductionReason}</Label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value as DeductionReason)}
                className="flex h-10 w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm"
              >
                <option value="SHORTAGE">{t.invoices.reasonShortage}</option>
                <option value="DAMAGE">{t.invoices.reasonDamage}</option>
                <option value="COMMERCIAL_DISCOUNT">{t.invoices.reasonDiscount}</option>
                <option value="RETURN">{t.invoices.reasonReturn}</option>
                <option value="OTHER">{t.invoices.reasonOther}</option>
              </select>
              <Input
                type="number"
                step="0.01"
                min="0"
                max={Number(maxAmount) / 100}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={formatAED(maxAmount)}
              />
              {rateVisible ? (
                <div className="bg-muted rounded px-3 py-2 text-xs flex justify-between">
                  <span>VAT Rate / ض.ق.</span>
                  <span className="font-medium tabular-nums">{vatPercent}%</span>
                </div>
              ) : (
                <div className="bg-muted rounded px-3 py-2 text-xs flex justify-between">
                  <span>RCM (no VAT) / لا ضريبة VAT</span>
                  <span className="font-medium tabular-nums">-</span>
                </div>
              )}
              <div className="bg-muted rounded px-3 py-2 text-xs flex justify-between">
                <span>Calculated VAT / ضريبة الخصم</span>
                <span className="tabular-nums">{formatAED(computedVat)}</span>
              </div>
              <div className="bg-muted rounded px-3 py-2 text-xs flex justify-between">
                <span>Total Deduction / إجمالي الخصم</span>
                <span className="font-bold tabular-nums">{formatAED(totalFils)}</span>
              </div>
              <textarea
                className="flex min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t.invoices.deductionNotes}
              />
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => router.refresh()}>
                <X className="size-4" /> {t.common.cancel}
              </Button>
              <Button onClick={handleSubmit} disabled={submitting || !canSubmit}>
                {submitting ? <Loader2 className="size-4 animate-spin" /> : deduction ? t.invoices.updateDeduction : t.invoices.addDeduction}
              </Button>
            </div>
          </div>
        </Card>
      </DialogContent>
    </Dialog>
  );
}
