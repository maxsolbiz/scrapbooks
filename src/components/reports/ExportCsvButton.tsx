"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface ExportCsvButtonProps {
  filters: {
    fromDate?: string;
    toDate?: string;
    partyId?: string;
    direction?: string;
    status?: string;
  };
  exportCsvLabel: string;
}

export function ExportCsvButton({ filters, exportCsvLabel }: ExportCsvButtonProps) {
  const [submitting, setSubmitting] = useState(false);

  const handleExport = async () => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/reports/invoice-register/csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromDate: filters.fromDate || undefined,
          toDate: filters.toDate || undefined,
          partyId: filters.partyId || undefined,
          direction: filters.direction || "ALL",
          status: filters.status || "ALL",
        }),
      });
      if (!res.ok) {
        toast.error("Failed to export invoice register");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `invoice_register_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Invoice register exported");
    } catch {
      toast.error("Failed to export invoice register");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Button variant="outline" onClick={handleExport} disabled={submitting}>
      {submitting ? "Exporting…" : exportCsvLabel}
    </Button>
  );
}
