// components/forecaster/sections/meta-partner-section.tsx
"use client";

/**
 * Meta — "META PACING YOY" partner section (replaces the reused MediaOcean
 * Social section on the Meta tab). Reads social_partner_mix (partner-level YoY;
 * no client id, so it's a whole-book MIR total). Layout mirrors Looker:
 *   1. YoY partner table + grouped bar chart (spend 2025 vs 2026).
 *   2. 2025 block: partner table (spend $, %) + pie + Social/Meta/Share scorecards.
 *   3. 2026 block: same for 2026.
 *
 * UI — standardized to the app's DNA: number formatting comes from ./meta-format,
 * the tables use the semantic-token styling (bg-muted header/footer, border-border,
 * hover:bg-muted/60) shared with the other Meta tables, and the loading state uses
 * the shared spinner. Numbers, columns and chart are unchanged.
 */

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";
import { Share2, BarChart3, PieChart as PieIcon, Loader2 } from "lucide-react";
import ChartCard from "../../dashboard/charts/chart-card";
import StatCard from "../../dashboard/charts/stat-card";
import ForecasterPieChart, { type PieSegment } from "../charts/pie-chart";
import { useSocialPartnerMix } from "../../../lib/dashboard/data/use-social-partner-mix";
import { num, money, moneySigned, pct, ppt, safeDiv } from "./meta-format";

/** Compact axis labels for the bar chart (chart-only, so it stays local). */
function compactMoney(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `$${(v / 1_000_000).toFixed(0)}M`;
  if (abs >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${Math.round(v)}`;
}

const PARTNER_COLORS: Record<string, string> = {
  META: "#6366f1",
  TIKTOK: "#f59e0b",
  REDDIT: "#10b981",
  LINKEDIN: "#a855f7",
  PINTEREST: "#ef4444",
  SNAPCHAT: "#14b8a6",
  TWITTER: "#3b82f6",
  "MIQ-SOCIAL": "#eab308",
};
function partnerColor(p: string): string {
  return PARTNER_COLORS[p.toUpperCase()] ?? "#9ca3af";
}

interface Partner {
  partner: string;
  spend2025: number;
  spend2026: number;
}

/** A per-year partner table: Partner · Spend $ · Spend % (of that year's social). */
function YearTable({
  partners,
  year,
  socialTotal,
}: {
  partners: Partner[];
  year: 2025 | 2026;
  socialTotal: number;
}) {
  const key = year === 2025 ? "spend2025" : "spend2026";
  const sorted = [...partners].sort((a, b) => b[key] - a[key]);
  return (
    <table className="min-w-full border-collapse text-sm">
      <thead>
        <tr className="border-b border-border bg-muted text-xs uppercase tracking-wider text-muted-foreground">
          <th className="px-3 py-2.5 text-left font-medium">Partner</th>
          <th className="px-3 py-2.5 text-right font-medium">Spend $</th>
          <th className="px-3 py-2.5 text-right font-medium">Spend %</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((p) => (
          <tr
            key={p.partner}
            className="border-b border-border/60 transition-colors hover:bg-muted/60"
          >
            <td className="whitespace-nowrap px-3 py-2 text-left text-foreground">{p.partner}</td>
            <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-foreground">{money(p[key])}</td>
            <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-foreground">{pct(safeDiv(p[key], socialTotal))}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="border-t-2 border-border bg-muted font-semibold text-foreground">
          <td className="px-3 py-2.5 text-left">Grand total</td>
          <td className="px-3 py-2.5 text-right tabular-nums">{money(socialTotal)}</td>
          <td className="px-3 py-2.5 text-right tabular-nums">100%</td>
        </tr>
      </tfoot>
    </table>
  );
}

export default function MetaPartnerSection() {
  const { rows, loading, error } = useSocialPartnerMix();

  const m = useMemo(() => {
    const map = new Map<string, Partner>();
    for (const r of rows) {
      const p = (r.PLUSCO_MEDIA_PARTNER ?? "").toString().trim() || "—";
      const g = map.get(p) ?? { partner: p, spend2025: 0, spend2026: 0 };
      g.spend2025 += num(r.spend_2025);
      g.spend2026 += num(r.spend_2026);
      map.set(p, g);
    }
    const partners = Array.from(map.values());
    const social2025 = partners.reduce((a, p) => a + p.spend2025, 0);
    const social2026 = partners.reduce((a, p) => a + p.spend2026, 0);
    const meta = partners.find((p) => p.partner.toUpperCase() === "META");
    const meta2025 = meta?.spend2025 ?? 0;
    const meta2026 = meta?.spend2026 ?? 0;

    const byYoy = [...partners].sort((a, b) => b.spend2026 - a.spend2026);
    const barData = byYoy.map((p) => ({
      partner: p.partner,
      spend2025: p.spend2025,
      spend2026: p.spend2026,
    }));

    const pie2025: PieSegment[] = [...partners]
      .sort((a, b) => b.spend2025 - a.spend2025)
      .map((p) => ({ label: p.partner, value: p.spend2025, color: partnerColor(p.partner) }));
    const pie2026: PieSegment[] = [...partners]
      .sort((a, b) => b.spend2026 - a.spend2026)
      .map((p) => ({ label: p.partner, value: p.spend2026, color: partnerColor(p.partner) }));

    return {
      partners,
      byYoy,
      barData,
      social2025,
      social2026,
      meta2025,
      meta2026,
      metaShare2025: safeDiv(meta2025, social2025),
      metaShare2026: safeDiv(meta2026, social2026),
      pie2025,
      pie2026,
    };
  }, [rows]);

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center text-muted-foreground">
        <Loader2 size={20} className="animate-spin" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="border border-red-500 bg-red-500 px-4 py-3 text-sm text-white">{error}</div>
    );
  }

  return (
    <div data-scroll-section data-scroll-label="Meta partner YoY" className="space-y-6">
      {/* Row 1 — YoY table + grouped bar chart */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title="Social Partners — YoY" icon={Share2}>
          <div className="-mx-2 mt-2 overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-muted text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-2.5 text-left font-medium">Partner</th>
                  <th className="px-3 py-2.5 text-right font-medium">Spend 2025</th>
                  <th className="px-3 py-2.5 text-right font-medium">Spend 2026</th>
                  <th className="px-3 py-2.5 text-right font-medium">Variance $</th>
                  <th className="px-3 py-2.5 text-right font-medium">Share of Social Var</th>
                </tr>
              </thead>
              <tbody>
                {m.byYoy.map((p) => (
                  <tr
                    key={p.partner}
                    className="border-b border-border/60 transition-colors hover:bg-muted/60"
                  >
                    <td className="whitespace-nowrap px-3 py-2 text-left text-foreground">{p.partner}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-foreground">{money(p.spend2025)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-foreground">{money(p.spend2026)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-foreground">{moneySigned(p.spend2026 - p.spend2025)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-foreground">
                      {ppt(
                        (safeDiv(p.spend2026, m.social2026) ?? 0) -
                          (safeDiv(p.spend2025, m.social2025) ?? 0)
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-muted font-semibold text-foreground">
                  <td className="px-3 py-2.5 text-left">Grand total</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{money(m.social2025)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{money(m.social2026)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{moneySigned(m.social2026 - m.social2025)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">—</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </ChartCard>

        <ChartCard title="Spend by Partner: 2025 vs 2026" icon={BarChart3}>
          <div className="mt-2 h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={m.barData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                <XAxis
                  dataKey="partner"
                  tick={{ fontSize: 11, fill: "#6b7280" }}
                  interval={0}
                  angle={-25}
                  textAnchor="end"
                  height={60}
                />
                <YAxis tick={{ fontSize: 11, fill: "#6b7280" }} tickFormatter={compactMoney} width={56} />
                <Tooltip
                  formatter={(v) => money(Number(v))}
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="spend2025" name="2025" fill="#6366f1" radius={[2, 2, 0, 0]} />
                <Bar dataKey="spend2026" name="2026" fill="#f59e0b" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      {/* Row 2 — 2025 block */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartCard title="2025 — Spend by Partner" icon={Share2}>
          <div className="-mx-2 mt-2 overflow-x-auto">
            <YearTable partners={m.partners} year={2025} socialTotal={m.social2025} />
          </div>
        </ChartCard>
        <ChartCard title="2025 Social Mix" icon={PieIcon}>
          <div className="mt-2">
            <ForecasterPieChart segments={m.pie2025} valueFormat={(v) => money(v)} />
          </div>
        </ChartCard>
        <div className="flex flex-col gap-3">
          <StatCard label="Social 2025" value={money(m.social2025)} />
          <StatCard label="Meta 2025" value={money(m.meta2025)} />
          <StatCard label="Meta Share of Social 2025" value={pct(m.metaShare2025)} accent="text-indigo-500" />
        </div>
      </div>

      {/* Row 3 — 2026 block */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartCard title="2026 — Spend by Partner" icon={Share2}>
          <div className="-mx-2 mt-2 overflow-x-auto">
            <YearTable partners={m.partners} year={2026} socialTotal={m.social2026} />
          </div>
        </ChartCard>
        <ChartCard title="2026 Social Mix" icon={PieIcon}>
          <div className="mt-2">
            <ForecasterPieChart segments={m.pie2026} valueFormat={(v) => money(v)} />
          </div>
        </ChartCard>
        <div className="flex flex-col gap-3">
          <StatCard label="Social 2026" value={money(m.social2026)} />
          <StatCard label="Meta 2026" value={money(m.meta2026)} />
          <StatCard label="Meta Share of Social 2026" value={pct(m.metaShare2026)} accent="text-indigo-500" />
        </div>
      </div>
    </div>
  );
}
