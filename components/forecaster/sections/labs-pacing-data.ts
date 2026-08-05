// components/forecaster/sections/labs-pacing-data.ts

/**
 * Shapes the Labs Pacing views from per partner × GM-pod cells
 * (useScopeLabsPacing):
 *   - the BY PARTNER table (Target/Booked/Variance/% per partner),
 *   - the % and $ variance bar datasets,
 *   - the BY GM POD summary table, and
 *   - the partner × GM-pod matrix (% of target booked per cell).
 * Mirrors the Looker pacing dashboard.
 */

import { formatMoney } from "../../../lib/format/money";
import type { CSSProperties } from "react";
import type { TableColumn } from "../table/table-column.types";
import type { BarItem } from "../../dashboard/charts/bar-list";
import type { LabsPacingCell, LabsPacingDetailCell } from "../../../lib/dashboard/data/use-scope-labs-pacing";
import type { LabsPartner } from "../../../lib/types/labs.types";
import type { Client } from "../../../lib/types/client.types";

// ─── Formatting helpers ──────────────────────────────────────────────────────

/** "-$288,370" / "$77,883" / "—" for zero. */
export const pacingMoney = (value: number): string => {
  const f = formatMoney(Math.abs(value));
  if (f === "—") return "—";
  return value < 0 ? `-$${f}` : `$${f}`;
};

export const pacingPercent = (value: number | null): string =>
  value === null ? "—" : `${Math.round(value)}%`;

const pct = (booked: number, target: number): number | null =>
  target > 0 ? (booked / target) * 100 : null;

// ─── BY PARTNER table ────────────────────────────────────────────────────────

export interface LabsPacingRow {
  partnerId: string;
  partnerName: string;
  target: number;
  booked: number;
  variance: number; // booked − target
  percentBooked: number | null; // booked / target × 100; null when target = 0
}

export interface LabsPacingTotals {
  target: number;
  booked: number;
  variance: number;
  percentBooked: number | null;
}

export type LabsPacingColumn = TableColumn<LabsPacingRow, LabsPacingTotals>;

export function computeLabsPacing(
  cells: LabsPacingCell[],
  partners: LabsPartner[]
): { rows: LabsPacingRow[]; totals: LabsPacingTotals } {
  const nameById = new Map(partners.map((p) => [p.partnerId, p.name]));

  const byPartner = new Map<string, { target: number; booked: number }>();
  for (const c of cells) {
    const cur = byPartner.get(c.partnerId) ?? { target: 0, booked: 0 };
    cur.target += c.target;
    cur.booked += c.booked;
    byPartner.set(c.partnerId, cur);
  }

  let totalTarget = 0;
  let totalBooked = 0;

  const rows: LabsPacingRow[] = [...byPartner.entries()]
    .map(([partnerId, v]) => {
      totalTarget += v.target;
      totalBooked += v.booked;
      return {
        partnerId,
        partnerName: nameById.get(partnerId) ?? partnerId,
        target: v.target,
        booked: v.booked,
        variance: v.booked - v.target,
        percentBooked: pct(v.booked, v.target),
      };
    })
    .sort((a, b) => b.target - a.target);

  const totals: LabsPacingTotals = {
    target: totalTarget,
    booked: totalBooked,
    variance: totalBooked - totalTarget,
    percentBooked: pct(totalBooked, totalTarget),
  };

  return { rows, totals };
}

/** Behind target (Booked < Target) reads red; ahead reads green. */
function varianceStyle(value: number): CSSProperties | undefined {
  if (value < 0) return { color: "#b91c1c" };
  if (value > 0) return { color: "#15803d" };
  return undefined;
}

export function buildLabsPacingColumns({
  targetLabel,
}: {
  targetLabel: string;
}): LabsPacingColumn[] {
  return [
    {
      id: "partner",
      label: "Partner",
      group: "Labs",
      kind: "text",
      align: "left",
      raw: (r) => r.partnerName,
      display: (r) => r.partnerName,
      total: () => "Grand total",
      totalRaw: () => "Grand total",
    },
    {
      id: "target",
      label: targetLabel,
      group: "Labs",
      kind: "money",
      align: "right",
      raw: (r) => r.target,
      display: (r) => pacingMoney(r.target),
      total: (t) => pacingMoney(t.target),
      totalRaw: (t) => t.target,
    },
    {
      id: "booked",
      label: "Booked (MIR)",
      group: "Labs",
      kind: "money",
      align: "right",
      raw: (r) => r.booked,
      display: (r) => pacingMoney(r.booked),
      total: (t) => pacingMoney(t.booked),
      totalRaw: (t) => t.booked,
    },
    {
      id: "variance",
      label: "$ Variance to Target",
      group: "Labs",
      kind: "money",
      align: "right",
      raw: (r) => r.variance,
      display: (r) => pacingMoney(r.variance),
      cellStyle: (r) => varianceStyle(r.variance),
      total: (t) => pacingMoney(t.variance),
      totalRaw: (t) => t.variance,
    },
    {
      id: "percent",
      label: "% of Target Booked",
      group: "Labs",
      kind: "percent",
      align: "right",
      raw: (r) => r.percentBooked,
      display: (r) => pacingPercent(r.percentBooked),
      total: (t) => pacingPercent(t.percentBooked),
      totalRaw: (t) => t.percentBooked,
    },
  ];
}

// ─── Chart datasets ──────────────────────────────────────────────────────────

/** % of target booked, one bar per partner (desc). */
export function percentBars(rows: LabsPacingRow[]): BarItem[] {
  return rows
    .filter((r) => r.percentBooked !== null)
    .map((r) => ({ label: r.partnerName, value: r.percentBooked as number }))
    .sort((a, b) => b.value - a.value);
}

/** $ variance to target, one bar per partner: magnitude with green (ahead) / red (behind). */
export function varianceBars(rows: LabsPacingRow[]): BarItem[] {
  return rows
    .map((r) => ({
      label: r.partnerName,
      value: Math.abs(r.variance),
      color: r.variance >= 0 ? "#15803d" : "#b91c1c",
    }))
    .sort((a, b) => b.value - a.value);
}

// ─── BY GM POD summary ───────────────────────────────────────────────────────

export interface GmPodRow {
  gmPod: string;
  target: number;
  booked: number;
  variance: number;
  percentBooked: number | null;
}

export function computeGmPodRows(
  cells: LabsPacingCell[]
): { rows: GmPodRow[]; totals: LabsPacingTotals } {
  const byPod = new Map<string, { target: number; booked: number }>();
  for (const c of cells) {
    const cur = byPod.get(c.gmPod) ?? { target: 0, booked: 0 };
    cur.target += c.target;
    cur.booked += c.booked;
    byPod.set(c.gmPod, cur);
  }

  let totalTarget = 0;
  let totalBooked = 0;

  const rows: GmPodRow[] = [...byPod.entries()]
    .map(([gmPod, v]) => {
      totalTarget += v.target;
      totalBooked += v.booked;
      return {
        gmPod,
        target: v.target,
        booked: v.booked,
        variance: v.booked - v.target,
        percentBooked: pct(v.booked, v.target),
      };
    })
    .sort((a, b) => b.target - a.target);

  const totals: LabsPacingTotals = {
    target: totalTarget,
    booked: totalBooked,
    variance: totalBooked - totalTarget,
    percentBooked: pct(totalBooked, totalTarget),
  };

  return { rows, totals };
}

// ─── BY GM POD matrix (partner × pod → % of target booked) ───────────────────

interface PodAgg {
  target: number;
  booked: number;
}

export interface MatrixRow {
  partnerId: string;
  partnerName: string;
  byPod: Record<string, number | null>; // pod → % booked
  total: number | null; // partner overall % booked
}

export interface GmPodMatrix {
  pods: string[]; // column order
  rows: MatrixRow[]; // partner rows (desc by partner target)
  colTotals: Record<string, number | null>; // pod → % booked
  grandTotal: number | null;
}

export function computeGmPodMatrix(
  cells: LabsPacingCell[],
  partners: LabsPartner[]
): GmPodMatrix {
  const nameById = new Map(partners.map((p) => [p.partnerId, p.name]));

  const pods = [...new Set(cells.map((c) => c.gmPod))].sort((a, b) =>
    a.localeCompare(b)
  );

  // partnerId → { pod → agg } and partnerId → overall agg
  const cellAgg = new Map<string, Map<string, PodAgg>>();
  const partnerTotal = new Map<string, PodAgg>();
  const colTotal = new Map<string, PodAgg>();
  const grand: PodAgg = { target: 0, booked: 0 };
  const partnerTargetForSort = new Map<string, number>();

  for (const c of cells) {
    const inner = cellAgg.get(c.partnerId) ?? new Map<string, PodAgg>();
    const cell = inner.get(c.gmPod) ?? { target: 0, booked: 0 };
    cell.target += c.target;
    cell.booked += c.booked;
    inner.set(c.gmPod, cell);
    cellAgg.set(c.partnerId, inner);

    const pt = partnerTotal.get(c.partnerId) ?? { target: 0, booked: 0 };
    pt.target += c.target;
    pt.booked += c.booked;
    partnerTotal.set(c.partnerId, pt);
    partnerTargetForSort.set(c.partnerId, pt.target);

    const ct = colTotal.get(c.gmPod) ?? { target: 0, booked: 0 };
    ct.target += c.target;
    ct.booked += c.booked;
    colTotal.set(c.gmPod, ct);

    grand.target += c.target;
    grand.booked += c.booked;
  }

  const rows: MatrixRow[] = [...cellAgg.entries()]
    .map(([partnerId, inner]) => {
      const byPod: Record<string, number | null> = {};
      for (const pod of pods) {
        const cell = inner.get(pod);
        byPod[pod] = cell ? pct(cell.booked, cell.target) : null;
      }
      const pt = partnerTotal.get(partnerId) ?? { target: 0, booked: 0 };
      return {
        partnerId,
        partnerName: nameById.get(partnerId) ?? partnerId,
        byPod,
        total: pct(pt.booked, pt.target),
      };
    })
    .sort(
      (a, b) =>
        (partnerTargetForSort.get(b.partnerId) ?? 0) -
        (partnerTargetForSort.get(a.partnerId) ?? 0)
    );

  const colTotals: Record<string, number | null> = {};
  for (const pod of pods) {
    const ct = colTotal.get(pod);
    colTotals[pod] = ct ? pct(ct.booked, ct.target) : null;
  }

  return {
    pods,
    rows,
    colTotals,
    grandTotal: pct(grand.booked, grand.target),
  };
}

/** Heat colour for a % of target booked cell (red < 80, amber < 100, green ≥ 100). */
export function pacingHeat(value: number | null): CSSProperties {
  if (value === null) return {};
  if (value >= 100) return { backgroundColor: "#dcfce7", color: "#14532d" };
  if (value >= 80) return { backgroundColor: "#fef9c3", color: "#713f12" };
  return { backgroundColor: "#fee2e2", color: "#7f1d1d" };
}
// ─── BY CLIENT detail table (with flag) ──────────────────────────────────────

export type PacingFlag = "Target Over-Achieved" | "Target Achieved" | "Under Target";

/** A miss smaller than this (in $) is immaterial → treated as Target Achieved. */
const MATERIAL_MISS = 50_000;

/**
 * Flag rules:
 *   - Over-Achieved: % > 100.
 *   - Achieved: 90–100%, or below 90% with a ≤ $50K miss (immaterial).
 *   - Under Target: below 90% AND a material miss (variance worse than −$50K).
 */
export function flagFor(percentBooked: number | null, variance: number): PacingFlag {
  if (percentBooked === null) {
    return variance > 0 ? "Target Over-Achieved" : "Target Achieved";
  }
  if (percentBooked > 100) return "Target Over-Achieved";
  if (percentBooked >= 90) return "Target Achieved";
  if (variance < 0 && Math.abs(variance) > MATERIAL_MISS) return "Under Target";
  return "Target Achieved";
}

export interface ClientPacingRow {
  key: string; // clientId:partnerId
  gmPod: string;
  agency: string;
  buRegion: string;
  businessLead: string;
  clientName: string;
  partnerName: string;
  target: number;
  booked: number;
  variance: number;
  percentBooked: number | null;
  flag: PacingFlag;
}

export interface ClientPacingTotals {
  target: number;
  booked: number;
  variance: number;
  percentBooked: number | null;
  flag: PacingFlag;
}

export type ClientPacingColumn = TableColumn<ClientPacingRow, ClientPacingTotals>;

export function computeClientPacing(
  detail: LabsPacingDetailCell[],
  clients: Client[],
  partners: LabsPartner[],
  usersMap: Map<string, string>
): { rows: ClientPacingRow[]; totals: ClientPacingTotals } {
  const clientById = new Map(clients.map((c) => [c.cl_id, c]));
  const partnerName = new Map(partners.map((p) => [p.partnerId, p.name]));

  let totalTarget = 0;
  let totalBooked = 0;

  const rows: ClientPacingRow[] = detail
    .map((d) => {
      const c = clientById.get(d.clientId);
      const variance = d.booked - d.target;
      const percentBooked = d.target > 0 ? (d.booked / d.target) * 100 : null;
      totalTarget += d.target;
      totalBooked += d.booked;
      return {
        key: `${d.clientId}:${d.partnerId}`,
        gmPod: c?.GM_Pod || "—",
        agency: c?.CL_Agency || "—",
        buRegion: c?.CL_Business_Unit_Region || "—",
        businessLead: c?.CL_Business_Lead
          ? usersMap.get(c.CL_Business_Lead) ?? c.CL_Business_Lead
          : "",
        clientName: c?.CL_Name ?? d.clientId,
        partnerName: partnerName.get(d.partnerId) ?? d.partnerId,
        target: d.target,
        booked: d.booked,
        variance,
        percentBooked,
        flag: flagFor(percentBooked, variance),
      };
    })
    .sort((a, b) => b.target - a.target);

  const variance = totalBooked - totalTarget;
  const percentBooked = totalTarget > 0 ? (totalBooked / totalTarget) * 100 : null;
  const totals: ClientPacingTotals = {
    target: totalTarget,
    booked: totalBooked,
    variance,
    percentBooked,
    flag: flagFor(percentBooked, variance),
  };

  return { rows, totals };
}

/** Flag text colour. */
export function flagStyle(flag: PacingFlag): CSSProperties {
  if (flag === "Under Target") return { color: "#b91c1c", fontWeight: 500 };
  if (flag === "Target Over-Achieved") return { color: "#15803d", fontWeight: 500 };
  return { color: "#374151" };
}

export function buildClientPacingColumns({
  targetLabel,
}: {
  targetLabel: string;
}): ClientPacingColumn[] {
  const text = (
    id: string,
    label: string,
    get: (r: ClientPacingRow) => string
  ): ClientPacingColumn => ({
    id,
    label,
    group: "Client",
    kind: "text",
    align: "left",
    raw: get,
    display: (r) => get(r) || "—",
  });

  return [
    {
      ...text("gm-pod", "GM Pod", (r) => r.gmPod),
      total: () => "Grand total",
      totalRaw: () => "Grand total",
    },
    text("agency", "Agency", (r) => r.agency),
    text("bu-region", "BU Region", (r) => r.buRegion),
    text("business-lead", "Business Lead", (r) => r.businessLead),
    text("client", "Client", (r) => r.clientName),
    text("partner", "Labs Partner", (r) => r.partnerName),
    {
      id: "target",
      label: targetLabel,
      group: "Pacing",
      kind: "money",
      align: "right",
      raw: (r) => r.target,
      display: (r) => pacingMoney(r.target),
      total: (t) => pacingMoney(t.target),
      totalRaw: (t) => t.target,
    },
    {
      id: "booked",
      label: "Booked (MIR)",
      group: "Pacing",
      kind: "money",
      align: "right",
      raw: (r) => r.booked,
      display: (r) => pacingMoney(r.booked),
      total: (t) => pacingMoney(t.booked),
      totalRaw: (t) => t.booked,
    },
    {
      id: "variance",
      label: "$ Variance",
      group: "Pacing",
      kind: "money",
      align: "right",
      raw: (r) => r.variance,
      display: (r) => pacingMoney(r.variance),
      total: (t) => pacingMoney(t.variance),
      totalRaw: (t) => t.variance,
    },
    {
      id: "percent",
      label: "% Booked",
      group: "Pacing",
      kind: "percent",
      align: "right",
      raw: (r) => r.percentBooked,
      display: (r) => pacingPercent(r.percentBooked),
      total: (t) => pacingPercent(t.percentBooked),
      totalRaw: (t) => t.percentBooked,
    },
    {
      id: "flag",
      label: "Flag",
      group: "Pacing",
      kind: "text",
      align: "left",
      raw: (r) => r.flag,
      display: (r) => r.flag,
      cellStyle: (r) => flagStyle(r.flag),
      total: (t) => t.flag,
      totalRaw: (t) => t.flag,
    },
  ];
}