"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { formatAED } from "@/lib/money";
import type { Dictionary } from "@/lib/i18n";

interface ApplyCreditDialogProps {
  invoiceId: string;
  availableCredit: bigint;
  totalDue: bigint;
  dict: Dictionary;
  onSuccess: () => void;
}

export function ApplyCreditDialog({
  invoiceId,
  availableCredit,
  totalDue,
  dict,
  onSuccess,
}: ApplyCreditDialogProps) {
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();
  const t = dict;

  const maxAmount = availableCredit < totalDue ? availableCredit : totalDue;

  const handleSubmit = async () => {
    const amountFils = BigInt(parseFloat(amount) * 100);
    if (amountFils <= 0n) {
      toast.error("Amount must be greater than 0");
      return;
    }
    if (amountFils > maxAmount) {
      toast.error(t.invoices.insufficientCredit);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/apply-credit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountFils: amountFils.toString() }),
      });
      const data = await res.json();
      if (!data.ok) {
        toast.error(data.error);
        return;
      }
      toast.success(t.invoices.creditApplied);
      onSuccess();
    } catch {
      toast.error("Failed to apply credit");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <CreditCard className="size-4" />
          {t.invoices.applyCredit}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            {t.invoices.applyCreditDialog}
            <span className="text-sm font-normal text-muted-foreground">
              {t.invoices.availableCredit}: {formatAED(availableCredit)}
            </span>
          </DialogTitle>
        </DialogHeader>
        <Card className="p-4">
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              {t.invoices.availableCredit}: <span className="font-semibold text-green-600">{formatAED(availableCredit)}</span>
              <br />
              {t.common.total} due: <span className="font-semibold">{formatAED(totalDue)}</span>
            </div>
            <div className="space-y-2">
              <Label>{t.invoices.applyCredit}</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                max={Number(maxAmount) / 100}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={formatAED(maxAmount)}
              />
              <p className="text-xs text-muted-foreground">
                {t.invoices.applyCreditDialog} (max: {formatAED(maxAmount)})
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => router.refresh()}>
                <X className="size-4" /> {t.common.cancel}
              </Button>
              <Button onClick={handleSubmit} disabled={submitting || !amount}>
                {submitting ? <Loader2 className="size-4 animate-spin" /> : t.invoices.applyCredit}
              </Button>
            </div>
          </div>
        </Card>
      </DialogContent>
    </Dialog>
  );
}