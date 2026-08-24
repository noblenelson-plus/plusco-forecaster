// filepath: components/forecaster/sections/exec-summary-kpi-band.tsx
"use client";

/**
 * Executive Summary — the "Total Plusco" KPI band. Presentational only: the
 * section computes the numbers (for the selected source of truth + period) and
 * hands them in as pillars of metric tiles. Each tile shows the value, an
 * optional progress-to-target bar, an optional YoY pill, and a RAG status
 * (left accent + dot + bar) from exec-rag, so target achievement reads at a
 * glance in red / amber / green.
 */

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ragFromPctOfTarget,
  targetBarWidth,
  ragText,
  ragBar,
  ragDot,
  type RagStatus,
  type RagBands,
} from "./exec-rag";

/** One metric tile. `status` (when set) wins; otherwise it's derived from pctOfTarget. */
export interface ExecMetric {
  label: string;
  /** Optional icon shown beside the label. */
  icon?: LucideIcon;
  /** Preformatted display value, e.g. "$27,546,111" or "55%". */
  value: string;
  /** % of target (0..1+): drives the progress bar and the derived RAG status. */
  pctOfTarget?: number | null;
  /** Precomputed status; use for "lower is better" metrics or non-ratio rules. */
  status?: RagStatus;
  /** Caption under the value (goal text, comparison delta, note). */
  sub?: ReactNode;
  /** Right-of-bar caption, e.g. "Goal $2.6M". */
  goalLabel?: string;
  /** Optional YoY pill; `favorable` colors it green (true) or red (false). */
  yoy?: { label: string; favorable: boolean } | null;
}

export interface ExecPillar {
  title: string;
  subtitle?: string;
  metrics: ExecMetric[];
}

const ACCENT: Record<RagStatus, string> = {
  green: "border-l-emerald-500",
  amber: "border-l-amber-500",
  red: "border-l-red-500",
  neutral: "border-l-border",
};

function resolveStatus(m: ExecMetric, bands?: RagBands): RagStatus {
  if (m.status) return m.status;
  if (m.pctOfTarget != null)
    return ragFromPctOfTarget(m.pctOfTarget, bands ? { bands } : undefined);
  return "neutral";
}

function KpiTile({ metric, bands }: { metric: ExecMetric; bands?: RagBands }) {
  const status = resolveStatus(metric, bands);
  const showBar = metric.pctOfTarget != null;
  const Icon = metric.icon;

  return (
    <div
      className={`rounded-xl border border-l-4 border-border bg-card p-4 transition-colors ${ACCENT[status]}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          {Icon && (
            <Icon size={14} className="flex-shrink-0 text-muted-foreground" />
          )}
          <p className="truncate text-xs font-medium text-muted-foreground">
            {metric.label}
          </p>
        </div>
        {status !== "neutral" && (
          <span
            className={`mt-0.5 h-2 w-2 flex-shrink-0 rounded-full ${ragDot(status)}`}
            aria-hidden
          />
        )}
      </div>

      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-2xl font-bold tabular-nums text-foreground">
          {metric.value}
        </span>
        {metric.yoy && (
          <span
            className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${
              metric.yoy.favorable
                ? "bg-emerald-500/10 text-emerald-700"
                : "bg-red-500/10 text-red-700"
            }`}
          >
            {metric.yoy.label}
          </span>
        )}
      </div>

      {showBar && (
        <div className="mt-3">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={`h-1.5 rounded-full ${ragBar(status)}`}
              style={{ width: targetBarWidth(metric.pctOfTarget) }}
            />
          </div>
          <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
            <span className={`font-semibold ${ragText(status)}`}>
              {metric.pctOfTarget != null && Number.isFinite(metric.pctOfTarget)
                ? `${(metric.pctOfTarget * 100).toFixed(0)}% of target`
                : "—"}
            </span>
            {metric.goalLabel && <span>{metric.goalLabel}</span>}
          </div>
        </div>
      )}

      {metric.sub && (
        <p className="mt-2 text-[11px] text-muted-foreground">{metric.sub}</p>
      )}
    </div>
  );
}

export function RagLegend() {
  const items: { status: RagStatus; label: string }[] = [
    { status: "green", label: "On / above goal" },
    { status: "amber", label: "Approaching" },
    { status: "red", label: "Below goal" },
  ];
  return (
    <div className="flex items-center gap-4">
      {items.map((it) => (
        <span
          key={it.status}
          className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
        >
          <span className={`h-2 w-2 rounded-full ${ragDot(it.status)}`} aria-hidden />
          {it.label}
        </span>
      ))}
    </div>
  );
}

export default function ExecSummaryKpiBand({
  pillars,
  bands,
  legend = true,
}: {
  pillars: ExecPillar[];
  /** RAG threshold override, forwarded to every tile. */
  bands?: RagBands;
  /** Show the red/amber/green legend above the band. */
  legend?: boolean;
}) {
  return (
    <div className="space-y-4">
      {legend && (
        <div className="flex justify-end">
          <RagLegend />
        </div>
      )}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {pillars.map((pillar) => (
          <div key={pillar.title} className="space-y-3">
            <div className="text-center">
              <h3 className="text-base font-bold text-foreground">
                {pillar.title}
              </h3>
              {pillar.subtitle && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {pillar.subtitle}
                </p>
              )}
            </div>
            <div className="space-y-3">
              {pillar.metrics.map((metric) => (
                <KpiTile key={metric.label} metric={metric} bands={bands} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
