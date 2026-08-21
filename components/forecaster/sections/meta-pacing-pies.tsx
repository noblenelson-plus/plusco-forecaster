// components/forecaster/sections/meta-pacing-pies.tsx
"use client";

/**
 * Meta — Phase 4b: the "% of Clients" pies. Summarizes the (dashboard-scoped)
 * clients three ways, matching the Looker pacing-vs-target donuts:
 *   • Meta Share Trend (Divested / Flat / Increasing) — read from the synced
 *     meta_share_trend column.
 *   • Meta Share vs Divestment Target (Achieved / Unmet) — derived: a client
 *     has achieved when its 2026 meta share is at or below its target share.
 *   • Meta Spend Pacing (Overpacing / OK) — derived: overpacing when the
 *     spend-vs-target ratio outruns the share of the year elapsed.
 * The flag columns aren't synced, so the last two are computed here.
 */

import { useMemo } from "react";
import ForecasterPieChart, {
  type PieSegment,
} from "../charts/pie-chart";
import { PieChart } from "lucide-react";
import ChartCard from "../../dashboard/charts/chart-card";
import type { KpiByClientRow } from "../../../lib/dashboard/data/use-mo-kpi-by-client";

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function PieCard({ title, segments }: { title: string; segments: PieSegment[] }) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  return (
    <ChartCard title={title} icon={PieChart}>
      {total > 0 ? (
        <div className="mt-2 flex justify-center">
          <ForecasterPieChart
            segments={segments}
            valueFormat={(v) => `${v} clients`}
          />
        </div>
      ) : (
        <div className="flex h-48 items-center justify-center text-xs text-muted-foreground">
          No clients in scope
        </div>
      )}
    </ChartCard>
  );
}

export default function MetaPacingPies({ rows }: { rows: KpiByClientRow[] }) {
  const { shareTrend, shareVsTarget, pacing } = useMemo(() => {
    let divested = 0,
      flat = 0,
      increasing = 0,
      achieved = 0,
      unmet = 0,
      overpacing = 0,
      ok = 0;
    const pctYear = (new Date().getMonth() + 1) / 12;

    for (const r of rows) {
      const trend = (r.meta_share_trend ?? "").toString().toLowerCase();
      if (trend.includes("divest")) divested += 1;
      else if (trend.includes("increas")) increasing += 1;
      else if (trend.includes("flat")) flat += 1;

      const social2026 = num(r.social_spend_2026);
      const meta2026 = num(r.meta_spend_2026);
      const socialForecast = num(r.social_forecast_rfq1);
      const target = num(r.target_meta_spend_2026);

      if (social2026 > 0 && socialForecast > 0) {
        const metaShare = meta2026 / social2026;
        const targetShare = target / socialForecast;
        if (metaShare - targetShare <= 0) achieved += 1;
        else unmet += 1;
      }

      if (meta2026 > 0 && target > 0) {
        const pacingIndex = (meta2026 / target / pctYear) * 100;
        if (pacingIndex >= 100) overpacing += 1;
        else ok += 1;
      }
    }

    const shareTrend: PieSegment[] = [
      { label: "Divested Meta Share", value: divested, color: "#6366f1" },
      { label: "Flat Meta Share", value: flat, color: "#9ca3af" },
      { label: "Increasing Meta Share", value: increasing, color: "#f59e0b" },
    ];
    const shareVsTarget: PieSegment[] = [
      { label: "Divestment Target Achieved", value: achieved, color: "#10b981" },
      { label: "Divestment Target Unmet", value: unmet, color: "#6366f1" },
    ];
    const pacing: PieSegment[] = [
      { label: "Overpacing", value: overpacing, color: "#14b8a6" },
      { label: "OK", value: ok, color: "#f59e0b" },
    ];
    return { shareTrend, shareVsTarget, pacing };
  }, [rows]);

  return (
    <div data-scroll-section data-scroll-label="Meta % of clients" className="space-y-3">
      <h3 className="text-base font-bold text-foreground">% of Clients</h3>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <PieCard title="Meta Share Trend" segments={shareTrend} />
        <PieCard title="Meta Share vs Divestment Target" segments={shareVsTarget} />
        <PieCard title="Meta Spend Pacing" segments={pacing} />
      </div>
    </div>
  );
}
