// components/forecaster/sections/partner-target-split-section.tsx
"use client";

/**
 * "Partner targets by agency" (Exec KPI → Deal Pacing and the Deal Targets page).
 * Each Labs partner target (Deal Targets) is split across clients
 * (lib/format/partner-target-split.ts) and shown as a partner × agency-column
 * matrix (lib/format/agency-groups.ts: CM ROC, MEK ROC, CM MTL/QC, Jungle QC;
 * Showroom ON / MEK USA behind "Show all agencies"): each cell = the agency's %
 * of the partner, its $ target and MIR booked. Two tabs: Forecaster partners
 * (shares from a Labs forecast round, latest submitted by default) and All
 * partners (shares from MIR booked). Click a cell → that agency's clients.
 * GM pod / BL / client roll-ups, the per-partner split and the admin
 * overrides (partner_target_splits/{year}) sit behind "More breakdowns".
 */

import { useMemo, useState } from "react";
import { Loader2, Target, Pencil, X, Save, RotateCcw } from "lucide-react";
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
import { AGENCY_GROUPS, agencyGroupOf } from "../../../lib/format/agency-groups";

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
  if (b === "forecast") return `${round ?? ""} Labs forecast`;
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


type Tab = "forecast" | "mir";

/** One partner × agency-column cell. */
interface Cell {
  share: number;
  target: number;
  booked: number;
}

export default function PartnerTargetSplitSection({
  scopedClientIds,
  year,
}: {
  /** Dashboard filter scope; omitted (Deal Targets page) = every client. */
  scopedClientIds?: string[];
  /** Year shown; omitted = the dashboard's global Year. */
  year?: number | null;
}) {
  const { selectedYear: globalYear } = useForecastSelection();
  const selectedYear = year !== undefined ? year : globalYear;
  const { isAdmin } = useUserProfile();
  const [tab, setTab] = useState<Tab>("forecast");
  const [pickedRound, setPickedRound] = useState<string | null>(null);
  const { splits, round, roundId, defaultRoundId, roundOptions, forecastEmpty, clients, overrides, loading, error } =
    usePartnerTargetSplits(selectedYear, { mode: tab, round: pickedRound });
  const [showAll, setShowAll] = useState(false);
  const [selected, setSelected] = useState<{ partner: string; group: string } | null>(null);
  const [group, setGroup] = useState<GroupBy>("client");
  const [editing, setEditing] = useState<string | null>(null);

  const clientsById = useMemo(() => new Map(clients.map((c) => [c.cl_id, c])), [clients]);
  const scope = useMemo(() => new Set(scopedClientIds ?? clients.map((c) => c.cl_id)), [scopedClientIds, clients]);
  const groupOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of clients) m.set(c.cl_id, agencyGroupOf(c.CL_Agency, c.CL_Business_Unit_Region));
    return (id: string) => m.get(id) ?? "other";
  }, [clients]);

  // Partner × agency-column cells (clients in the dashboard filters only).
  const matrix = useMemo(() => {
    const rows = splits.map((s) => {
      const cells = new Map<string, Cell>();
      for (const c of s.clients) {
        if (!scope.has(c.clientId)) continue;
        const g = groupOf(c.clientId);
        const cell = cells.get(g) ?? { share: 0, target: 0, booked: 0 };
        cell.share += c.share;
        cell.target += c.target;
        cell.booked += c.booked;
        cells.set(g, cell);
      }
      return { split: s, cells };
    });
    const used = new Set(rows.flatMap((r) => [...r.cells.keys()]));
    const columns = AGENCY_GROUPS.filter((g) => (showAll ? used.has(g.id) || !g.hidden : !g.hidden));
    return { rows, columns };
  }, [splits, scope, groupOf, showAll]);

  const noBookings = splits.reduce((s, p) => s + p.booked + p.bookedUnlinked, 0) < 1;

  if (selectedYear == null) return null;
  if (error) return <div className="bg-red-500 px-4 py-3 text-sm text-white">Couldn&apos;t load the client targets: {error}</div>;

  const editSplit = splits.find((s) => s.key === editing) ?? null;
  const selectedSplit = selected ? splits.find((s) => s.partner === selected.partner) ?? null : null;
  const selectedClients = selectedSplit
    ? selectedSplit.clients
        .filter((c) => scope.has(c.clientId) && groupOf(c.clientId) === selected!.group && (c.share > 0 || c.booked !== 0))
        .sort((a, b) => b.target - a.target || b.booked - a.booked)
    : [];
  const groupLabel = (id: string) => AGENCY_GROUPS.find((g) => g.id === id)?.label ?? id;
  const sourceNote =
    tab === "forecast"
      ? `% = the agency's clients' share of each partner in the ${round ?? ""} Labs forecast${roundId === defaultRoundId ? " (latest submitted round)" : ""}.`
      : `% = the agency's clients' share of each partner's MIR booked spend in ${selectedYear} (${selectedYear - 1} when ${selectedYear} has none yet).`;

  return (
    <div data-scroll-section data-scroll-label="Targets by agency" className="space-y-4">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <Target size={18} className="text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Partner targets by agency</h2>
          <span className="text-xs font-medium text-muted-foreground">· {selectedYear}</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          How much of each partner&apos;s target each agency has to spend. Click a cell to see that agency&apos;s clients.
        </p>
      </div>

      {/* Tab + round */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex border border-gray-300">
          {(
            [
              ["forecast", "Forecaster partners"],
              ["mir", "All partners (MIR)"],
            ] as [Tab, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setTab(id);
                setSelected(null);
              }}
              className={`px-3 py-1.5 text-xs font-medium ${tab === id ? "bg-gray-900 text-white" : "text-foreground hover:bg-gray-100"}`}
            >
              {label}
            </button>
          ))}
        </div>
        {tab === "forecast" && roundOptions.length > 0 && (
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            Round
            <select
              value={roundId ?? ""}
              onChange={(e) => setPickedRound(e.target.value)}
              className="border border-gray-300 bg-white px-2 py-1 text-xs text-foreground"
            >
              {roundOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                  {o.id === defaultRoundId ? " — latest submitted" : ""}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Show all agencies
        </label>
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center gap-2 text-muted-foreground">
          <Loader2 size={18} className="animate-spin" /> <span className="text-sm">Splitting partner targets…</span>
        </div>
      ) : splits.length === 0 ? (
        <div className="border border-dashed border-gray-300 px-4 py-6 text-sm text-muted-foreground">
          No {tab === "forecast" ? "Labs Forecaster " : ""}partner targets for {selectedYear} on the Deal Targets page yet.
        </div>
      ) : tab === "forecast" && forecastEmpty ? (
        <div className="border border-dashed border-gray-300 px-4 py-6 text-sm text-foreground">
          No Labs forecast has been entered in <span className="font-semibold">{round}</span> yet, so there&apos;s nothing to split.
          Pick another round above.
        </div>
      ) : (
        <>
          {/* Partner × agency matrix */}
          <div className="overflow-x-auto border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className={HEAD}>
                  <th className={`${TH} px-3 text-left`}>Partner</th>
                  <th className={`${TH} px-3 text-right`}>Target</th>
                  {matrix.columns.map((g) => (
                    <th key={g.id} className={`${TH} px-3 text-right`}>
                      {g.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrix.rows.map(({ split, cells }) => (
                  <tr key={split.key} className={ROW}>
                    <td className="px-3 py-2 text-left font-medium text-foreground">{split.partner}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-foreground">{money(split.target)}</td>
                    {matrix.columns.map((g) => {
                      const cell = cells.get(g.id);
                      const isSel = selected?.partner === split.partner && selected.group === g.id;
                      if (!cell || (cell.share < 0.0005 && Math.round(cell.booked) === 0)) {
                        return (
                          <td key={g.id} className="px-3 py-2 text-right text-muted-foreground">
                            —
                          </td>
                        );
                      }
                      const pace = cell.target > 0 && !noBookings ? cell.booked / cell.target : null;
                      return (
                        <td
                          key={g.id}
                          onClick={() => setSelected(isSel ? null : { partner: split.partner, group: g.id })}
                          className={`cursor-pointer px-3 py-2 text-right align-top hover:bg-gray-50 ${isSel ? "bg-yellow-400" : ""}`}
                        >
                          <div className="text-base font-semibold tabular-nums text-foreground">{pct(cell.share)}</div>
                          <div className="text-[11px] tabular-nums text-muted-foreground">{money(cell.target)} target</div>
                          {!noBookings && (
                            <div className={`text-[11px] tabular-nums ${ragCell(ragFromPctOfTarget(pace))}`}>{money(cell.booked)} booked</div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ol className="list-decimal space-y-0.5 pl-5 text-xs text-muted-foreground">
            <li>
              <span className="font-medium text-foreground">%</span>: {sourceNote.replace(/^% = /, "")}{" "}
              {tab === "forecast"
                ? "Each client's share = its forecast with that partner ÷ all clients' forecast with that partner."
                : "Each client's share = what it booked with that partner ÷ what all clients booked with that partner (Mediaocean, table PCC_Dashboard_NATIVE)."}{" "}
              An agency&apos;s % = the sum of its clients&apos; shares.
            </li>
            <li>
              <span className="font-medium text-foreground">Target</span> = the partner&apos;s target (Deal Targets page) × the agency&apos;s %.
            </li>
            <li>
              <span className="font-medium text-foreground">Booked</span>:{" "}
              {noBookings
                ? `no ${selectedYear} Mediaocean bookings yet — it appears with the first ${selectedYear} MIR pull.`
                : `Mediaocean booked net (CAD) for ${selectedYear}; green = 90%+ of the agency's target, yellow 70–89%, red below 70%.`}
            </li>
            <li>
              <span className="font-medium text-foreground">Who&apos;s included</span>: clients active in {selectedYear} (Lost / Inactive
              clients, test and hidden clients are left out — their share goes to the others). Agency columns use each client&apos;s
              agency + BU region on the Clients page: CM ROC = Cossette Media Ontario + West, CM MTL/QC = Cossette Media QC/East, MEK ROC =
              Mekanism Ontario + West, Jungle QC = Jungle QC/East (Showroom and Mekanism USA under &ldquo;Show all agencies&rdquo;).
            </li>
            {tab === "mir" && (
              <li>
                <span className="font-medium text-foreground">Thin data</span>: partners with few Mediaocean lines (Media Pulse, Magnite,
                Trader Interactive, Index) can land 100% on one agency — read those with care.
              </li>
            )}
            <li>
              <span className="font-medium text-foreground">Fixed shares</span>: an admin can fix a client&apos;s % per partner (Edit
              split, below); it applies in both tabs and the rest is spread over the other clients.
            </li>
          </ol>

          {/* Drill-down: the clients behind one cell */}
          {selected && selectedSplit && (
            <ChartCard
              title={`${selectedSplit.partner} — ${groupLabel(selected.group)} clients`}
              subtitle={`Each client's share of the ${money(selectedSplit.target)} ${selectedSplit.partner} target`}
              icon={Target}
              action={
                <button type="button" onClick={() => setSelected(null)} className="p-1 text-muted-foreground hover:text-foreground" aria-label="Close">
                  <X size={14} />
                </button>
              }
            >
              <table className="w-full text-sm">
                <thead>
                  <tr className={HEAD}>
                    <th className={`${TH} pr-3 text-left`}>Client</th>
                    <th className={`${TH} pl-3 text-right`}>Share</th>
                    <th className={`${TH} pl-3 text-right`}>Target</th>
                    {!noBookings && <th className={`${TH} pl-3 text-right`}>Booked</th>}
                    {!noBookings && <th className={`${TH} pl-3 text-right`}>% of target</th>}
                  </tr>
                </thead>
                <tbody>
                  {selectedClients.map((c) => {
                    const pace = c.target > 0 ? c.booked / c.target : null;
                    return (
                      <tr key={c.clientId} className={ROW}>
                        <td className="py-2 pr-3 text-left text-foreground">
                          {clientsById.get(c.clientId)?.CL_Name ?? c.clientId}
                          {c.overridden && <span className="ml-1 text-[11px] text-muted-foreground">(fixed by admin)</span>}
                        </td>
                        <td className={NUM}>{pct(c.share, 1)}</td>
                        <td className={NUM}>{money(c.target)}</td>
                        {!noBookings && <td className={NUM}>{money(c.booked)}</td>}
                        {!noBookings && (
                          <td className={`py-2 pl-3 text-right tabular-nums ${ragCell(ragFromPctOfTarget(pace))}`}>{pct(pace)}</td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {selectedClients.length === 0 && <p className="py-3 text-sm text-muted-foreground">No clients with a share here.</p>}
            </ChartCard>
          )}

          {/* Secondary: other roll-ups, the split per partner (admin edit), export */}
          <details className="border border-border bg-card p-4">
            <summary className="cursor-pointer text-sm font-semibold text-foreground">Client breakdown (client × partner), GM pod, business lead and split settings</summary>
            <div className="mt-4 space-y-4">
              <MoreBreakdowns
                splits={splits}
                group={group}
                setGroup={setGroup}
                clientsById={clientsById}
                scope={scope}
                noBookings={noBookings}
                year={selectedYear}
                round={round}
              />
              <table className="w-full text-sm">
                <thead>
                  <tr className={HEAD}>
                    <th className={`${TH} pr-3 text-left`}>Partner</th>
                    <th className={`${TH} pl-3 text-right`}>Target</th>
                    <th className={`${TH} pl-3 pr-3 text-left`}>Split by</th>
                    <th className={`${TH} pl-3 text-right`}>Clients</th>
                    <th className={`${TH} pl-3 text-right`}>Fixed by admin</th>
                    <th className={`${TH} pl-3 text-right`}>Not split</th>
                    {isAdmin && <th className={`${TH} pl-3 text-right`} />}
                  </tr>
                </thead>
                <tbody>
                  {splits.map((s) => (
                    <tr key={s.key} className={ROW}>
                      <td className="py-2 pr-3 text-left text-foreground">{s.partner}</td>
                      <td className={NUM}>{money(s.target)}</td>
                      <td className="py-2 pl-3 pr-3 text-left text-muted-foreground">{basisLabel(s.basis, selectedYear, round)}</td>
                      <td className={NUM}>{s.clients.filter((c) => c.share > 0).length}</td>
                      <td className={NUM}>{s.overrideTotal ? pct(s.overrideTotal, 1) : "—"}</td>
                      <td className={NUM}>{s.unallocated >= 1 ? money(s.unallocated) : "—"}</td>
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
                <SplitEditor key={editSplit.key} split={editSplit} clientsById={clientsById} year={selectedYear} allOverrides={overrides} onClose={() => setEditing(null)} />
              )}
            </div>
          </details>
        </>
      )}
    </div>
  );
}

/** GM pod / business lead / client roll-up with export (kept behind "More breakdowns"). */
function MoreBreakdowns({
  splits,
  group,
  setGroup,
  clientsById,
  scope,
  noBookings,
  year,
  round,
}: {
  splits: PartnerSplit[];
  group: GroupBy;
  setGroup: (g: GroupBy) => void;
  clientsById: Map<string, Client>;
  scope: ReadonlySet<string>;
  noBookings: boolean;
  year: number;
  round: string | null;
}) {
  const [partners, setPartners] = useState<string[]>([]);
  const shown = partners.length ? splits.filter((s) => partners.includes(s.partner)) : splits;
  const rows = rollupSplits(shown, (id) => labelFor(group, clientsById.get(id)), (id) => scope.has(id));
  const groupLabel = GROUPS.find((g) => g.id === group)!.label;
  const totals = rows.reduce((a, r) => ({ target: a.target + r.target, booked: a.booked + r.booked }), { target: 0, booked: 0 });
  const paceOf = (target: number, booked: number) => (noBookings || !target ? null : booked / target);
  // Client view (the investments team's sheet): one row per client × partner.
  const clientLines = shown
    .flatMap((s) => s.clients.filter((c) => scope.has(c.clientId) && (c.share > 0 || Math.round(c.booked) !== 0)).map((c) => ({ s, c })))
    .sort((a, b) => a.s.partner.localeCompare(b.s.partner) || b.c.share - a.c.share);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex border border-gray-300">
          {(["client", "gmPod", "bl"] as GroupBy[]).map((id) => GROUPS.find((g) => g.id === id)!).map((g) => (
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
        <MultiSelectDropdown label="Partner" options={splits.map((s) => ({ value: s.partner, label: s.partner }))} selectedValues={partners} onChange={setPartners} />
        <SheetExportButton
          title={`Partner targets by client ${year}`}
          buildTabs={() => [
            {
              sheetTitle: "Client x partner",
              matrix: [
                ["Partner", "Client", "Agency", "BU region", "GM pod", "Business lead", "Share", "Fixed by admin", "Target", "Booked (MIR)", "Basis"],
                ...shown.flatMap((s) =>
                  s.clients
                    .filter((c) => scope.has(c.clientId))
                    .map((c) => {
                      const cl = clientsById.get(c.clientId);
                      return [s.partner, cl?.CL_Name ?? c.clientId, cl?.CL_Agency ?? "", cl?.CL_Business_Unit_Region ?? "", cl?.GM_Pod ?? "", cl?.CL_Business_Lead ?? "", c.share, c.overridden ? "Yes" : "", Math.round(c.target), Math.round(c.booked), basisLabel(s.basis, year, round)];
                    })
                ),
              ],
            },
          ]}
        />
      </div>
      {group === "client" ? (
        <div className="max-h-[480px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card">
              <tr className={HEAD}>
                {["Client", "Based on", "Partner", "% share of partner", "Target", "Booked (MIR)", "BU region", "Business lead", "Agency", "GM pod"].map((h, i) => (
                  <th key={h} className={`${TH} ${i >= 3 && i <= 5 ? "pl-3 text-right" : "pl-3 pr-3 text-left"}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {clientLines.map(({ s, c }) => {
                const cl = clientsById.get(c.clientId);
                return (
                  <tr key={`${s.key}|${c.clientId}`} className={ROW}>
                    <td className="py-2 pl-3 pr-3 text-left text-foreground">
                      {cl?.CL_Name ?? c.clientId}
                      {c.overridden && <span className="ml-1 text-[11px] text-muted-foreground">(fixed)</span>}
                    </td>
                    <td className="py-2 pl-3 pr-3 text-left text-xs text-muted-foreground">{basisLabel(s.basis, year, round)}</td>
                    <td className="py-2 pl-3 pr-3 text-left text-foreground">{s.partner}</td>
                    <td className="py-2 pl-3 text-right font-semibold tabular-nums text-foreground">{pct(c.share, 1)}</td>
                    <td className={NUM}>{money(c.target)}</td>
                    <td className={NUM}>{noBookings ? "—" : money(c.booked)}</td>
                    <td className="py-2 pl-3 pr-3 text-left text-muted-foreground">{cl?.CL_Business_Unit_Region || "—"}</td>
                    <td className="py-2 pl-3 pr-3 text-left text-muted-foreground">{blName(cl?.CL_Business_Lead)}</td>
                    <td className="py-2 pl-3 pr-3 text-left text-muted-foreground">{cl?.CL_Agency || "—"}</td>
                    <td className="py-2 pl-3 pr-3 text-left text-muted-foreground">{cl?.GM_Pod || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {clientLines.length === 0 && <p className="py-3 text-sm text-muted-foreground">No client shares to show.</p>}
          <p className="mt-2 text-xs text-muted-foreground">
            % share of partner = the client&apos;s share of that partner&apos;s whole target (all agencies together); Target = partner
            target × that %. &ldquo;Based on&rdquo; = where the % comes from (a forecast round, or Mediaocean bookings). (fixed) = set by
            an admin.
          </p>
        </div>
      ) : (
      <div className="max-h-[420px] overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-card">
            <tr className={HEAD}>
              <th className={`${TH} pr-3 text-left`}>{groupLabel}</th>
              <th className={`${TH} pl-3 text-right`}>Target</th>
              <th className={`${TH} pl-3 text-right`}>Booked (MIR)</th>
              <th className={`${TH} pl-3 text-right`}>% of target</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className={ROW}>
                <td className="py-2 pr-3 text-left text-foreground">{r.label}</td>
                <td className={NUM}>{money(r.target)}</td>
                <td className={NUM}>{noBookings ? "—" : money(r.booked)}</td>
                <td className={`py-2 pl-3 text-right tabular-nums ${ragCell(ragFromPctOfTarget(paceOf(r.target, r.booked)))}`}>{pct(paceOf(r.target, r.booked))}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className={TOT}>
              <td className="py-2 text-left">Total</td>
              <td className="py-2 pl-3 text-right tabular-nums">{money(totals.target)}</td>
              <td className="py-2 pl-3 text-right tabular-nums">{noBookings ? "—" : money(totals.booked)}</td>
              <td className={`py-2 pl-3 text-right tabular-nums ${ragCell(ragFromPctOfTarget(paceOf(totals.target, totals.booked)))}`}>
                {pct(paceOf(totals.target, totals.booked))}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      )}
    </div>
  );
}
