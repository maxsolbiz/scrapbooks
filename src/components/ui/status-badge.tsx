import { cn } from "@/lib/utils";

const VARIANTS = {
  DRAFT: {
    dot: "bg-warning",
    classes: "border-warning/40 bg-warning/10 text-amber-600 dark:text-amber-400",
  },
  POSTED: {
    dot: "bg-success",
    classes: "border-emerald-600/30 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400",
  },
  VOID: {
    dot: "bg-destructive",
    classes: "border-destructive/40 bg-destructive/10 text-destructive",
  },
  CLOSED: {
    dot: "bg-muted-foreground",
    classes: "border-border bg-muted text-muted-foreground",
  },
} as const;

export type StatusKind = "DRAFT" | "POSTED" | "VOID" | "CLOSED";

export function StatusBadge({
  status,
  label,
  className,
}: {
  status: string;
  label?: string;
  className?: string;
}) {
  const kind: StatusKind = (VARIANTS as Record<string, unknown>)[status]
    ? (status as StatusKind)
    : "DRAFT";
  const v = VARIANTS[kind];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize",
        v.classes,
        className,
      )}
    >
      <span aria-hidden className={cn("size-1.5 rounded-full", v.dot)} />
      {label ?? status.toLowerCase()}
    </span>
  );
}
