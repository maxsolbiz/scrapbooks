"use client";

import { useRouter } from "next/navigation";

const OPTIONS: { value: string; label: string }[] = [
  { value: "app", label: "App invoice" },
  { value: "emirates-classic", label: "Emirates Classic (EMIRATES-348 replica)" },
  { value: "emirates-modern", label: "Emirates Modern (same layout, restyled)" },
];

export function InvoiceTemplateSelect({ value }: { value: string }) {
  const router = useRouter();
  return (
    <div className="no-print">
      <label htmlFor="invTpl" className="sr-only">
        Template
      </label>
      <select
        id="invTpl"
        value={value}
        onChange={(e) => {
          const url = new URL(window.location.href);
          url.searchParams.set("template", e.target.value);
          router.replace(url.pathname + url.search);
        }}
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
