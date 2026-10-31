"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

type BadgeVariant = "default" | "secondary" | "destructive" | "outline" | "ghost" | "link";

interface AuditRowProps {
  row: {
    id: string;
    createdAtLabel: string;
    userEmail: string;
    action: string;
    entityType: string | null;
    entityId: string | null;
    detail: string | null;
  };
  severity: Record<string, BadgeVariant>;
  dialogTitle: string;
}

export function AuditRow({ row, severity, dialogTitle }: AuditRowProps) {
  const [open, setOpen] = useState(false);

  const badgeVariant = severity[row.action] ?? "outline";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <tr
        key={row.id}
        onClick={() => setOpen(true)}
        className="border-b hover:bg-muted/50 transition-colors"
      >
        <td className="py-2">
          <button
            type="button"
            className="w-full text-left text-xs hover:underline focus:underline"
            onClick={() => setOpen(true)}
          >
            {row.createdAtLabel}
          </button>
        </td>
        <td className="py-2 font-mono text-xs">{row.userEmail}</td>
        <td className="py-2"><Badge variant={badgeVariant}>{row.action}</Badge></td>
        <td className="py-2 text-xs">{row.entityType ?? "—"}</td>
        <td className="py-2 font-mono text-xs">{row.entityId ?? "—"}</td>
        <td className="py-2 text-xs truncate max-w-xs">{row.detail ?? "—"}</td>
      </tr>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
          <DialogDescription>{row.action}</DialogDescription>
        </DialogHeader>
        <div className="whitespace-pre-wrap break-words text-xs leading-relaxed">
          {row.detail ?? "—"}
        </div>
      </DialogContent>
    </Dialog>
  );
}
