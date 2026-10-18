"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ban } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { voidPaymentAction } from "../actions";

export function VoidPaymentButton({ paymentId, label }: { paymentId: string; label: string }) {
  const [pending, setPending] = useState(false);
  const router = useRouter();

  async function doVoid() {
    if (!window.confirm(label)) return;
    setPending(true);
    const res = await voidPaymentAction(paymentId);
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
