// components/forecaster/sections/client-detail-table.tsx
"use client";

/**
 * Per-client detail table with a Media / Labs toggle. Frozen dimension columns,
 * horizontal metric scroll, sticky header + Grand-total row. Restyled to
 * Tristan's card surface and color tokens. Digital Share carries Adriana's
 * conditional banding. Variance columns show values only when a variant is set.
 */

import { useMemo, useState } from "react";
import {
  computeClientTable,
  CHANNEL_ORDER,
  PARTNER_COLS,
  type ClientTableRow,
} from "./client-table-data";
import { formatMoney } from "../../../lib/format/money";
import { useForecastSelection } from "../../../lib/stores/forecast-selection.store";
import { useUsersMap } from "../../../lib/hooks/use-users-map";
import { useAccessibleClients } from "../../../lib/hooks/use-accessible-clients";
import type { ScopeForecastData } from "../../../lib/dashboard/data/use-scope-forecast-data";

type View = "media" | "labs";

const money = (v: number) => {
  const s = formatMoney(v);
  return s === "—" ? s : `$${s}`;
};
const pctVal = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(1)}%`);
const ratio = (a: number, b: number): number | null => (b > 0 ? a / b : null);

function shareBg(v: number | null): string {
  if (v === null) return "";
  if (v >= 0.65) return "bg-green-100 text-green-800";
  if (v > 0.5) return "bg-yellow-100 text-yellow-800";
  return "bg-red-100 text-red-800";
}

const DIMS = [
  { label: "Client", w: 180 },
  { label: "Tier", w: 70 },
  { label: "Business Lead", w: 200 },
  { label: "Agency", w: 120 },
  { label: "BU Region", w: 90 },
  { label: "Status", w: 100 },
  { label: "Notes", w: 160 },
];
const OFFSETS = DIMS.reduce<number[]>((acc, _d, i) => {
  acc.push(i === 0 ? 0 : acc[i - 1] + DIMS[i - 1].w);
  return acc;
}, []);

type MetricCell = string | { share: number | null };

export default function ClientDetailTable({
  data,
  comparisonData,
}: {
  data: ScopeForecastData;
  comparisonData: ScopeForecastData;
}) {
  const [view, setView] = useState<View>("media");
  const hasComparison = comparisonData.hasContext;
  const { selectedYear } = useForecastSelection();
  const usersMap = useUsersMap();
  const { clients } = useAccessibleClients();

  const rows = useMemo(
    () => computeClientTable(data, comparisonData, clients, usersMap, selectedYear ?? new Date().getFullYear()),
    [data, comparisonData, clients, usersMap, selectedYear]
  );

  const totals = useMemo(() => {
    const t = {
      totalMedia: 0, totalMediaVar: 0, digitalMedia: 0, digitalMediaVar: 0,
      traditionalMedia: 0, traditionalMediaVar: 0, oohMedia: 0, printMedia: 0,
      billupsOoh: 0, billupsPrint: 0,
      channels: Object.fromEntries(CHANNEL_ORDER.map((l) => [l, 0])) as Record<string, number>,
      totalLabs: 0, labsVar: 0,
      partners: Object.fromEntries(PARTNER_COLS.map((p) => [p.label, { primary: 0, variance: 0 }])) as Record<string, { primary: number; variance: number }>,
    };
    for (const r of rows) {
      t.totalMedia += r.totalMedia; t.totalMediaVar += r.totalMediaVar;
      t.digitalMedia += r.digitalMedia; t.digitalMediaVar += r.digitalMediaVar;
      t.traditionalMedia += r.traditionalMedia; t.traditionalMediaVar += r.traditionalMediaVar;
      t.oohMedia += r.oohMedia; t.printMedia += r.printMedia;
      t.billupsOoh += r.billupsOohSpend; t.billupsPrint += r.billupsPrintSpend;
      for (const c of r.channels) t.channels[c.label] += c.value;
      t.totalLabs += r.totalLabs; t.labsVar += r.labsVar;
      for (const p of r.partners) {
        t.partners[p.label].primary += p.primary;
        t.partners[p.label].variance += p.variance;
      }
    }
    return t;
  }, [rows]);

  const varMoney = (v: number) => (hasComparison ? money(v) : "—");

  if (rows.length === 0) return null;

  const mediaCols = [
    "Total Media", "Total Media Var $", "Total Digital Media", "Total Digital Media Var $",
    "Total Traditional Media", "Total Traditional Media Var $", "Digital Share", ...CHANNEL_ORDER,
  ];
  const labsCols = [
    "TOTAL-LABS", "LABS Var $", "LABS Share of Total Media", "Billups Share of Print", "Billups Share of OOH",
    ...PARTNER_COLS.flatMap((p) => [p.label, `${p.label} Var $`]),
  ];
  const metricCols = view === "media" ? mediaCols : labsCols;

  const mediaCells = (r: ClientTableRow): MetricCell[] => [
    money(r.totalMedia), varMoney(r.totalMediaVar), money(r.digitalMedia), varMoney(r.digitalMediaVar),
    money(r.traditionalMedia), varMoney(r.traditionalMediaVar),
    { share: r.digitalShare }, ...r.channels.map((c) => money(c.value)),
  ];
  const labsCells = (r: ClientTableRow): MetricCell[] => [
    money(r.totalLabs), varMoney(r.labsVar), pctVal(r.labsShareTotalMedia),
    pctVal(r.billupsShareOfPrint), pctVal(r.billupsShareOfOoh),
    ...r.partners.flatMap((p) => [money(p.primary), varMoney(p.variance)]),
  ];

  const mediaTotalCells: MetricCell[] = [
    money(totals.totalMedia), varMoney(totals.totalMediaVar), money(totals.digitalMedia), varMoney(totals.digitalMediaVar),
    money(totals.traditionalMedia), varMoney(totals.traditionalMediaVar),
    { share: ratio(totals.digitalMedia, totals.totalMedia) },
    ...CHANNEL_ORDER.map((l) => money(totals.channels[l])),
  ];
  const labsTotalCells: MetricCell[] = [
    money(totals.totalLabs), varMoney(totals.labsVar),
    pctVal(ratio(totals.totalLabs, totals.totalMedia)),
    pctVal(ratio(totals.billupsPrint, totals.printMedia)),
    pctVal(ratio(totals.billupsOoh, totals.oohMedia)),
    ...PARTNER_COLS.flatMap((p) => [money(totals.partners[p.label].primary), varMoney(totals.partners[p.label].variance)]),
  ];
  const totalCells = view === "media" ? mediaTotalCells : labsTotalCells;

  const stickyStyle = (i: number) => ({ left: OFFSETS[i], minWidth: DIMS[i].w, maxWidth: DIMS[i].w });

  const renderMetric = (c: MetricCell, i: number) =>
    typeof c === "object" ? (
      <td key={i} className="px-1 py-1 text-right">
        <span className={`inline-block w-full rounded px-2 py-1 tabular-nums ${shareBg(c.share)}`}>
          {pctVal(c.share)}
        </span>
      </td>
    ) : (
      <td key={i} className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-foreground">
        {c}
      </td>
    );

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-foreground">Client detail</h2>
        <div className="inline-flex overflow-hidden rounded-lg border border-border text-sm">
          {(["media", "labs"] as View[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-4 py-1.5 font-medium capitalize transition-colors ${
                view === v ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      <div className="max-h-[520px] overflow-auto rounded-xl border border-border bg-card shadow-sm">
        <table className="border-collapse text-sm">
          <thead className="sticky top-0 z-20">
            <tr className="border-b border-border bg-muted text-xs uppercase tracking-wider text-muted-foreground">
              {DIMS.map((d, i) => (
                <th key={d.label} className="sticky z-30 whitespace-nowrap bg-muted px-3 py-2 text-left font-medium" style={stickyStyle(i)}>
                  {d.label}
                </th>
              ))}
              {metricCols.map((c) => (
                <th key={c} className="whitespace-nowrap px-3 py-2 text-right font-medium">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const dims = [r.name, r.tier, r.businessLead, r.agency, r.region, r.status, r.notes];
              const cells = view === "media" ? mediaCells(r) : labsCells(r);
              return (
                <tr key={r.clientId} className="border-b border-border/60">
                  {dims.map((d, i) => (
                    <td
                      key={i}
                      title={d || undefined}
                      className="sticky z-10 overflow-hidden text-ellipsis whitespace-nowrap bg-card px-3 py-2 text-left text-foreground"
                      style={stickyStyle(i)}
                    >
                      {d || "—"}
                    </td>
                  ))}
                  {cells.map(renderMetric)}
                </tr>
              );
            })}
          </tbody>
          <tfoot className="sticky bottom-0 z-20">
            <tr className="border-t-2 border-border bg-muted font-semibold text-foreground">
              <td className="sticky z-30 whitespace-nowrap bg-muted px-3 py-2 text-left" style={stickyStyle(0)}>Grand total</td>
              {DIMS.slice(1).map((d, i) => (
                <td key={d.label} className="sticky z-30 bg-muted" style={stickyStyle(i + 1)} />
              ))}
              {totalCells.map(renderMetric)}
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}