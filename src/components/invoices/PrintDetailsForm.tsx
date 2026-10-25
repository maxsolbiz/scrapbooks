"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { InvoiceDirection } from "@/generated/prisma/client";
import type { Dictionary } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateInvoicePrintDetailsAction } from "@/lib/invoice-actions";

export interface PrintDetailsValues {
  supplierRef: string;
  purchaseOrder: string;
  deliveryNote: string;
  deliveryNoteDate: string;
  vehicleNo: string;
  modeOfPayment: string;
  termsOfDelivery: string;
}

export function PrintDetailsForm({
  invoiceId,
  direction,
  current,
  dict,
}: {
  invoiceId: string;
  direction: InvoiceDirection;
  current: PrintDetailsValues;
  dict: Dictionary;
}) {
  const t = dict;
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<PrintDetailsValues>(current);
  const [saving, setSaving] = useState(false);

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        {t.invoices.editPrintDetails}
      </Button>
    );
  }

  const set = (k: keyof PrintDetailsValues, v: string) =>
    setValues((prev) => ({ ...prev, [k]: v }));

  async function save() {
    setSaving(true);
    const res = await updateInvoicePrintDetailsAction(invoiceId, direction, {
      supplierRef: values.supplierRef,
      purchaseOrder: values.purchaseOrder,
      deliveryNote: values.deliveryNote,
      deliveryNoteDate: values.deliveryNoteDate || undefined,
      vehicleNo: values.vehicleNo,
      modeOfPayment: values.modeOfPayment,
      termsOfDelivery: values.termsOfDelivery,
    });
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(t.invoices.printDetailsUpdated);
    setOpen(false);
  }

  return (
    <div className="no-print rounded-md border p-3 w-full">
      <p className="mb-2 text-sm font-medium">{t.invoices.printDetails}</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label className="text-xs">{t.invoices.supplierRef}</Label>
          <Input value={values.supplierRef} onChange={(e) => set("supplierRef", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">{t.invoices.purchaseOrder}</Label>
          <Input value={values.purchaseOrder} onChange={(e) => set("purchaseOrder", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">{t.invoices.modeOfPayment}</Label>
          <Input value={values.modeOfPayment} onChange={(e) => set("modeOfPayment", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">{t.invoices.deliveryNote}</Label>
          <Input value={values.deliveryNote} onChange={(e) => set("deliveryNote", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">{t.invoices.deliveryNoteDate}</Label>
          <Input
            type="date"
            value={values.deliveryNoteDate}
            onChange={(e) => set("deliveryNoteDate", e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">{t.invoices.vehicleNo}</Label>
          <Input value={values.vehicleNo} onChange={(e) => set("vehicleNo", e.target.value)} />
        </div>
        <div className="space-y-1.5 sm:col-span-3">
          <Label className="text-xs">{t.invoices.termsOfDelivery}</Label>
          <Input value={values.termsOfDelivery} onChange={(e) => set("termsOfDelivery", e.target.value)} />
        </div>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
          {t.common.cancel}
        </Button>
        <Button onClick={save} disabled={saving}>
          {t.common.save}
        </Button>
      </div>
    </div>
  );
}
