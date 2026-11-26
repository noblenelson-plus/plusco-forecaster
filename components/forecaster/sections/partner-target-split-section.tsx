// components/forecaster/sections/partner-target-split-section.tsx
"use client";

/**
 * Exec KPI → Deal Pacing: "Targets by agency, region, GM pod, BL and client".
 * Each Labs partner target from Deal Targets is split across clients
 * (lib/format/partner-target-split.ts): by the client's share of that partner in
 * the year's latest submitted RFQ Labs forecast, or — for partners not in the
 * Labs forecaster — by its share of the partner's MIR booked spend. Admins can
 * fix a client's share (partner_target_splits/{year}). The client targets are
 * rolled up by agency × BU region, GM pod, business lead or client and compared
 * with MIR booked net. Follows the dashboard filters and the global Year.
 */

import { useMemo, useState } from "react";
import { Loader2, Target, Pencil, X, Save, RotateCcw } from "lucide-react";
import StatCard from "../../dashboard/charts/stat-card";
import ChartCard from "../../dashboard/charts/chart-card";
import SheetExportButton from "../../dashboard/sheet-export-button";
import MultiSelectDropdown from "../../_shared/multi-select-dropdown";
import { useForecastSelection } from "../../../lib/stores/forecast-selection.store";
import { useUserProfile } from "../../../lib/hooks/use-user-profile";
import { usePartnerTargetSplits } from "../../../lib/dashboard/data/use-partner-target-splits";
import { saveSplitOverrides } from "../../../lib/services/partner-target-split-service";
import { rollupSplits, type PartnerSplit, type SplitBasis } from "../../../lib/format/partner-target-split";
import { ragFromPctOfTarget, ragCell } from "./exec-rag";
import type { Client } from "../../../lib/types/client.types";

const money = (v: number) => `${v < 0 ? "−" : ""}$${Math.abs(Math.round(v)).toLocaleString("en-CA")}`;
const pct = (v: number | null, d = 0) => (v == null || !Number.isFinite(v) ? "—" : `${(v * 100).toFixed(d)}%`);

type GroupBy = "agencyRegion" | "gmPod" | "bl" | "client";
const GROUPS: { id: GroupBy; label: string }[] = [
  { id: "agencyRegion", label: "Agency × BU region" },
  { id: "gmPod", label: "GM pod" },
  { id: "bl", label: "Business lead" },
  { id: "client", label: "Client" },
];

const blName = (email: string | undefined) => {
  const e = (email ?? "").trim();
  if (!e) return "No business lead";
  const local = e.includes("@") ? e.split("@")[0] : e;
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
};

function labelFor(group: GroupBy, c: Client | undefined): string {
  if (!c) return "Not a Forecaster client";
  if (group === "agencyRegion") return `${c.CL_Agency || "No agency"} · ${c.CL_Business_Unit_Region || "No BU region"}`;
  if (group === "gmPod") return c.GM_Pod || "No GM pod";
  if (group === "bl") return blName(c.CL_Business_Lead);
  return c.CL_Name;
}

function basisLabel(b: SplitBasis, year: number, round: string | null) {
  if (b === "forecast") return `${year} ${round ?? ""} Labs forecast`;
  if (b === "mir") return `MIR booked ${year}`;
  if (b === "mir-previous") return `MIR booked ${year - 1}`;
  if (b === "ssp") return "SSP — spend runs through the DSPs, not split (admin can set shares)";
  return "No basis — not split";
}

const TH = "py-2 font-medium";
const HEAD = "border-b border-border text-xs uppercase tracking-wider text-muted-foreground";
const ROW = "border-b border-border/60";
const NUM = "py-2 pl-3 text-right tabular-nums text-muted-foreground";
const TOT = "border-t-2 border-border font-semibold";

/** Admin editor: fix a client's share of one partner; the rest follows the automatic shares. */
function SplitEditor({
  split,
  clientsById,
  year,
  allOverrides,
  onClose,
}: {
  split: PartnerSplit;
  clientsById: Map<string, Client>;
  year: number;
  allOverrides: Record<string, Record<string, number>>;
  onClose: () => void;
}) {
  const { email } = useUserProfile();
  const initial = allOverrides[split.key] ?? {};
  const [draft, setDraft] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(initial).map(([k, v]) => [k, String(Math.round(v * 10000) / 100)]))
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const total = Object.values(draft).reduce((s, v) => s + (v.trim() === "" ? 0 : Number(v) || 0), 0);

  const save = async (values: Record<string, string>) => {
    setErr("");
    setSaving(true);
    try {
      const byClient: Record<string, number> = {};
      for (const [k, v] of Object.entries(values)) if (v.trim() !== "") byClient[k] = Number(v) / 100;
      await saveSplitOverrides(year, split.key, byClient, allOverrides, email || null);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 border border-gray-300 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-foreground">
          Client split — {split.partner} ({money(split.target)} target)
        </p>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Fixed shares: {total.toFixed(1)}%</span>
          <button type="button" onClick={() => save({})} disabled={saving} className="flex items-center gap-1 px-2 py-1 text-xs border border-gray-300 hover:bg-gray-100">
            <RotateCcw size={12} /> Back to automatic
          </button>
          <button type="button" onClick={() => save(draft)} disabled={saving} className="flex items-center gap-1 bg-yellow-400 px-2 py-1 text-xs font-medium text-gray-900 hover:bg-yellow-500">
            <Save size={12} /> Save
          </button>
          <button type="button" onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground" aria-label="Close">
            <X size={14} />
          </button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Type a % to fix a client&apos;s share. Clients left blank share the rest in proportion to their automatic basis.
      </p>
      {err && <p className="bg-red-500 px-3 py-2 text-xs text-white">{err}</p>}
      <div className="max-h-[420px] overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-card">
            <tr className={HEAD}>
              <th className={`${TH} pr-3 text-left`}>Client</th>
              <th className={`${TH} pl-3 text-right`}>Basis</th>
              <th className={`${TH} pl-3 text-right`}>Current share</th>
              <th className={`${TH} pl-3 text-right`}>Fixed share %</th>
              <th className={`${TH} pl-3 text-right`}>Target</th>
              <th className={`${TH} pl-3 text-right`}>Booked</th>
            </tr>
          </thead>
          <tbody>
            {split.clients.map((c) => (
              <tr key={c.clientId} className={ROW}>
                <td className="py-1.5 pr-3 text-left text-foreground">{clientsById.get(c.clientId)?.CL_Name ?? c.clientId}</td>
                <td className={NUM}>{money(c.basisAmount)}</td>
                <td className={NUM}>{pct(c.share, 1)}</td>
                <td className="py-1.5 pl-3 text-right">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    value={draft[c.clientId] ?? ""}
                    placeholder="auto"
                    onChange={(e) => setDraft((d) => ({ ...d, [c.clientId]: e.target.value }))}
                    className="w-20 border border-gray-300 px-2 py-1 text-right text-sm"
                  />
                </td>
                <td className={NUM}>{money(c.target)}</td>
                <td className={NUM}>{money(c.booked)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function PartnerTargetSplitSection({ scopedClientIds }: { scopedClientIds: string[] }) {
  const { selectedYear } = useForecastSelection();
  const { isAdmin } = useUserProfile();
  const { splits, round, clients, overrides, loading, error } = usePartnerTargetSplits(selectedYear);
  const [group, setGroup] = useState<GroupBy>("agencyRegion");
  const [partners, setPartners] = useState<string[]>([]);
  const [editing, setEditing] = useState<string | null>(null);

  const clientsById = useMemo(() => new Map(clients.map((c) => [c.cl_id, c])), [clients]);
  const scope = useMemo(() => new Set(scopedClientIds), [scopedClientIds]);
  const shown = useMemo(() => (partners.length ? splits.filter((s) => partners.includes(s.partner)) : splits), [splits, partners]);
  const rows = useMemo(
    () => rollupSplits(shown, (id) => labelFor(group, clientsById.get(id)), (id) => scope.has(id)),
    [shown, group, clientsById, scope]
  );
  const totals = useMemo(() => {
    const t = rows.reduce((a, r) => ({ target: a.target + r.target, booked: a.booked + r.booked }), { target: 0, booked: 0 });
    const unallocated = shown.reduce((s, p) => s + p.unallocated, 0);
    return { ...t, pace: t.target ? t.booked / t.target : null, unallocated };
  }, [rows, shown]);
  // No MIR bookings for the year yet (e.g. 2027 before its first MIR pull): show "—", not a red 0%.
  const noBookings = splits.reduce((s, p) => s + p.booked + p.bookedUnlinked, 0) < 1;
  const paceOf = (v: number | null) => (noBookings ? null : v);

  if (selectedYear == null) return null;
  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center gap-2 text-muted-foreground">
        <Loader2 size={18} className="animate-spin" /> <span className="text-sm">Splitting partner targets by client…</span>
      </div>
    );
  }
  if (error) return <div className="bg-red-500 px-4 py-3 text-sm text-white">Couldn&apos;t load the client targets: {error}</div>;
  if (splits.length === 0) {
    return (
      <div className="border border-dashed border-gray-300 px-4 py-6 text-sm text-muted-foreground">
        No Labs partner targets for {selectedYear} on the Deal Targets page yet.
      </div>
    );
  }

  const editSplit = splits.find((s) => s.key === editing) ?? null;
  const groupLabel = GROUPS.find((g) => g.id === group)!.label;

  return (
    <div data-scroll-section data-scroll-label="Targets by client" className="space-y-4">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <Target size={18} className="text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Targets by agency, region, GM pod, BL and client</h2>
          <span className="text-xs font-medium text-muted-foreground">
            · {selectedYear} · shares from {round ?? "—"}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Each Labs partner target (Deal Targets) is split across clients by their share of that partner in the {selectedYear}{" "}
          {round ?? ""} Labs forecast — the latest submitted round, updated automatically when the next round locks. Partners
          not in the Labs forecaster use each client&apos;s share of MIR booked spend ({selectedYear}, else {selectedYear - 1}).
          Admin-fixed shares win. Booked = MIR booked net (CAD). Shares are computed over all clients you can see (test clients
          left out); the table follows the dashboard filters.
        </p>
        {noBookings && (
          <p className="mt-1 text-xs font-semibold text-foreground">
            No {selectedYear} MIR bookings yet — targets are shown; booked and % of target fill in with the first {selectedYear} MIR pull.
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard icon={Target} label="Target (in filters)" value={money(totals.target)} />
        <StatCard icon={Target} label="Booked (MIR)" value={money(totals.booked)} />
        <StatCard icon={Target} label="% of target" value={pct(paceOf(totals.pace))} />
        <StatCard icon={Target} label="Not split to a client" value={money(totals.unallocated)} sub="Partners with no forecast or MIR basis" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex border border-gray-300">
          {GROUPS.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => setGroup(g.id)}
              className={`px-3 py-1.5 text-xs font-medium ${group === g.id ? "bg-gray-900 text-white" : "text-foreground hover:bg-gray-100"}`}
            >
              {g.label}
            </button>
          ))}
        </div>
        <MultiSelectDropdown
          label="Partner"
          options={splits.map((s) => ({ value: s.partner, label: s.partner }))}
          selectedValues={partners}
          onChange={setPartners}
        />
        <SheetExportButton
          title={`Partner targets by client ${selectedYear}`}
          buildTabs={() => [
            {
              sheetTitle: `By ${groupLabel}`.slice(0, 30),
              matrix: [[groupLabel, "Clients", "Target", "Booked (MIR)", "% of target"], ...rows.map((r) => [r.label, r.clients, Math.round(r.target), Math.round(r.booked), r.pace ?? ""])],
            },
            {
              sheetTitle: "Client x partner",
              matrix: [
                ["Partner", "Client", "Agency", "BU region", "GM pod", "Business lead", "Share", "Fixed by admin", "Target", "Booked (MIR)", "Basis"],
                ...shown.flatMap((s) =>
                  s.clients
                    .filter((c) => scope.has(c.clientId))
                    .map((c) => {
                      const cl = clientsById.get(c.clientId);
                      return [s.partner, cl?.CL_Name ?? c.clientId, cl?.CL_Agency ?? "", cl?.CL_Business_Unit_Region ?? "", cl?.GM_Pod ?? "", cl?.CL_Business_Lead ?? "", c.share, c.overridden ? "Yes" : "", Math.round(c.target), Math.round(c.booked), basisLabel(s.basis, selectedYear, round)];
                    })
                ),
              ],
            },
          ]}
        />
      </div>

      <ChartCard title={`Target vs booked by ${groupLabel.toLowerCase()}`} subtitle="% of target: green 90%+, yellow 70–89%, red below 70%" icon={Target}>
        <div className="max-h-[520px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card">
              <tr className={HEAD}>
                <th className={`${TH} pr-3 text-left`}>{groupLabel}</th>
                <th className={`${TH} pl-3 text-right`}>Clients</th>
                <th className={`${TH} pl-3 text-right`}>Target</th>
                <th className={`${TH} pl-3 text-right`}>Booked (MIR)</th>
                <th className={`${TH} pl-3 text-right`}>% of target</th>
                <th className={`${TH} pl-3 text-right`}>Left to book</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label} className={ROW}>
                  <td className="py-2 pr-3 text-left text-foreground">{r.label}</td>
                  <td className={NUM}>{r.clients}</td>
                  <td className={NUM}>{money(r.target)}</td>
                  <td className={NUM}>{money(r.booked)}</td>
                  <td className={`py-2 pl-3 text-right tabular-nums ${ragCell(ragFromPctOfTarget(paceOf(r.pace)))}`}>{pct(paceOf(r.pace))}</td>
                  <td className={NUM}>{money(Math.max(0, r.target - r.booked))}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className={TOT}>
                <td className="py-2 text-left" colSpan={2}>Total</td>
                <td className="py-2 pl-3 text-right tabular-nums">{money(totals.target)}</td>
                <td className="py-2 pl-3 text-right tabular-nums">{money(totals.booked)}</td>
                <td className={`py-2 pl-3 text-right tabular-nums ${ragCell(ragFromPctOfTarget(paceOf(totals.pace)))}`}>{pct(paceOf(totals.pace))}</td>
                <td className="py-2 pl-3 text-right tabular-nums">{money(Math.max(0, totals.target - totals.booked))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </ChartCard>

      <ChartCard title="How each partner target is split" subtitle="Whole partner target, before the dashboard filters" icon={Target}>
        <table className="w-full text-sm">
          <thead>
            <tr className={HEAD}>
              <th className={`${TH} pr-3 text-left`}>Partner</th>
              <th className={`${TH} pr-3 text-left`}>Deal type</th>
              <th className={`${TH} pl-3 text-right`}>Target</th>
              <th className={`${TH} pr-3 pl-3 text-left`}>Split by</th>
              <th className={`${TH} pl-3 text-right`}>Clients</th>
              <th className={`${TH} pl-3 text-right`}>Fixed by admin</th>
              <th className={`${TH} pl-3 text-right`}>Not split</th>
              <th className={`${TH} pl-3 text-right`}>Booked (MIR)</th>
              {isAdmin && <th className={`${TH} pl-3 text-right`} />}
            </tr>
          </thead>
          <tbody>
            {splits.map((s) => (
              <tr key={s.key} className={ROW}>
                <td className="py-2 pr-3 text-left text-foreground">{s.partner}</td>
                <td className="py-2 pr-3 text-left text-muted-foreground">{s.dealType}</td>
                <td className={NUM}>{money(s.target)}</td>
                <td className="py-2 pl-3 pr-3 text-left text-muted-foreground">{basisLabel(s.basis, selectedYear, round)}</td>
                <td className={NUM}>{s.clients.filter((c) => c.share > 0).length}</td>
                <td className={NUM}>{s.overrideTotal ? pct(s.overrideTotal, 1) : "—"}</td>
                <td className={NUM}>{s.unallocated >= 1 ? money(s.unallocated) : "—"}</td>
                <td className={NUM}>{money(s.booked)}</td>
                {isAdmin && (
                  <td className="py-2 pl-3 text-right">
                    <button type="button" onClick={() => setEditing(s.key)} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                      <Pencil size={12} /> Edit split
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {editSplit && isAdmin && (
          <div className="mt-4">
            <SplitEditor key={editSplit.key} split={editSplit} clientsById={clientsById} year={selectedYear} allOverrides={overrides} onClose={() => setEditing(null)} />
          </div>
        )}
      </ChartCard>
    </div>
  );
}
