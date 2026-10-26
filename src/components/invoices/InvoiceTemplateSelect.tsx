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
        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:w-auto dark:bg-background dark:text-foreground"
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
