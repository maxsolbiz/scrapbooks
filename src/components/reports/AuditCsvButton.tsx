"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function AuditCsvButton({
  filters,
  exportSuccess,
  exportError,
  buttonLabel,
  buttonExporting,
  unexpectedMessage,
}: {
  filters: { fromDate?: string; toDate?: string; userEmail?: string; action?: string };
  exportSuccess?: string;
  exportError?: string;
  buttonLabel?: string;
  buttonExporting?: string;
  unexpectedMessage?: string;
}) {
  const [submitting, setSubmitting] = useState(false);
  return (
    <Button variant="outline" onClick={async () => {
      setSubmitting(true);
      try {
        const res = await fetch("/api/reports/audit-trail/csv", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fromDate: filters.fromDate || undefined,
            toDate: filters.toDate || undefined,
            userEmail: filters.userEmail || undefined,
            action: filters.action || undefined,
          }),
        });
        if (!res.ok) {
          let errorMsg = exportError || "Failed to export audit CSV";
          try {
            const err = await res.json();
            if (err.error) errorMsg = err.error;
          } catch {
            // ignore parse errors, use default message
          }
          toast.error(errorMsg);
          return;
        }
        const contentType = res.headers.get("content-type") ?? "";
        if (!contentType.includes("text/csv")) {
          toast.error(unexpectedMessage || "Unexpected response from server");
          return;
        }
        // Use the filename the server suggested (Dubai-formatted date).
        const disposition = res.headers.get("content-disposition") ?? "";
        const match = disposition.match(/filename="([^"]+)"/);
        const downloadName = match ? match[1] : `audit_trail_${new Date().toISOString().slice(0, 10)}.csv`;
        const blob = await res.blob();
        const href = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = href;
        a.download = downloadName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(href);
        toast.success(exportSuccess || "Audit trail exported");
      } catch {
        toast.error(exportError || "Failed to export audit CSV");
      } finally {
        setSubmitting(false);
      }
    }} disabled={submitting}>
      {submitting ? (buttonExporting || "Exporting…") : (buttonLabel || "Export CSV")}
    </Button>
  );
}
