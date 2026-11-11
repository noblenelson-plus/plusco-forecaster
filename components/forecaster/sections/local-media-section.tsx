// components/forecaster/sections/local-media-section.tsx
"use client";

/**
 * Exec KPI Dashboard → Local Media. Replicates Adriana's "Local Media" sheet:
 *   1. MIR booked net by channel × local-media tag (Foreign / Hybrid / Local).
 *   2. The hybrid proxies (share of each channel's hybrid dollars that is local)
 *      and how they split the hybrid dollars. Admins edit them in place
 *      (config/local_media_proxies).
 *   3. The same table with hybrid split into local / foreign, plus the
 *      Digital Media line → Total Media LMI and Digital Media LMI (the two
 *      figures in the Exec KPI presentation).
 * US-focused clients (BRP, Intact Financial Global Brand, Mekanism USD clients)
 * are excluded, as in the sheet; the page names the ones it left out.
 * Driven by the dashboard filters, the Year and the Exec Months filter. CAD.
 */

import { useEffect, useMemo, useState } from "react";
import { Loader2, MapPin, Percent, Table, SlidersHorizontal, Pencil, Info } from "lucide-react";
import StatCard from "../../dashboard/charts/stat-card";
import ChartCard from "../../dashboard/charts/chart-card";
import { useLocalMediaMix } from "../../../lib/dashboard/data/use-local-media-mix";
import { useAccess } from "../../../lib/hooks/use-access";
import { useAuth } from "../../../lib/auth-context";
import {
  subscribeToLocalMediaProxies,
  saveLocalMediaProxies,
} from "../../../lib/services/local-media-proxy-service";
import {
  PROXY_CHANNELS,
  localMediaMonth,
  summarizeLocalMedia,
  type LocalMediaProxies,
  type LocalMediaProxy,
} from "../../../lib/format/local-media";
import type { Client } from "../../../lib/types/client.types";

const money = (v: number) => `$${Math.round(v).toLocaleString("en-CA")}`;
const pct = (v: number | null, digits = 0) => (v === null ? "—" : `${(v * 100).toFixed(digits)}%`);
const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function monthsLabel(months: readonly number[]): string {
  if (months.length === 0 || months.length === 12) return "Full year";
  const sorted = [...months].sort((a, b) => a - b);
  const contiguous = sorted.every((m, i) => i === 0 || m === sorted[i - 1] + 1);
  return contiguous
    ? `${MONTH_ABBR[sorted[0] - 1]}–${MONTH_ABBR[sorted.at(-1)! - 1]}`
    : sorted.map((m) => MONTH_ABBR[m - 1]).join(", ");
}

// Shared table styling (same as the Media Investments channel table).
const TH = "py-2 font-medium";
const HEAD_ROW = "border-b border-border text-xs uppercase tracking-wider text-muted-foreground";
const ROW = "border-b border-border/60";
const NUM = "py-2 text-right tabular-nums text-muted-foreground";
const TOTAL_ROW = "border-t-2 border-border font-semibold";
const TOTAL_NUM = "py-2 text-right tabular-nums text-foreground";

export default function LocalMediaSection({
  scopedClientIds,
  clients,
  year,
  months,
}: {
  scopedClientIds: string[];
  clients: Client[];
  year: number;
  /** Exec Months filter (1–12; empty = full year). */
  months?: readonly number[];
}) {
  const { rows, loading, error } = useLocalMediaMix();
  const { ctx } = useAccess();
  const { user } = useAuth();
  const [proxies, setProxies] = useState<LocalMediaProxies | null>(null);
  useEffect(() => subscribeToLocalMediaProxies(setProxies), []);

  // Client scope arrives as ids; MIR rows key on the client name (same as Media Investments).
  const scopedNames = useMemo(() => {
    const nameById = new Map(clients.map((c) => [c.cl_id, c.CL_Name]));
    const out = new Set<string>();
    for (const id of scopedClientIds) {
      const n = nameById.get(id);
      if (n) out.add(n.trim().toLowerCase());
    }
    return out;
  }, [scopedClientIds, clients]);

  const monthSet = useMemo(() => new Set(months && months.length ? months : MONTH_ABBR.map((_, i) => i + 1)), [months]);

  const { inScope, excluded, source } = useMemo(() => {
    const inScope = [];
    const excluded = new Set<string>();
    const sources = new Set<string>();
    for (const r of rows) {
      if (r.PLUSCO_YEAR !== String(year)) continue;
      if (!scopedNames.has(String(r.PLUSCO_CLIENT_NAME ?? "").trim().toLowerCase())) continue;
      const m = localMediaMonth(r);
      if (m === null || !monthSet.has(m)) continue;
      if (r.SOURCE) sources.add(r.SOURCE);
      if (r.US_FOCUSED) {
        excluded.add(String(r.PLUSCO_CLIENT_NAME));
        continue;
      }
      inScope.push(r);
    }
    return { inScope, excluded: [...excluded].sort(), source: [...sources].sort().join(", ") };
  }, [rows, year, scopedNames, monthSet]);

  const yearProxies = proxies?.[String(year)];
  const s = useMemo(() => summarizeLocalMedia(inScope, yearProxies), [inScope, yearProxies]);

  if (loading || !proxies) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        <Loader2 size={20} className="animate-spin" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="border border-red-500 bg-red-500 px-4 py-3 text-sm text-white">
        Couldn&apos;t load Local Media: {error}
      </div>
    );
  }

  const empty = s.tagTotal.total === 0;

  return (
    <div className="space-y-6">
      <div data-scroll-section data-scroll-label="Local Media Investment" className="space-y-6">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <MapPin size={18} className="text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Local Media Investment</h2>
            <span className="text-xs font-medium text-muted-foreground">
              · {year} · {monthsLabel(months ?? [])}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Booked net ordered (CAD) from the MIR{source ? ` (${source})` : ""}, media channel N/A left out.{" "}
            <span className="font-semibold text-foreground">Excludes US-focused clients</span> (BRP, Intact Financial (IFC) &amp; Mekanism US clients)
            {excluded.length > 0 && <>: {excluded.join(", ")}</>}.
          </p>
        </div>

        {empty ? (
          <div className="flex h-40 items-center justify-center border border-dashed border-gray-200 text-sm text-muted-foreground">
            No booked media for {year} in the current filters.
          </div>
        ) : (
          <>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                icon={Percent}
                label="Total Media LMI"
                value={pct(s.totalLmi)}
                sub={`${money(s.splitTotal.local)} local of ${money(s.splitTotal.total)}`}
              />
              <StatCard
                icon={Percent}
                label="Digital Media LMI"
                value={pct(s.digitalLmi)}
                sub={`${money(s.digital.local)} local of ${money(s.digital.total)}`}
              />
              <StatCard icon={MapPin} label="Total Media" value={money(s.tagTotal.total)} sub="Foreign + hybrid + local" />
              <StatCard
                icon={SlidersHorizontal}
                label="Hybrid, split by proxy"
                value={money(s.tagTotal.hybrid)}
                sub={`${pct(s.tagTotal.total ? s.tagTotal.hybrid / s.tagTotal.total : null)} of total media`}
              />
            </div>

            <ChartCard title="Investment by Channel and Local Media Tag" subtitle="As tagged in the MIR (PLUSCO_LOCAL_MEDIA)" icon={Table}>
              <table className="w-full text-sm">
                <thead>
                  <tr className={HEAD_ROW}>
                    <th className={`${TH} text-left`}>Channel</th>
                    <th className={`${TH} text-right`}>Foreign</th>
                    <th className={`${TH} text-right`}>Hybrid</th>
                    <th className={`${TH} text-right`}>Local</th>
                    <th className={`${TH} text-right`}>Grand Total</th>
                  </tr>
                </thead>
                <tbody>
                  {s.byTag.map((r) => (
                    <tr key={r.channel} className={ROW}>
                      <td className="py-2 text-left text-foreground">{r.channel}</td>
                      <td className={NUM}>{r.foreign ? money(r.foreign) : ""}</td>
                      <td className={NUM}>{r.hybrid ? money(r.hybrid) : ""}</td>
                      <td className={NUM}>{r.local ? money(r.local) : ""}</td>
                      <td className={NUM}>{money(r.total)}</td>
                    </tr>
                  ))}
                  <tr className={TOTAL_ROW}>
                    <td className="py-2 text-left text-foreground">Grand Total</td>
                    <td className={TOTAL_NUM}>{money(s.tagTotal.foreign)}</td>
                    <td className={TOTAL_NUM}>{money(s.tagTotal.hybrid)}</td>
                    <td className={TOTAL_NUM}>{money(s.tagTotal.local)}</td>
                    <td className={TOTAL_NUM}>{money(s.tagTotal.total)}</td>
                  </tr>
                </tbody>
              </table>
            </ChartCard>
          </>
        )}
      </div>

      <div data-scroll-section data-scroll-label="Hybrid Proxies">
        <ProxiesCard
          year={String(year)}
          allProxies={proxies}
          proxies={yearProxies}
          hybridSplit={s.hybridSplit}
          canEdit={ctx.isAdmin}
          editor={user?.email ?? null}
        />
      </div>

      {!empty && (
        <div data-scroll-section data-scroll-label="Local vs Foreign">
          <ChartCard
            title="Local vs Foreign, Hybrid Split by Proxy"
            subtitle="Hybrid dollars assigned to local and foreign with the proxies above"
            icon={Table}
          >
            {s.missingProxies.length > 0 && (
              <div className="mb-3 flex items-start gap-2 bg-yellow-400 px-3 py-2 text-xs text-gray-900">
                <Info size={14} className="mt-0.5 flex-shrink-0" />
                No {year} proxy for {s.missingProxies.join(", ")}: those hybrid dollars stay in the total but count as neither local nor foreign.
              </div>
            )}
            <table className="w-full text-sm">
              <thead>
                <tr className={HEAD_ROW}>
                  <th className={`${TH} text-left`}>Channel</th>
                  <th className={`${TH} text-right`}>Foreign</th>
                  <th className={`${TH} text-right`}>Local</th>
                  <th className={`${TH} text-right`}>Grand Total</th>
                  <th className={`${TH} text-right`}>% of Total</th>
                </tr>
              </thead>
              <tbody>
                {s.split.map((r) => (
                  <tr key={r.channel} className={ROW}>
                    <td className="py-2 text-left text-foreground">{r.channel}</td>
                    <td className={NUM}>{r.foreign ? money(r.foreign) : ""}</td>
                    <td className={NUM}>{r.local ? money(r.local) : ""}</td>
                    <td className={NUM}>{money(r.total)}</td>
                    <td className={NUM}>{pct(r.shareOfTotal, 1)}</td>
                  </tr>
                ))}
                <tr className={TOTAL_ROW}>
                  <td className="py-2 text-left text-foreground">Grand Total</td>
                  <td className={TOTAL_NUM}>{money(s.splitTotal.foreign)}</td>
                  <td className={TOTAL_NUM}>{money(s.splitTotal.local)}</td>
                  <td className={TOTAL_NUM}>{money(s.splitTotal.total)}</td>
                  <td className={TOTAL_NUM} />
                </tr>
                <tr className="font-semibold">
                  <td className="py-2 text-left text-foreground">Digital Media</td>
                  <td className={TOTAL_NUM}>{money(s.digital.foreign)}</td>
                  <td className={TOTAL_NUM}>{money(s.digital.local)}</td>
                  <td className={TOTAL_NUM}>{money(s.digital.total)}</td>
                  <td className={TOTAL_NUM} />
                </tr>
              </tbody>
            </table>
            <div className="mt-4 grid max-w-md grid-cols-2 gap-x-6 gap-y-1 border-t border-border pt-3 text-sm">
              <span className="text-foreground">Total Media LMI</span>
              <span className="text-right font-bold tabular-nums text-foreground">{pct(s.totalLmi)}</span>
              <span className="text-foreground">Digital Media LMI</span>
              <span className="text-right font-bold tabular-nums text-foreground">{pct(s.digitalLmi)}</span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              LMI = local share of booked media. Digital = Digital Direct, Programmatic, SEM and Social.
            </p>
          </ChartCard>
        </div>
      )}
    </div>
  );
}

// ─── Proxies ─────────────────────────────────────────────────────────────────

type Draft = Record<string, { local: string; source: string; note: string }>;

function ProxiesCard({
  year,
  allProxies,
  proxies,
  hybridSplit,
  canEdit,
  editor,
}: {
  year: string;
  allProxies: LocalMediaProxies;
  proxies: Record<string, LocalMediaProxy> | undefined;
  hybridSplit: ReturnType<typeof summarizeLocalMedia>["hybridSplit"];
  canEdit: boolean;
  editor: string | null;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const splitByChannel = new Map(hybridSplit.map((h) => [h.channel.toUpperCase(), h]));

  const startEdit = () => {
    const d: Draft = {};
    for (const ch of PROXY_CHANNELS) {
      const p = proxies?.[ch];
      d[ch] = { local: p ? String(Math.round(p.local * 1000) / 10) : "", source: p?.source ?? "", note: p?.note ?? "" };
    }
    setSaveError(null);
    setDraft(d);
  };

  const draftError = draft
    ? PROXY_CHANNELS.map((ch) => {
        const v = draft[ch].local.trim();
        if (v === "") return null;
        const n = Number(v);
        return Number.isFinite(n) && n >= 0 && n <= 100 ? null : `${ch}: enter a local share from 0 to 100`;
      }).find(Boolean) ?? null
    : null;

  async function save() {
    if (!draft || draftError) return;
    const out: Record<string, LocalMediaProxy> = {};
    for (const ch of PROXY_CHANNELS) {
      const v = draft[ch].local.trim();
      if (v === "") continue;
      out[ch] = {
        local: Number(v) / 100,
        source: draft[ch].source.trim(),
        ...(draft[ch].note.trim() ? { note: draft[ch].note.trim() } : {}),
      };
    }
    setSaving(true);
    setSaveError(null);
    try {
      await saveLocalMediaProxies(allProxies, year, out, editor);
      setDraft(null);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  const input = "w-full border border-gray-200 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400";

  return (
    <ChartCard
      title="Hybrid Proxies"
      subtitle={`How ${year} hybrid dollars are split between local and foreign`}
      icon={SlidersHorizontal}
      action={
        canEdit && !draft ? (
          <button
            onClick={startEdit}
            className="flex items-center gap-1.5 border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900"
          >
            <Pencil size={12} /> Edit proxies
          </button>
        ) : undefined
      }
    >
      <table className="w-full text-sm">
        <thead>
          <tr className={HEAD_ROW}>
            <th className={`${TH} text-left`}>Channel</th>
            <th className={`${TH} text-left`}>Proxy source</th>
            <th className={`${TH} text-right`}>Local</th>
            <th className={`${TH} text-right`}>Foreign</th>
            <th className={`${TH} text-right`}>Hybrid $</th>
            <th className={`${TH} text-right`}>→ Local</th>
            <th className={`${TH} text-right`}>→ Foreign</th>
            <th className={`${TH} pl-4 text-left`}>Notes</th>
          </tr>
        </thead>
        <tbody>
          {PROXY_CHANNELS.map((ch) => {
            const p = proxies?.[ch];
            const h = splitByChannel.get(ch.toUpperCase());
            const d = draft?.[ch];
            return (
              <tr key={ch} className={ROW}>
                <td className="py-2 text-left text-foreground">{ch}</td>
                <td className="py-2 pr-2 text-left text-muted-foreground">
                  {d ? (
                    <input className={input} value={d.source} onChange={(e) => setDraft({ ...draft!, [ch]: { ...d, source: e.target.value } })} />
                  ) : (
                    p?.source || "—"
                  )}
                </td>
                <td className={NUM}>
                  {d ? (
                    <span className="inline-flex items-center gap-1">
                      <input
                        className={`${input} w-16 text-right`}
                        inputMode="decimal"
                        value={d.local}
                        onChange={(e) => setDraft({ ...draft!, [ch]: { ...d, local: e.target.value } })}
                      />
                      %
                    </span>
                  ) : p ? (
                    pct(p.local)
                  ) : (
                    "—"
                  )}
                </td>
                <td className={NUM}>{d ? (d.local.trim() && Number.isFinite(Number(d.local)) ? `${Math.round((100 - Number(d.local)) * 10) / 10}%` : "—") : p ? pct(1 - p.local) : "—"}</td>
                <td className={NUM}>{h ? money(h.hybrid) : "—"}</td>
                <td className={NUM}>{h?.proxy ? money(h.toLocal) : "—"}</td>
                <td className={NUM}>{h?.proxy ? money(h.toForeign) : "—"}</td>
                <td className="py-2 pl-4 text-left text-xs text-muted-foreground">
                  {d ? (
                    <input className={input} value={d.note} onChange={(e) => setDraft({ ...draft!, [ch]: { ...d, note: e.target.value } })} />
                  ) : (
                    p?.note ?? ""
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!proxies && !draft && (
        <p className="mt-3 text-xs text-muted-foreground">No proxies for {year} yet{canEdit ? ": use Edit proxies to add them." : "."}</p>
      )}
      {draft && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            onClick={save}
            disabled={saving || !!draftError}
            className="bg-yellow-400 px-4 py-1.5 text-sm font-medium text-gray-900 hover:bg-yellow-500 disabled:opacity-50"
          >
            {saving ? "Saving…" : `Save ${year} proxies`}
          </button>
          <button onClick={() => setDraft(null)} className="border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50">
            Cancel
          </button>
          {(draftError || saveError) && <span className="text-xs font-medium text-red-600">{draftError ?? saveError}</span>}
          <span className="text-xs text-muted-foreground">Local share in %; foreign is the rest. Leave a channel blank to remove its proxy.</span>
        </div>
      )}
    </ChartCard>
  );
}
