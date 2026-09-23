// filepath: components/forecaster/sections/meta-share-trend-strip.tsx
// Meta Share Trend — client counts by trend category, as a compact bar strip.
// Shared by the Investment KPIs section and the Executive Summary so the two
// always render identically.
export default function MetaShareTrendStrip({
  data,
}: {
  data: { label: string; count: number }[];
}) {
  const total = data.reduce((acc, d) => acc + d.count, 0);
  if (total === 0) return null;
  const colorFor = (label: string): string => {
    const l = label.toLowerCase();
    if (l.includes("divest")) return "bg-blue-500";
    if (l.includes("increas")) return "bg-orange-500";
    if (l.includes("flat")) return "bg-purple-500";
    return "bg-gray-400";
  };
  return (
    <div>
      <p className="mb-2 text-xs font-medium text-muted-foreground">
        Meta Share Trend · % of {total} client{total === 1 ? "" : "s"}
      </p>
      <div className="space-y-2">
        {data.map((d) => {
          const share = total ? (d.count / total) * 100 : 0;
          return (
            <div key={d.label} className="flex items-center gap-3">
              <span className="w-44 flex-shrink-0 text-xs text-foreground">
                {d.label}
              </span>
              <div className="h-2 flex-1 overflow-hidden rounded bg-muted">
                <div
                  className={`h-2 rounded ${colorFor(d.label)}`}
                  style={{ width: `${share}%` }}
                />
              </div>
              <span className="w-24 flex-shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                {d.count} ({share.toFixed(0)}%)
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
