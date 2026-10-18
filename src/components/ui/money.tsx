import { cn } from "@/lib/utils";
import { formatAED } from "@/lib/money";

export function Money({
  fils,
  aed = false,
  className,
}: {
  fils: bigint | string | number;
  aed?: boolean;
  className?: string;
}) {
  const value = typeof fils === "bigint" ? fils : BigInt(Math.round(Number(fils)));
  const formatted = formatAED(value);
  return (
    <span className={cn("font-mono tabular-nums", className)} dir="ltr">
      {aed ? `AED ${formatted}` : formatted}
    </span>
  );
}
