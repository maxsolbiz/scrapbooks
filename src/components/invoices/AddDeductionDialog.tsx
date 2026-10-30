"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MinusCircle, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { formatAED } from "@/lib/money";
import type { Dictionary } from "@/lib/i18n";
import type { DeductionReason } from "@/generated/prisma/enums";

interface AddDeductionDialogProps {
  invoiceId: string;
  outstanding: bigint;
  deduction?: {
    id: string;
    reason: DeductionReason;
    amountFils: bigint;
    notes: string | null;
  } | null;
  dict: Dictionary;
}

export function AddDeductionDialog({ invoiceId, outstanding, deduction, dict }: AddDeductionDialogProps) {
  const [reason, setReason] = useState<DeductionReason>(deduction?.reason ?? "SHORTAGE");
  const [amount, setAmount] = useState(deduction ? (Number(deduction.amountFils) / 100).toFixed(2) : "");
  const [notes, setNotes] = useState(deduction?.notes ?? "");
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();
  const t = dict;

  const maxAmount = outstanding;

  const handleSubmit = async () => {
    const amountFils = BigInt(parseFloat(amount) * 100);
    if (amountFils <= 0n) {
      toast.error(t.common.required);
      return;
    }
    if (amountFils > maxAmount) {
      toast.error(t.invoices.insufficientCredit);
      return;
    }

    setSubmitting(true);
    try {
      const url = deduction
        ? `/api/invoices/${invoiceId}/deduction/${deduction.id}`
        : `/api/invoices/${invoiceId}/deduction`;
      const res = await fetch(url, {
        method: deduction ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, amountFils: amountFils.toString(), notes: notes || undefined }),
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
              <Label>{t.invoices.deduction}</Label>
              <select value={reason} onChange={(e) => setReason(e.target.value as DeductionReason)}>
                <option value="SHORTAGE">{t.invoices.reasonShortage}</option>
                <option value="DAMAGE">{t.invoices.reasonDamage}</option>
                <option value="DISCOUNT">{t.invoices.reasonDiscount}</option>
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
              <Button onClick={handleSubmit} disabled={submitting || !amount}>
                {submitting ? <Loader2 className="size-4 animate-spin" /> : deduction ? t.invoices.updateDeduction : t.invoices.addDeduction}
              </Button>
            </div>
          </div>
        </Card>
      </DialogContent>
    </Dialog>
  );
}
