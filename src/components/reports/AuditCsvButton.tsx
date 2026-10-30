"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function AuditCsvButton({ filters }: { filters: { fromDate?: string; toDate?: string; userEmail?: string; action?: string } }) {
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
          const e = await res.json();
          alert(e.error || "Failed");
          return;
        }
        const blob = await res.blob();
        const href = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = href;
        a.download = `audit_trail_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(href);
      } catch {
        alert("Failed");
      } finally {
        setSubmitting(false);
      }
    }} disabled={submitting}>
      {submitting ? "Exporting..." : "Export CSV"}
    </Button>
  );
}
