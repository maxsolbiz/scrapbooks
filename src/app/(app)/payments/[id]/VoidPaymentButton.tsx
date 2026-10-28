"use client";

import { useRouter } from "next/navigation";
import { Ban } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { voidPaymentAction } from "../actions";

export function VoidPaymentButton({
  paymentId,
  label,
  confirmText,
  cancelLabel,
  reasonLabel,
  reasonPlaceholder,
}: {
  paymentId: string;
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
        const res = await voidPaymentAction(paymentId, reason);
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
