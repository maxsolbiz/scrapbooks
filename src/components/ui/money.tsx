import { cn } from "@/lib/utils";

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
  const amount = (Number(value) / 100).toFixed(2);
  return (
    <span className={cn("font-mono tabular-nums", className)} dir="ltr">
      {aed ? `AED ${amount}` : amount}
    </span>
  );
}
