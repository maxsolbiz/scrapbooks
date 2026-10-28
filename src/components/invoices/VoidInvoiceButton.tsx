"use client";

import { useRouter } from "next/navigation";
import { Ban } from "lucide-react";
import { toast } from "sonner";
import type { InvoiceDirection } from "@/generated/prisma/client";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { voidInvoiceAction } from "@/lib/invoice-actions";

export function VoidInvoiceButton({
  invoiceId,
  direction,
  label,
  confirmText,
  cancelLabel,
  reasonLabel,
  reasonPlaceholder,
}: {
  invoiceId: string;
  direction: InvoiceDirection;
  label: string;
  confirmText: string;
  cancelLabel?: string;
  reasonLabel: string;
  reasonPlaceholder: string;
}) {
  const router = useRouter();

  return (
    <ConfirmDialog
      trigger={
        <Button variant="destructive">
          <Ban className="size-4" /> {label}
        </Button>
      }
      title={label}
      description={confirmText}
      confirmLabel={label}
      cancelLabel={cancelLabel ?? "Cancel"}
      reason={{ label: reasonLabel, placeholder: reasonPlaceholder }}
      onConfirm={async (reason) => {
        const res = await voidInvoiceAction(invoiceId, direction, reason);
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        toast.success(label);
        router.refresh();
      }}
    />
  );
}
