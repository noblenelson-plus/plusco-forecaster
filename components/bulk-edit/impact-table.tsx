// components/bulk-edit/impact-table.tsx
"use client";

/**
 * Dollar impact of a bulk import: for every section it replaces, the Jan–Dec
 * total before vs after, per client, in the client's forecast currency. Line
 * counts can't reveal a wrong column or currency; "$120k → $1.2M" does. Rows
 * worth a second look (new, cleared, or ±25%+) are flagged and listed first.
 */

import { useMemo, useState } from "react";
import type { AxisId } from "../../lib/types/forecaster.types";
import { formatMoney, formatSigned } from "../../lib/format/money";
import {
  IMPACT_BIG_CHANGE,
  type ImpactFlag,
  type ImpactRow,
} from "../../lib/services/bulk-import-service";

const AXIS_LABELS: Record<AxisId, string> = {
  media: "Media",
  labs: "Labs",
  revenue: "Revenue",
};

const FLAG_LABELS: Record<ImpactFlag, string> = {
  new: "New",
  cleared: "Cleared",
  big: `±${Math.round(IMPACT_BIG_CHANGE * 100)}%+`,
};

const FLAG_CLASSES: Record<ImpactFlag, string> = {
  new: "bg-blue-200 text-gray-900",
  cleared: "bg-red-500 text-white",
  big: "bg-yellow-400 text-gray-900",
};

function sectionLabel(r: ImpactRow): string {
  const side =
    r.section === "BL" ? "BL" : r.axisId === "revenue" ? "GAIA" : "MediaOcean";
  return `${AXIS_LABELS[r.axisId]} ${side} · ${r.year}${r.rfq ? ` ${r.rfq}` : ""}`;
}

const money = (v: number) => (Math.round(v) === 0 ? "0" : formatMoney(v));

export default function ImpactTable({ rows }: { rows: ImpactRow[] }) {
  const flagged = rows.filter((r) => r.flag).length;
  const [onlyFlagged, setOnlyFlagged] = useState(false);

  // Totals per currency — a quick sanity check against the source report.
  const totals = useMemo(() => {
    const byCur = new Map<string, { before: number; after: number }>();
    for (const r of rows) {
      const t = byCur.get(r.currency || "—") ?? { before: 0, after: 0 };
      t.before += r.before;
      t.after += r.after;
      byCur.set(r.currency || "—", t);
    }
    return [...byCur.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [rows]);

  const sorted = useMemo(() => {
    const list = onlyFlagged ? rows.filter((r) => r.flag) : rows;
    return [...list].sort(
      (a, b) =>
        Number(!!b.flag) - Number(!!a.flag) ||
        Math.abs(b.after - b.before) - Math.abs(a.after - a.before) ||
        a.clientName.localeCompare(b.clientName)
    );
  }, [rows, onlyFlagged]);

  if (rows.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Dollar impact · {rows.length} section{rows.length !== 1 ? "s" : ""}
        </p>
        {flagged > 0 && (
          <button
            type="button"
            onClick={() => setOnlyFlagged((v) => !v)}
            className={`px-2.5 py-1 text-xs font-medium border rounded-lg transition-colors ${
              onlyFlagged
                ? "bg-yellow-400 border-yellow-400 text-gray-900"
                : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            {onlyFlagged ? "Show all" : `Only flagged (${flagged})`}
          </button>
        )}
      </div>

      {/* Currency totals */}
      <div className="flex flex-wrap gap-2">
        {totals.map(([cur, t]) => (
          <div key={cur} className="border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs text-gray-700">
            <span className="font-semibold">{cur}</span> {money(t.before)} →{" "}
            <span className="font-semibold">{money(t.after)}</span>{" "}
            <span className="text-gray-500">({formatSigned(t.after - t.before)})</span>
          </div>
        ))}
      </div>

      <div className="max-h-64 overflow-y-auto border border-gray-200">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-gray-900 text-white">
            <tr>
              <th className="text-left font-semibold px-3 py-2">Client</th>
              <th className="text-left font-semibold px-3 py-2">Section</th>
              <th className="text-right font-semibold px-3 py-2">Before</th>
              <th className="text-right font-semibold px-3 py-2">After</th>
              <th className="text-right font-semibold px-3 py-2">Change</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => (
              <tr key={i} className="border-t border-gray-100">
                <td className="px-3 py-1.5 text-gray-900">
                  {r.clientName}
                  {r.currency && <span className="ml-1 text-gray-400">{r.currency}</span>}
                </td>
                <td className="px-3 py-1.5 text-gray-600 whitespace-nowrap">{sectionLabel(r)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-gray-600">{money(r.before)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-gray-900 font-medium">{money(r.after)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap">
                  {r.flag && (
                    <span className={`mr-1.5 px-1.5 py-0.5 text-[10px] font-semibold ${FLAG_CLASSES[r.flag]}`}>
                      {FLAG_LABELS[r.flag]}
                    </span>
                  )}
                  <span className="text-gray-700">
                    {Math.round(r.after - r.before) === 0 ? "—" : formatSigned(r.after - r.before)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-gray-400">
        Jan–Dec totals per section, in each client&apos;s forecast currency. The BL
        Revenue Commission is left out — it is recalculated from Media after the import.
      </p>
    </div>
  );
}
