import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Money } from "@/components/ui/money";

export function KpiCard({
  label,
  icon: Icon,
  value,
  href,
  chip,
  chipTone = "neutral",
  negative,
}: {
  label: string;
  icon: LucideIcon;
  value: bigint;
  href?: string;
  chip?: string;
  chipTone?: "positive" | "negative" | "neutral";
  negative?: boolean;
}) {
  const body = (
    <div className="group relative overflow-hidden rounded-lg border bg-card p-4 transition-shadow hover:shadow-sm h-full">
      <Icon
        className="absolute -end-2 -top-2 size-16 text-muted-foreground/6"
        aria-hidden
      />
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span className="text-2xl font-semibold tabular-nums font-mono">
          {nMoney(value)}
        </span>
        {chip && (
          <span
            className={cn(
              "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
              chipTone === "positive" && "bg-emerald-600/10 text-emerald-700 dark:text-emerald-400",
              chipTone === "negative" && "bg-destructive/10 text-destructive",
              chipTone === "neutral" && "bg-muted text-muted-foreground",
            )}
          >
            {chip}
          </span>
        )}
      </div>
      <p className="mt-1 text-[10px] text-muted-foreground">
        {(negative ? "−" : "") + "AED"}
      </p>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

function nMoney(v: bigint) {
  const n = Number(v) / 100;
  return Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function KpiNegativeMoney({ value }: { value: bigint }) {
  return <Money fils={value} />;
}
