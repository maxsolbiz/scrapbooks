"use client";

import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import type { InvoiceDirection } from "@/generated/prisma/client";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

/**
 * P3.2 amend flow, phase 1. Collects the mandatory reason via the shared typed
 * ConfirmDialog, then navigates to the prefilled revision form with the reason
 * in the query string. NOTHING is reversed here: the original is only reversed
 * (+ VOID) when the user finally posts the revision, atomically in one
 * transaction — an abandoned form can never leave a reversed original with no
 * replacement.
 */
export function AmendInvoiceButton({
  invoiceId,
  direction,
  path,
  label,
  confirmText,
  cancelLabel,
  reasonLabel,
  reasonPlaceholder,
}: {
  invoiceId: string;
  direction: InvoiceDirection;
  /** "/sales-invoices" or "/purchase-invoices" — the revision form lives under it. */
  path: string;
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
          <Pencil className="size-4" /> {label}
        </Button>
      }
      title={label}
      description={confirmText}
      confirmLabel={label}
      cancelLabel={cancelLabel ?? "Cancel"}
      reason={{ label: reasonLabel, placeholder: reasonPlaceholder }}
      onConfirm={async (reason) => {
        router.push(
          `${path}/new?revise=${encodeURIComponent(invoiceId)}&reason=${encodeURIComponent(reason)}`,
        );
      }}
    />
  );
}
