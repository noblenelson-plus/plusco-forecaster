// components/forecaster/sections/meta-section.tsx
"use client";

/**
 * Meta — Phase 1: the "META DIVESTMENT" scorecards (the headline tiles of the
 * Looker Meta page). Three rows — 2025 actuals, 2026 actuals, and the 2026
 * target — computed over the dashboard-scoped clients from the mo_kpi_by_client
 * collection (the same synced source the Exec Summary's Meta column uses).
 *
 * Later phases add the GM-Pod table, the YoY partner tables/charts, and the
 * by-client table.
 */

import { useMemo } from "react";
import { Loader2 } from "lucide-react";
import StatCard from "../../dashboard/charts/stat-card";
import { useMoKpiByClient } from "../../../lib/dashboard/data/use-mo-kpi-by-client";

// ─── Formatting ────────────────────────────────────────────────────────────────
function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}
function money(v: number): string {
  return `$${Math.round(v).toLocaleString("en-CA")}`;
}
function pct(v: number | null, digits = 0): string {
  return v === null ? "—" : `${(v * 100).toFixed(digits)}%`;
}
function ppt(v: number, digits = 1): string {
  return `${v >= 0 ? "+" : ""}${(v * 100).toFixed(digits)}pt`;
}
function safeDiv(a: number, b: number): number | null {
  return b !== 0 ? a / b : null;
}

/** A labeled row of scorecards (e.g. "2025", "2026", "2026 Target"). */
function YearRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
      <div className="w-24 shrink-0 pt-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="flex flex-1 flex-wrap gap-3">{children}</div>
    </div>
  );
}

export default function MetaSection({
  scopedClientIds,
}: {
  scopedClientIds: string[];
}) {
  const scopeSet = useMemo(() => new Set(scopedClientIds), [scopedClientIds]);
  const kpi = useMoKpiByClient();

  const rows = useMemo(
    () => kpi.rows.filter((r) => scopeSet.has(r.PLUSCO_CLIENT_ID)),
    [kpi.rows, scopeSet]
  );

  const m = useMemo(() => {
    let social2025 = 0,
      meta2025 = 0,
      social2026 = 0,
      meta2026 = 0,
      other2026 = 0,
      other2025 = 0,
      socialForecast = 0,
      targetMeta = 0,
      divested = 0,
      withTrend = 0;

    for (const r of rows) {
      social2025 += num(r.social_spend_2025);
      meta2025 += num(r.meta_spend_2025);
      social2026 += num(r.social_spend_2026);
      meta2026 += num(r.meta_spend_2026);
      other2026 += num(r.other_platforms_spend_2026);
      other2025 += num(r.other_platforms_spend_2025);
      socialForecast += num(r.social_forecast_rfq1);
      targetMeta += num(r.target_meta_spend_2026);
      const trend = (r.meta_share_trend ?? "").toString().trim();
      if (trend) {
        withTrend += 1;
        if (trend.toLowerCase().includes("divest")) divested += 1;
      }
    }

    const metaShare2025 = safeDiv(meta2025, social2025);
    const metaShare2026 = safeDiv(meta2026, social2026);
    const shareVar =
      metaShare2026 !== null && metaShare2025 !== null
        ? metaShare2026 - metaShare2025
        : null;
    const otherShare2026 = safeDiv(other2026, social2026);
    const otherShare2025 = safeDiv(other2025, social2025);
    const otherShareVar =
      otherShare2026 !== null && otherShare2025 !== null
        ? otherShare2026 - otherShare2025
        : null;
    const pctDivested = safeDiv(divested, withTrend);
    const targetShare = safeDiv(targetMeta, socialForecast);
    const targetShareVar =
      targetShare !== null && metaShare2025 !== null
        ? targetShare - metaShare2025
        : null;
    const spendPacing = safeDiv(meta2026, targetMeta);
    const pctYearComplete = (new Date().getMonth() + 1) / 12;
    const pacingIndex =
      spendPacing !== null ? (spendPacing / pctYearComplete) * 100 : null;

    return {
      social2025,
      meta2025,
      metaShare2025,
      social2026,
      meta2026,
      metaShare2026,
      shareVar,
      otherShare2026,
      otherShareVar,
      pctDivested,
      socialForecast,
      targetMeta,
      targetShare,
      targetShareVar,
      spendPacing,
      pacingIndex,
    };
  }, [rows]);

  if (kpi.loading) {
    return (
      <div className="flex h-48 items-center justify-center text-muted-foreground">
        <Loader2 size={20} className="animate-spin" />
      </div>
    );
  }
  if (kpi.error) {
    return (
      <div className="border border-red-500 bg-red-500 px-4 py-3 text-sm text-white">
        {kpi.error}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Plusco Exec KPIs
        </p>
        <h2 className="text-xl font-bold text-foreground">Meta Divestment</h2>
      </div>

      <div className="space-y-6">
        {/* 2025 actuals */}
        <YearRow label="2025">
          <StatCard label="Social 2025" value={money(m.social2025)} />
          <StatCard label="Meta 2025" value={money(m.meta2025)} />
          <StatCard
            label="Meta Share of Social 2025"
            value={pct(m.metaShare2025)}
            accent="text-indigo-500"
          />
        </YearRow>

        {/* 2026 actuals */}
        <YearRow label="2026">
          <StatCard label="Social 2026" value={money(m.social2026)} />
          <StatCard label="Meta 2026" value={money(m.meta2026)} />
          <StatCard
            label="Meta Share of Social 2026"
            value={pct(m.metaShare2026)}
            sub={m.shareVar !== null ? `${ppt(m.shareVar)} vs 2025` : undefined}
            accent="text-indigo-500"
          />
          <StatCard
            label="Other Platforms Share 2026"
            value={pct(m.otherShare2026)}
            sub={
              m.otherShareVar !== null ? `${ppt(m.otherShareVar)} vs 2025` : undefined
            }
          />
          <StatCard
            label="% Clients with Divested Meta Share"
            value={pct(m.pctDivested)}
            accent="text-emerald-500"
          />
        </YearRow>

        {/* 2026 target */}
        <YearRow label="2026 Target">
          <StatCard label="Social Forecast (RFQ)" value={money(m.socialForecast)} />
          <StatCard
            label="Target Meta Spend 2026 (-30%)"
            value={money(m.targetMeta)}
          />
          <StatCard
            label="Target Meta Share 2026"
            value={pct(m.targetShare)}
            sub={m.targetShareVar !== null ? `${ppt(m.targetShareVar, 0)} vs 2025` : undefined}
            accent="text-indigo-500"
          />
          <StatCard label="Spend Pacing" value={pct(m.spendPacing)} />
          <StatCard
            label="Pacing Index"
            value={m.pacingIndex !== null ? Math.round(m.pacingIndex).toString() : "—"}
          />
        </YearRow>
      </div>

      <p className="text-xs text-muted-foreground">
        Target Meta Spend = Σ per-client target (2026 Social Forecast × 2025 Meta
        Share of Social × 0.70). Pacing Index = Spend Pacing ÷ share of year
        elapsed — the exact Looker &ldquo;v2&rdquo; formula is still being
        reconciled.
      </p>
    </div>
  );
}
