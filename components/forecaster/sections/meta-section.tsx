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
 *
 * UI — matches the app's section DNA: the divestment scorecards sit in a
 * `data-scroll-section` so the right-edge side-nav lists them like every other
 * section; the page title follows the Executive Summary sub-page style; and each
 * grouped area below carries a plain `text-base font-semibold` heading instead
 * of the old dark banners. All number formatting comes from ./meta-format.
 */

import { useMemo } from "react";
import { Loader2, DollarSign, PieChart, Users, Gauge, Activity } from "lucide-react";
import StatCard from "../../dashboard/charts/stat-card";
import MetaGmPodTable from "./meta-gm-pod-table";
import MetaGmPodTrendTable from "./meta-gm-pod-trend-table";
import MetaByClientTable from "./meta-by-client-table";
import MetaPacingYoy from "./meta-pacing-yoy";
import MetaPartnerSection from "./meta-partner-section";
import MetaPacingVsTarget from "./meta-pacing-vs-target";
import { useMetaSocialOutput } from "../../../lib/dashboard/data/use-meta-social-output";
import { num, money, pct, ppt, safeDiv } from "./meta-format";

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
      <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {children}
      </div>
    </div>
  );
}

export default function MetaSection({
  scopedClientIds,
}: {
  scopedClientIds: string[];
}) {
  const scopeSet = useMemo(() => new Set(scopedClientIds), [scopedClientIds]);
  const kpi = useMetaSocialOutput();

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
    <div className="space-y-10">
      {/* Divestment scorecards — now a scroll-section so the side-nav lists it. */}
      <div
        data-scroll-section
        data-scroll-label="Meta divestment"
        className="space-y-6"
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Plusco Exec KPIs
          </p>
          <h2 className="text-xl font-bold text-foreground">Meta Divestment</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Progress toward the 2026 divestment target, broken down by GM pod and
            client.
          </p>
        </div>

        <div className="space-y-6">
          {/* 2025 actuals */}
          <YearRow label="2025">
            <StatCard icon={DollarSign} label="Social 2025" value={money(m.social2025)} />
            <StatCard icon={DollarSign} label="Meta 2025" value={money(m.meta2025)} />
            <StatCard
              icon={PieChart}
              label="Meta Share of Social 2025"
              value={pct(m.metaShare2025)}
              accent="text-indigo-500"
            />
          </YearRow>

          {/* 2026 actuals */}
          <YearRow label="2026">
            <StatCard icon={DollarSign} label="Social 2026" value={money(m.social2026)} />
            <StatCard icon={DollarSign} label="Meta 2026" value={money(m.meta2026)} />
            <StatCard
              icon={PieChart}
              label="Meta Share of Social 2026"
              value={pct(m.metaShare2026)}
              variance={m.shareVar !== null ? { pillLabel: ppt(m.shareVar), isFavorable: m.shareVar <= 0 } : undefined}
              accent="text-indigo-500"
            />
            <StatCard
              icon={PieChart}
              label="Other Platforms Share 2026"
              value={pct(m.otherShare2026)}
              variance={
                m.otherShareVar !== null
                  ? { pillLabel: ppt(m.otherShareVar), isFavorable: m.otherShareVar >= 0 }
                  : undefined
              }
            />
            <StatCard
              icon={Users}
              label="% Clients with Divested Meta Share"
              value={pct(m.pctDivested)}
              accent="text-emerald-500"
            />
          </YearRow>

          {/* 2026 target */}
          <YearRow label="2026 Target">
            <StatCard icon={DollarSign} label="Social Forecast (RFQ)" value={money(m.socialForecast)} />
            <StatCard
              icon={DollarSign}
              label="Target Meta Spend 2026 (-30%)"
              value={money(m.targetMeta)}
            />
            <StatCard
              icon={PieChart}
              label="Target Meta Share 2026"
              value={pct(m.targetShare)}
              variance={m.targetShareVar !== null ? { pillLabel: ppt(m.targetShareVar, 0), isFavorable: m.targetShareVar <= 0 } : undefined}
              accent="text-indigo-500"
            />
            <StatCard icon={Gauge} label="Spend Pacing" value={pct(m.spendPacing)} />
            <StatCard
              icon={Activity}
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

      <MetaGmPodTable rows={rows} />

      <MetaGmPodTrendTable rows={rows} />

      <MetaByClientTable rows={rows} />

      {/* Section 2 — Partner Mix: where the social dollars go (META vs TikTok,
          Reddit, ...). Reuses the MediaOcean social section; it carries its own
          filters because social_partner_mix has no client id to scope by. */}
      <div className="space-y-6 border-t border-border pt-8">
        <div>
          <h2 className="text-xl font-bold text-foreground">Partner Mix</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            How social investment splits across partners (Meta vs TikTok, Reddit,
            and others), 2025 vs 2026.
          </p>
        </div>
        <MetaPartnerSection />
      </div>

      {/* Section 3 — Pacing vs Target: are we on pace to divest. The two blocks
          below share the same table+pie layout on purpose, so their headers
          spell out the difference: YoY movement vs. performance against target. */}
      <div className="space-y-8 border-t border-border pt-8">
        <div>
          <h2 className="text-xl font-bold text-foreground">Pacing vs Target</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Whether Meta share and spend are on pace to divest — year-over-year
            movement, and performance against the 2026 divestment target.
          </p>
        </div>

        <div className="space-y-4">
          <h3 className="text-base font-semibold text-foreground">
            Meta Share &amp; Spend — YoY movement
          </h3>
          <MetaPacingYoy rows={rows} />
        </div>

        <div className="space-y-4">
          <h3 className="text-base font-semibold text-foreground">
            Meta Share &amp; Spend — vs Divestment Target
          </h3>
          <MetaPacingVsTarget rows={rows} />
        </div>
      </div>
    </div>
  );
}
