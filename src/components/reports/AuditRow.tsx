"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { formatDubaiDateTime } from "@/lib/reports";

type BadgeVariant = "default" | "secondary" | "destructive" | "outline" | "ghost" | "link";

interface AuditRowProps {
  row: {
    id: string;
    createdAt: Date;
    userEmail: string;
    action: string;
    entityType: string | null;
    entityId: string | null;
    detail: string | null;
  };
  severity: Record<string, BadgeVariant>;
}

export function AuditRow({ row, severity }: AuditRowProps) {
  const [open, setOpen] = useState(false);

  const badgeVariant = severity[row.action] ?? "outline";

  return (
    <>
      <DialogTrigger asChild>
        <tr key={row.id} className="border-b cursor-pointer hover:bg-muted/50 transition-colors">
          <td className="py-2">{formatDubaiDateTime(row.createdAt)}</td>
          <td className="py-2 font-mono text-xs">{row.userEmail}</td>
          <td className="py-2"><Badge variant={badgeVariant}>{row.action}</Badge></td>
          <td className="py-2 text-xs">{row.entityType ?? "—"}</td>
          <td className="py-2 font-mono text-xs">{row.entityId ?? "—"}</td>
          <td className="py-2 text-xs truncate max-w-xs">{row.detail ?? "—"}</td>
        </tr>
      </DialogTrigger>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Audit detail</DialogTitle>
            <DialogDescription>{row.action}</DialogDescription>
          </DialogHeader>
          <div className="whitespace-pre-wrap break-words text-xs leading-relaxed">
            {row.detail ?? "—"}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
