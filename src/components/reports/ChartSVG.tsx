interface MonthDatum {
  label: string;
  revenue: bigint;
  expense: bigint;
}

export function BarsChart({
  data,
  height = 140,
}: {
  data: MonthDatum[];
  height?: number;
}) {
  const pairs = data.flatMap((d) => [
    { base: d.revenue },
    { base: d.expense },
  ]);
  if (pairs.length === 0 || pairs.every((p) => p.base === 0n)) {
    return <EmptyChart height={height} />;
  }
  const max = Math.max(1, ...data.map((d) => Math.max(Number(d.revenue), Number(d.expense))));
  const barGroupWidth = 34;
  const gap = 10;
  const padL = 8;
  const w = padL * 2 + data.length * (barGroupWidth + gap) - gap;
  const scale = (maxHeight: number, v: bigint) => (Math.max(Number(v), 0) / max) * maxHeight;
  const baseY = height - 16;

  function fmt(v: bigint | number) {
    return (Number(v) / 100).toFixed(2);
  }
  return (
    <svg
      viewBox={`0 0 ${w} ${height}`}
      className="w-full"
      style={{ maxHeight: height, minWidth: 200 }}
      role="img"
      aria-label="Monthly revenue vs expense"
    >
      {data.map((d, i) => {
        const x = padL + i * (barGroupWidth + gap);
        const revH = scale(baseY - 18, d.revenue);
        const expH = scale(baseY - 18, d.expense);
        return (
          <g key={d.label}>
            {d.revenue > 0n && (
              <rect
                x={x}
                y={baseY - revH}
                width={14}
                height={Math.max(revH, 2)}
                rx="2"
                fill="var(--chart-1)"
              />
            )}
            {d.expense > 0n && (
              <rect
                x={x + 18}
                y={baseY - expH}
                width={14}
                height={Math.max(expH, 2)}
                rx="2"
                fill="var(--chart-3)"
              />
            )}
            <text x={x + barGroupWidth / 2} y={height - 4} textAnchor="middle" fontSize="9" fill="currentColor" opacity="0.5">
              {d.label}
            </text>
            <title>{`${d.label}: rev ${fmt(d.revenue)} / exp ${fmt(d.expense)} AED`}</title>
          </g>
        );
      })}
    </svg>
  );
}

export function SparkLine({
  points,
  height = 140,
}: {
  points: { label: string; balance: bigint }[];
  height?: number;
}) {
  const usable = points.filter((p) => p.balance !== undefined);
  if (usable.length < 2 || usable.every((p) => p.balance === 0n)) {
    return <EmptyChart height={height} />;
  }
  const W = 600;
  const values = usable.map((p) => Number(p.balance));
  const min = Math.min(0, ...values);
  const max = Math.max(...values, 1);
  const top = 10;
  const bottom = height - 24;
  const span = Math.max(max - min, 1);
  const coords = usable.map((p, i) => {
    const x = (i / Math.max(usable.length - 1, 1)) * (W - 16) + 8;
    const y = bottom - ((Number(p.balance) - min) / span) * (bottom - top);
    return { x, y, p };
  });
  const path = coords
    .map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`)
    .join(" ");
  const area = `${path} L${coords[coords.length - 1].x.toFixed(1)},${bottom} L${coords[0].x.toFixed(1)},${bottom} Z`;
  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${height}`}
        className="w-full"
        style={{ maxHeight: height, height: "auto" }}
        role="img"
        aria-label="Cash balance trend"
      >
        <path d={area} fill="var(--chart-1)" opacity="0.12" />
        <path d={path} fill="none" stroke="var(--chart-1)" strokeWidth="2" />
        {coords.map((c) => (
          <circle key={c.p.label} cx={c.x} cy={c.y} r="3" fill="var(--chart-1)" />
        ))}
      </svg>
      <div className="flex justify-between px-1 text-[10px] text-muted-foreground">
        {usable.map((p, i) => (
          <span key={p.label} className={i % 2 === 1 && usable.length > 8 ? "hidden sm:inline" : ""}>
            {p.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function EmptyChart({ height }: { height: number }) {
  return (
    <div
      className="flex items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground"
      style={{ height }}
    >
      No data for this period
    </div>
  );
}
