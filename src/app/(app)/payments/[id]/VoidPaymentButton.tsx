"use client";

import { useRouter } from "next/navigation";
import { Ban } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { voidPaymentAction } from "../actions";

export function VoidPaymentButton({ paymentId, label }: { paymentId: string; label: string }) {
  const router = useRouter();

  return (
    <ConfirmDialog
      trigger={
        <Button variant="destructive">
          <Ban className="size-4" /> {label}
        </Button>
      }
      title={label}
      description={"This will void the payment voucher and its journal entry. This action is recorded and can be audited."}
      confirmLabel={label}
      onConfirm={async () => {
        const res = await voidPaymentAction(paymentId);
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
