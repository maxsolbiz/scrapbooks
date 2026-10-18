"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ban } from "lucide-react";
import { toast } from "sonner";
import type { InvoiceDirection } from "@/generated/prisma/client";
import { Button } from "@/components/ui/button";
import { voidInvoiceAction } from "@/lib/invoice-actions";
import type { Dictionary } from "@/lib/i18n";

export function VoidInvoiceButton({
  invoiceId,
  direction,
  label,
}: {
  invoiceId: string;
  direction: InvoiceDirection;
  label: string;
}) {
  const [pending, setPending] = useState(false);
  const router = useRouter();

  async function doVoid() {
    if (!window.confirm(label)) return;
    setPending(true);
    const res = await voidInvoiceAction(invoiceId, direction);
    setPending(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(label);
    router.refresh();
  }

  return (
    <Button variant="destructive" disabled={pending} onClick={doVoid}>
      <Ban className="size-4" /> {label}
    </Button>
  );
}
