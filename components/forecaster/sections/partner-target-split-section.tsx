// components/forecaster/sections/partner-target-split-section.tsx
"use client";

/**
 * "Partner targets by agency" (Exec KPI → Deal Pacing, Investments → PCC Deals
 * and the Deal Targets page). Each partner target (Deal Targets) is split
 * across clients (lib/format/partner-target-split.ts) and shown in two steps:
 *
 *  1. Partner × agency matrix (lib/format/agency-groups.ts: CM ROC, MEK ROC,
 *     CM MTL/QC, Jungle QC; Showroom ON / MEK USA behind "Show all agencies"):
 *     each cell = the agency's % of the partner, its $ target and MIR booked.
 *  2. Client breakdown: pick a partner → every client's % and $ target, grouped
 *     by agency (default), GM pod or business lead, with subtotals. Clicking a
 *     matrix cell picks that partner and jumps to the agency's group.
 *
 * Two tabs: Forecaster partners (shares from a Labs forecast round, latest
 * submitted by default) and All partners (shares from last year's full MIR).
 * Filters (agency, BU region, GM pod, business lead) apply to both steps; the
 * % stays out of the partner's whole target. Admins adjust fixed shares
 * (partner_target_splits/{year}) under "Adjust splits", hidden for others.
 */

import { useMemo, useState } from "react";
import { Loader2, Target, Pencil, X, Save, RotateCcw, Users } from "lucide-react";
import SheetExportButton from "../../dashboard/sheet-export-button";
import MultiSelectDropdown from "../../_shared/multi-select-dropdown";
import { useForecastSelection } from "../../../lib/stores/forecast-selection.store";
import { useUserProfile } from "../../../lib/hooks/use-user-profile";
import { usePartnerTargetSplits } from "../../../lib/dashboard/data/use-partner-target-splits";
import { saveSplitOverrides } from "../../../lib/services/partner-target-split-service";
import type { PartnerSplit, SplitBasis } from "../../../lib/format/partner-target-split";
import { ragFromPctOfTarget, ragCell } from "./exec-rag";
import type { Client } from "../../../lib/types/client.types";
import { AGENCY_GROUPS, agencyGroupOf } from "../../../lib/format/agency-groups";

const money = (v: number) => `${v < 0 ? "−" : ""}$${Math.abs(Math.round(v)).toLocaleString("en-CA")}`;
const pct = (v: number | null, d = 0) => (v == null || !Number.isFinite(v) ? "—" : `${(v * 100).toFixed(d)}%`);

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

function basisLabel(b: SplitBasis, year: number, round: string | null, mirSource?: string | null) {
  if (b === "forecast") return `${round ?? ""} Labs forecast`;
  if (b === "mir") return `MIR booked ${year}`;
  if (b === "mir-previous") return `MIR ${year - 1} full year${mirSource ? ` (${mirSource})` : ""}`;
  if (b === "ssp") return "SSP — spend runs through the DSPs, not split (admin can set shares)";
  return "No basis — not split";
}

const TH = "py-2 font-medium";
const HEAD = "border-b border-border text-xs uppercase tracking-wider text-muted-foreground";
const ROW = "border-b border-border/60";
const NUM = "py-2 pl-3 text-right tabular-nums text-muted-foreground";

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
type ListBy = "agency" | "gmPod" | "bl";
const LIST_BY: { id: ListBy; label: string }[] = [
  { id: "agency", label: "Agency" },
  { id: "gmPod", label: "GM pod" },
  { id: "bl", label: "Business lead" },
];

/** One partner × agency-column cell. */
interface Cell {
  share: number;
  target: number;
  booked: number;
}

interface Filters {
  agencies: string[];
  regions: string[];
  gmPods: string[];
  bls: string[];
}
const NO_FILTERS: Filters = { agencies: [], regions: [], gmPods: [], bls: [] };

const groupLabel = (id: string) => AGENCY_GROUPS.find((g) => g.id === id)?.label ?? id;
const groupDomId = (id: string) => `pts-group-${id.replace(/[^a-z0-9]+/gi, "-")}`;

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
  const { splits, round, roundId, defaultRoundId, roundOptions, forecastEmpty, mirSource, clients, overrides, loading, error } =
    usePartnerTargetSplits(selectedYear, { mode: tab, round: pickedRound });
  const [showAll, setShowAll] = useState(false);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [pickedPartner, setPickedPartner] = useState<string | null>(null);
  const [focusGroup, setFocusGroup] = useState<string | null>(null);
  const [listBy, setListBy] = useState<ListBy>("agency");
  const [editing, setEditing] = useState<string | null>(null);

  const clientsById = useMemo(() => new Map(clients.map((c) => [c.cl_id, c])), [clients]);
  const groupOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of clients) m.set(c.cl_id, agencyGroupOf(c.CL_Agency, c.CL_Business_Unit_Region));
    return (id: string) => m.get(id) ?? "other";
  }, [clients]);

  // Clients in the dashboard filters (if any) and the section's own filters.
  const base = useMemo(() => (scopedClientIds ? clients.filter((c) => scopedClientIds.includes(c.cl_id)) : clients), [scopedClientIds, clients]);
  const scope = useMemo(() => {
    const ok = (list: string[], v: string) => list.length === 0 || list.includes(v);
    return new Set(
      base
        .filter(
          (c) =>
            ok(filters.agencies, c.CL_Agency || "") &&
            ok(filters.regions, c.CL_Business_Unit_Region || "") &&
            ok(filters.gmPods, c.GM_Pod || "") &&
            ok(filters.bls, c.CL_Business_Lead || "")
        )
        .map((c) => c.cl_id)
    );
  }, [base, filters]);
  const filterOptions = useMemo(() => {
    const opts = (vals: (string | undefined)[], label: (v: string) => string = (v) => v) =>
      [...new Set(vals.map((v) => v || "").filter(Boolean))].sort((a, b) => label(a).localeCompare(label(b))).map((v) => ({ value: v, label: label(v) }));
    return {
      agencies: opts(base.map((c) => c.CL_Agency)),
      regions: opts(base.map((c) => c.CL_Business_Unit_Region)),
      gmPods: opts(base.map((c) => c.GM_Pod)),
      bls: opts(base.map((c) => c.CL_Business_Lead), blName),
    };
  }, [base]);
  const filtered = Object.values(filters).some((l) => l.length > 0);

  // Partner × agency-column cells (clients in scope only).
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
  const partnerSplit = splits.find((s) => s.partner === pickedPartner) ?? splits[0] ?? null;
  const shownGroups = new Set(matrix.columns.map((g) => g.id));
  const sourceText =
    tab === "forecast"
      ? `the ${round ?? ""} Labs forecast${roundId === defaultRoundId ? " (latest submitted round)" : ""}`
      : `${mirSource ?? "the latest MIR"} — Mediaocean bookings for the full year ${selectedYear - 1}`;

  const pickCell = (partner: string, group: string) => {
    setPickedPartner(partner);
    setListBy("agency");
    setFocusGroup(group);
    setTimeout(() => document.getElementById(groupDomId(group))?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  return (
    <div data-scroll-section data-scroll-label="Targets by agency" className="space-y-4">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <Target size={18} className="text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Partner targets by agency</h2>
          <span className="text-xs font-medium text-muted-foreground">· {selectedYear}</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          How much of each partner&apos;s target each agency has to spend. Click a cell to see that agency&apos;s clients below.
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
                setFocusGroup(null);
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

      {/* Filters (both tables) */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Filter</span>
        <MultiSelectDropdown label="Agency" options={filterOptions.agencies} selectedValues={filters.agencies} onChange={(v) => setFilters((f) => ({ ...f, agencies: v }))} />
        <MultiSelectDropdown label="BU region" options={filterOptions.regions} selectedValues={filters.regions} onChange={(v) => setFilters((f) => ({ ...f, regions: v }))} />
        <MultiSelectDropdown label="GM pod" options={filterOptions.gmPods} selectedValues={filters.gmPods} onChange={(v) => setFilters((f) => ({ ...f, gmPods: v }))} searchable />
        <MultiSelectDropdown label="Business lead" options={filterOptions.bls} selectedValues={filters.bls} onChange={(v) => setFilters((f) => ({ ...f, bls: v }))} searchable />
        {filtered && (
          <button type="button" onClick={() => setFilters(NO_FILTERS)} className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground">
            <X size={12} /> Clear filters
          </button>
        )}
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
          {/* 1. Partner × agency matrix */}
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
                    <td className="px-3 py-2 text-right tabular-nums text-foreground">{split.target > 0 ? money(split.target) : <span className="text-xs text-muted-foreground">no target</span>}</td>
                    {matrix.columns.map((g) => {
                      const cell = cells.get(g.id);
                      const isSel = partnerSplit?.partner === split.partner && focusGroup === g.id;
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
                          onClick={() => pickCell(split.partner, g.id)}
                          title={`See ${g.label}'s clients for ${split.partner}`}
                          className={`cursor-pointer px-3 py-2 text-right align-top hover:bg-gray-50 ${isSel ? "bg-yellow-400" : ""}`}
                        >
                          <div className="text-base font-semibold tabular-nums text-foreground">{pct(cell.share)}</div>
                          {split.target > 0 && <div className="text-[11px] tabular-nums text-muted-foreground">{money(cell.target)} target</div>}
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

          {/* 2. Client breakdown of one partner */}
          {partnerSplit && (
            <ClientBreakdown
              split={partnerSplit}
              partners={splits}
              onPickPartner={(p) => {
                setPickedPartner(p);
                setFocusGroup(null);
              }}
              listBy={listBy}
              setListBy={setListBy}
              focusGroup={focusGroup}
              clientsById={clientsById}
              inScope={(id) => scope.has(id)}
              groupOf={groupOf}
              shownGroups={shownGroups}
              noBookings={noBookings}
              exportTabs={() => [
                {
                  sheetTitle: "Client x partner",
                  matrix: [
                    ["Client", "Based on", "Partner", "% share of partner", "Target", "Booked (MIR)", "BU region", "Business lead", "Agency", "Agency column", "GM pod", "Fixed by admin"],
                    ...splits.flatMap((s) =>
                      s.clients
                        .filter((c) => scope.has(c.clientId) && (c.share > 0 || Math.round(c.booked) !== 0))
                        .map((c) => {
                          const cl = clientsById.get(c.clientId);
                          return [
                            cl?.CL_Name ?? c.clientId,
                            basisLabel(s.basis, selectedYear, round, mirSource),
                            s.partner,
                            c.share,
                            Math.round(c.target),
                            Math.round(c.booked),
                            cl?.CL_Business_Unit_Region ?? "",
                            blName(cl?.CL_Business_Lead),
                            cl?.CL_Agency ?? "",
                            groupLabel(groupOf(c.clientId)),
                            cl?.GM_Pod ?? "",
                            c.overridden ? "Yes" : "",
                          ];
                        })
                    ),
                  ],
                },
              ]}
              exportTitle={`Partner targets by client ${selectedYear}`}
            />
          )}

          {/* Footnotes */}
          <ol className="list-decimal space-y-0.5 pl-5 text-xs text-muted-foreground">
            <li>
              <span className="font-medium text-foreground">% and Target</span>: each client&apos;s share of a partner in {sourceText}
              {tab === "forecast"
                ? " (its forecast with that partner ÷ all clients' forecast with that partner)"
                : ` (what it booked with that partner in ${selectedYear - 1} ÷ what all clients booked with it; the full previous year is used so the split doesn't move as ${selectedYear} bookings come in)`}
              . Target = the partner&apos;s target on the Deal Targets page × that %. An agency, GM pod or business lead = the sum of its clients.
            </li>
            <li>
              <span className="font-medium text-foreground">Booked</span>:{" "}
              {noBookings
                ? `no ${selectedYear} Mediaocean bookings yet — it appears with the first ${selectedYear} MIR pull.`
                : `Mediaocean booked net (CAD) for ${selectedYear}; green = 90%+ of target, yellow 70–89%, red below 70%.`}
            </li>
            <li>
              <span className="font-medium text-foreground">Who&apos;s included</span>: clients active in {selectedYear} (Lost / Inactive,
              test and hidden clients are left out — their share goes to the others). CM ROC = Cossette Media Ontario + West, CM MTL/QC =
              Cossette Media QC/East, MEK ROC = Mekanism Ontario + West, Jungle QC = Jungle QC/East; Showroom and Mekanism USA under
              &ldquo;Show all agencies&rdquo;.
              {filtered && " Filters keep only the matching clients; the % is still out of the partner's whole target, so a column no longer adds to 100%."}
            </li>
            {tab === "mir" && (
              <li>
                <span className="font-medium text-foreground">Volume partners</span> (Google, Bell Media, CBS, Pelmorex…) have no $ target, so
                they show the % only. Google = Google Ads + DV360; CBS = Canadian Broadcast Sales. Partners with few Mediaocean lines (Media
                Pulse, Magnite, Trader Interactive, Index) can land 100% on one agency — read those with care.
              </li>
            )}
          </ol>

          {/* Admin only: how each partner is split + fixed shares */}
          {isAdmin && (
            <details className="border border-border bg-card p-4">
              <summary className="cursor-pointer text-sm font-semibold text-foreground">Adjust splits (admins only)</summary>
              <div className="mt-4 space-y-4">
                <p className="text-xs text-muted-foreground">
                  Where each partner&apos;s split comes from. &ldquo;Edit split&rdquo; fixes a client&apos;s %; it applies in both tabs and the
                  rest is spread over the other clients.
                </p>
                <table className="w-full text-sm">
                  <thead>
                    <tr className={HEAD}>
                      <th className={`${TH} pr-3 text-left`}>Partner</th>
                      <th className={`${TH} pl-3 text-right`}>Target</th>
                      <th className={`${TH} pl-3 pr-3 text-left`}>Split by</th>
                      <th className={`${TH} pl-3 text-right`}>Clients</th>
                      <th className={`${TH} pl-3 text-right`}>Fixed by admin</th>
                      <th className={`${TH} pl-3 text-right`}>Not split</th>
                      <th className={`${TH} pl-3 text-right`} />
                    </tr>
                  </thead>
                  <tbody>
                    {splits.map((s) => (
                      <tr key={s.key} className={ROW}>
                        <td className="py-2 pr-3 text-left text-foreground">{s.partner}</td>
                        <td className={NUM}>{money(s.target)}</td>
                        <td className="py-2 pl-3 pr-3 text-left text-muted-foreground">{basisLabel(s.basis, selectedYear, round, mirSource)}</td>
                        <td className={NUM}>{s.clients.filter((c) => c.share > 0).length}</td>
                        <td className={NUM}>{s.overrideTotal ? pct(s.overrideTotal, 1) : "—"}</td>
                        <td className={NUM}>{s.unallocated >= 1 ? money(s.unallocated) : "—"}</td>
                        <td className="py-2 pl-3 text-right">
                          <button type="button" onClick={() => setEditing(s.key)} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                            <Pencil size={12} /> Edit split
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {editSplit && (
                  <SplitEditor key={editSplit.key} split={editSplit} clientsById={clientsById} year={selectedYear} allOverrides={overrides} onClose={() => setEditing(null)} />
                )}
              </div>
            </details>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Step 2: one partner's target broken down by client, grouped by agency column
 * (default), GM pod or business lead, with a subtotal per group.
 */
function ClientBreakdown({
  split,
  partners,
  onPickPartner,
  listBy,
  setListBy,
  focusGroup,
  clientsById,
  inScope,
  groupOf,
  shownGroups,
  noBookings,
  exportTabs,
  exportTitle,
}: {
  split: PartnerSplit;
  partners: PartnerSplit[];
  onPickPartner: (p: string) => void;
  listBy: ListBy;
  setListBy: (l: ListBy) => void;
  focusGroup: string | null;
  clientsById: Map<string, Client>;
  inScope: (id: string) => boolean;
  groupOf: (id: string) => string;
  shownGroups: ReadonlySet<string>;
  noBookings: boolean;
  exportTabs: () => { sheetTitle: string; matrix: (string | number)[][] }[];
  exportTitle: string;
}) {
  const lines = split.clients.filter(
    (c) => inScope(c.clientId) && (c.share > 0 || Math.round(c.booked) !== 0) && (listBy !== "agency" || shownGroups.has(groupOf(c.clientId)))
  );
  const keyOf = (id: string) => {
    const cl = clientsById.get(id);
    if (listBy === "agency") return groupOf(id);
    if (listBy === "gmPod") return cl?.GM_Pod || "No GM pod";
    return blName(cl?.CL_Business_Lead);
  };
  const byGroup = new Map<string, typeof lines>();
  for (const c of lines) {
    const k = keyOf(c.clientId);
    byGroup.set(k, [...(byGroup.get(k) ?? []), c]);
  }
  const sum = (ls: typeof lines) => ls.reduce((a, c) => ({ share: a.share + c.share, target: a.target + c.target, booked: a.booked + c.booked }), { share: 0, target: 0, booked: 0 });
  const groups = [...byGroup.entries()]
    .map(([k, ls]) => ({ key: k, label: listBy === "agency" ? groupLabel(k) : k, lines: [...ls].sort((a, b) => b.share - a.share || b.booked - a.booked), total: sum(ls) }))
    .sort((a, b) =>
      listBy === "agency"
        ? AGENCY_GROUPS.findIndex((g) => g.id === a.key) - AGENCY_GROUPS.findIndex((g) => g.id === b.key)
        : b.total.share - a.total.share
    );
  const total = sum(lines);
  const hasTarget = split.target > 0;
  const showBooked = !noBookings;
  const pace = (t: number, b: number) => (showBooked && t > 0 ? b / t : null);
  const cols = 5 + (hasTarget ? 1 : 0) + (showBooked ? 2 : 0);

  return (
    <div className="space-y-3 border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <Users size={16} className="text-primary" />
            <h3 className="text-base font-semibold text-foreground">Client breakdown</h3>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">Pick a partner: each client&apos;s share of its target, grouped by {LIST_BY.find((l) => l.id === listBy)!.label.toLowerCase()}.</p>
        </div>
        <SheetExportButton title={exportTitle} buildTabs={exportTabs} />
      </div>

      {/* Partner picker */}
      <div className="flex flex-wrap gap-1.5">
        {partners.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => onPickPartner(p.partner)}
            className={`border px-2.5 py-1 text-xs font-medium ${p.key === split.key ? "border-gray-900 bg-gray-900 text-white" : "border-gray-300 text-foreground hover:bg-gray-100"}`}
          >
            {p.partner}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <p className="text-sm text-foreground">
          <span className="font-semibold">{split.partner}</span>
          {hasTarget ? <> · {money(split.target)} target</> : <span className="text-muted-foreground"> · no $ target (% only)</span>}
          <span className="text-muted-foreground"> · {lines.length} clients</span>
        </p>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          Group by
          <div className="flex border border-gray-300">
            {LIST_BY.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => setListBy(l.id)}
                className={`px-2.5 py-1 text-xs font-medium ${listBy === l.id ? "bg-gray-900 text-white" : "text-foreground hover:bg-gray-100"}`}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {lines.length === 0 ? (
        <p className="py-3 text-sm text-muted-foreground">No clients with a share of {split.partner} in these filters.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className={HEAD}>
                <th className={`${TH} pr-3 text-left`}>Client</th>
                <th className={`${TH} pl-3 text-right`}>% of {split.partner}</th>
                {hasTarget && <th className={`${TH} pl-3 text-right`}>Target</th>}
                {showBooked && <th className={`${TH} pl-3 text-right`}>Booked</th>}
                {showBooked && <th className={`${TH} pl-3 text-right`}>% of target</th>}
                <th className={`${TH} pl-4 text-left`}>BU region</th>
                <th className={`${TH} pl-3 text-left`}>Business lead</th>
                <th className={`${TH} pl-3 text-left`}>{listBy === "gmPod" ? "Agency" : "GM pod"}</th>
              </tr>
            </thead>
            {groups.map((g) => (
              <tbody key={g.key} id={listBy === "agency" ? groupDomId(g.key) : undefined} className="scroll-mt-24">
                <tr className={`border-t-2 border-gray-900 ${listBy === "agency" && focusGroup === g.key ? "bg-yellow-400" : ""}`}>
                  <td className="py-2 pr-3 text-left font-semibold text-foreground">
                    {g.label} <span className="text-xs font-normal text-muted-foreground">· {g.lines.length} client{g.lines.length === 1 ? "" : "s"}</span>
                  </td>
                  <td className="py-2 pl-3 text-right font-semibold tabular-nums text-foreground">{pct(g.total.share, 1)}</td>
                  {hasTarget && <td className="py-2 pl-3 text-right font-semibold tabular-nums text-foreground">{money(g.total.target)}</td>}
                  {showBooked && <td className="py-2 pl-3 text-right font-semibold tabular-nums text-foreground">{money(g.total.booked)}</td>}
                  {showBooked && (
                    <td className={`py-2 pl-3 text-right font-semibold tabular-nums ${ragCell(ragFromPctOfTarget(pace(g.total.target, g.total.booked)))}`}>
                      {pct(pace(g.total.target, g.total.booked))}
                    </td>
                  )}
                  <td colSpan={3} />
                </tr>
                {g.lines.map((c) => {
                  const cl = clientsById.get(c.clientId);
                  return (
                    <tr key={c.clientId} className={ROW}>
                      <td className="py-1.5 pl-4 pr-3 text-left text-foreground">
                        {cl?.CL_Name ?? c.clientId}
                        {c.overridden && <span className="ml-1 text-[11px] text-muted-foreground">(fixed by admin)</span>}
                      </td>
                      <td className="py-1.5 pl-3 text-right tabular-nums text-foreground">{pct(c.share, 1)}</td>
                      {hasTarget && <td className="py-1.5 pl-3 text-right tabular-nums text-muted-foreground">{money(c.target)}</td>}
                      {showBooked && <td className="py-1.5 pl-3 text-right tabular-nums text-muted-foreground">{money(c.booked)}</td>}
                      {showBooked && (
                        <td className={`py-1.5 pl-3 text-right tabular-nums ${ragCell(ragFromPctOfTarget(pace(c.target, c.booked)))}`}>{pct(pace(c.target, c.booked))}</td>
                      )}
                      <td className="py-1.5 pl-4 text-left text-muted-foreground">{cl?.CL_Business_Unit_Region || "—"}</td>
                      <td className="py-1.5 pl-3 text-left text-muted-foreground">{blName(cl?.CL_Business_Lead)}</td>
                      <td className="py-1.5 pl-3 text-left text-muted-foreground">{(listBy === "gmPod" ? cl?.CL_Agency : cl?.GM_Pod) || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            ))}
            <tfoot>
              <tr className="border-t-2 border-gray-900 font-semibold">
                <td className="py-2 pr-3 text-left">Total</td>
                <td className="py-2 pl-3 text-right tabular-nums">{pct(total.share, 1)}</td>
                {hasTarget && <td className="py-2 pl-3 text-right tabular-nums">{money(total.target)}</td>}
                {showBooked && <td className="py-2 pl-3 text-right tabular-nums">{money(total.booked)}</td>}
                {showBooked && <td className={`py-2 pl-3 text-right tabular-nums ${ragCell(ragFromPctOfTarget(pace(total.target, total.booked)))}`}>{pct(pace(total.target, total.booked))}</td>}
                <td colSpan={cols - 2 - (hasTarget ? 1 : 0) - (showBooked ? 2 : 0)} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
