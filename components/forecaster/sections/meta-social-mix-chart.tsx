// components/forecaster/sections/meta-social-mix-chart.tsx
"use client";

/**
 * Meta — Adriana's "Social Mix — $ by social partner (MIR)": a grouped bar chart
 * of spend_2025 vs spend_2026 for each social partner (META, TikTok, Reddit,
 * LinkedIn, Pinterest, Snapchat, Twitter, MIQ-Social).
 *
 * social_partner_mix carries no client id, so this is a whole-book (MIR) total,
 * matching the "MIR" framing in the spec. The partner table + share bars live in
 * the reused MediaOcean social section alongside this chart.
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
import { useSocialPartnerMix } from "../../../lib/dashboard/data/use-social-partner-mix";

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}
function compactMoney(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `$${(v / 1_000_000).toFixed(0)}M`;
  if (abs >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${Math.round(v)}`;
}
function fullMoney(v: number): string {
  return `$${Math.round(v).toLocaleString("en-CA")}`;
}

export default function MetaSocialMixChart() {
  const { rows, loading, error } = useSocialPartnerMix();

  const data = useMemo(() => {
    const map = new Map<string, { partner: string; spend2025: number; spend2026: number }>();
    for (const r of rows) {
      const p = (r.PLUSCO_MEDIA_PARTNER ?? "").toString().trim() || "—";
      const g = map.get(p) ?? { partner: p, spend2025: 0, spend2026: 0 };
      g.spend2025 += num(r.spend_2025);
      g.spend2026 += num(r.spend_2026);
      map.set(p, g);
    }
    return Array.from(map.values()).sort((a, b) => b.spend2026 - a.spend2026);
  }, [rows]);

  return (
    <div data-scroll-section data-scroll-label="Social mix by partner" className="space-y-3">
      <h3 className="text-base font-bold text-foreground">
        Social Mix — $ by Social Partner (MIR)
      </h3>
      <div className="h-80 rounded-xl border border-gray-200 p-4">
        {loading ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Loading…
          </div>
        ) : error ? (
          <div className="flex h-full items-center justify-center text-sm text-red-600">
            {error}
          </div>
        ) : data.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No social partner data.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
              <XAxis
                dataKey="partner"
                tick={{ fontSize: 11, fill: "#6b7280" }}
                interval={0}
                angle={-25}
                textAnchor="end"
                height={60}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#6b7280" }}
                tickFormatter={compactMoney}
                width={56}
              />
              <Tooltip
                formatter={(v: number) => fullMoney(v)}
                labelStyle={{ color: "#111827", fontWeight: 600 }}
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="spend2025" name="2025" fill="#6366f1" radius={[2, 2, 0, 0]} />
              <Bar dataKey="spend2026" name="2026" fill="#f59e0b" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
