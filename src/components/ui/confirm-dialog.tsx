"use client";

import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  reason,
  onConfirm,
  destructive = true,
}: {
  trigger: React.ReactNode;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  reason?: { label: string; placeholder: string };
  onConfirm: (reason: string) => Promise<{ ok: boolean; error?: string } | void>;
  destructive?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [reasonText, setReasonText] = useState("");

  async function handleConfirm() {
    if (reason && !reasonText.trim()) return;
    setPending(true);
    try {
      await onConfirm(reasonText);
      setReasonText("");
      setOpen(false);
    } finally {
      setPending(false);
    }
  }

  const reasonValid = !reason || reasonText.trim().length > 0;

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {reason && (
          <div className="space-y-1.5">
            <Label htmlFor="confirm-dialog-reason">{reason.label}</Label>
            <Textarea
              id="confirm-dialog-reason"
              value={reasonText}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setReasonText(e.target.value)}
              placeholder={reason.placeholder}
              maxLength={2000}
              className="min-h-16"
            />
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
              e.preventDefault();
              handleConfirm();
            }}
            disabled={pending || !reasonValid}
            className={destructive ? "bg-destructive text-white hover:bg-destructive/90" : ""}
          >
            {pending ? "…" : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
