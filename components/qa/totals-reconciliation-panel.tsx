// components/qa/totals-reconciliation-panel.tsx
"use client";

/**
 * Totals Reconciliation panel — the "Reconciliation" sub-tab of the admin QA
 * page. A leadership-facing attestation, not a violation report: it shows one
 * row per client (Revenue BL vs OF, Media, Labs, each with variance %), a grand
 * total, a green/red band summarizing the three integrity checks, and an
 * "Export to Sheets" that mirrors the table.
 *
 * The proof it stands on: there is no live Looker to diff against, so the
 * forecast page IS the source of truth. These figures come straight from the
 * dashboard's own data pipeline (useScopeForecastData), and the checks assert
 * the headline totals equal the sum of the per-client rows, each client's parts
 * add up, and every % is variance / base. Green ⇒ the dashboard is a faithful
 * roll-up of what BLs entered.
 */

import { useMemo } from "react";
import { CheckCircle2, XCircle, MinusCircle } from "lucide-react";
import ExportSheetButton from "../forecaster/table/export-sheet-button";
import type { TableColumn } from "../forecaster/table/table-column.types";
import { LoadingTab } from "../dashboard/tabs/tab-states";
import { formatMoney } from "../../lib/format/money";
import {
  computeReconciliation,
  type ReconRow,
  type ReconTotals,
  type ReconCheck,
} from "../../lib/dashboard/data/qa-reconcile";
import type { ScopeForecastData } from "../../lib/dashboard/data/use-scope-forecast-data";

/** "$1 234" ; 0 → "—" (mirrors the money helper used across the dashboard). */
function money(v: number): string {
  const s = formatMoney(v);
  return s === "—" ? s : `$${s}`;
}

/** Signed variance %, one decimal; null → "—". */
function pct(v: number | null): string {
  if (v === null) return "—";
  const sign = v >= 0 ? "+" : "−";
  return `${sign}${Math.abs(v).toFixed(1)}%`;
}

/**
 * Builds the column descriptors once, so the on-screen table and the Sheets
 * export render identically. `primaryLabel`/`comparisonLabel` name the two RFQ
 * sides in the headers (e.g. "RFQ3 · 2026").
 */
function buildColumns(
  primaryLabel: string,
  comparisonLabel: string
): TableColumn<ReconRow, ReconTotals>[] {
  const money$ =
    (raw: (r: ReconRow) => number, tot: (t: ReconTotals) => number, id: string, label: string, group: string): TableColumn<ReconRow, ReconTotals> => ({
      id,
      label,
      group,
      kind: "money",
      align: "right",
      raw: (r) => raw(r),
      display: (r) => money(raw(r)),
      total: (t) => money(tot(t)),
      totalRaw: (t) => tot(t),
    });
  const pctCol =
    (raw: (r: ReconRow) => number | null, tot: (t: ReconTotals) => number | null, id: string, label: string, group: string): TableColumn<ReconRow, ReconTotals> => ({
      id,
      label,
      group,
      kind: "percent",
      align: "right",
      raw: (r) => raw(r),
      display: (r) => pct(raw(r)),
      total: (t) => pct(tot(t)),
      totalRaw: (t) => tot(t),
    });

  return [
    {
      id: "client",
      label: "Client",
      group: "Client",
      kind: "text",
      align: "left",
      raw: (r) => r.name,
      display: (r) => r.name,
      // No `total` → the footer's first cell becomes the "Grand total" label.
    },
    money$((r) => r.revenuePrimary, (t) => t.revenuePrimary, "rev-p", `Revenue ${primaryLabel} · BL`, "Revenue"),
    money$((r) => r.revenueSecondary, (t) => t.revenueSecondary, "rev-s", `Revenue ${comparisonLabel} · OF`, "Revenue"),
    pctCol((r) => r.revenueVarPct, (t) => t.revenueVarPct, "rev-v", "Revenue Var %", "Revenue"),
    money$((r) => r.mediaPrimary, (t) => t.mediaPrimary, "med-p", `Media ${primaryLabel}`, "Media"),
    money$((r) => r.mediaSecondary, (t) => t.mediaSecondary, "med-s", `Media ${comparisonLabel}`, "Media"),
    pctCol((r) => r.mediaVarPct, (t) => t.mediaVarPct, "med-v", "Media Var %", "Media"),
    money$((r) => r.labsPrimary, (t) => t.labsPrimary, "lab-p", `Labs ${primaryLabel}`, "Labs"),
    money$((r) => r.labsSecondary, (t) => t.labsSecondary, "lab-s", `Labs ${comparisonLabel}`, "Labs"),
    pctCol((r) => r.labsVarPct, (t) => t.labsVarPct, "lab-v", "Labs Var %", "Labs"),
  ];
}

/** One check line under the band: icon + label + one-line detail (+ failures). */
function CheckLine({ check }: { check: ReconCheck }) {
  const Icon =
    check.status === "pass"
      ? CheckCircle2
      : check.status === "fail"
      ? XCircle
      : MinusCircle;
  const tone =
    check.status === "pass"
      ? "text-green-600"
      : check.status === "fail"
      ? "text-red-600"
      : "text-muted-foreground";

  return (
    <div className="flex items-start gap-2 py-1.5 text-sm">
      <Icon size={16} className={`mt-0.5 flex-shrink-0 ${tone}`} />
      <div className="min-w-0">
        <span className="font-medium text-foreground">{check.label}</span>
        <span className="text-muted-foreground"> — {check.detail}</span>
        {check.failures.length > 0 && (
          <ul className="mt-1 space-y-0.5 text-xs text-red-600">
            {check.failures.slice(0, 10).map((f) => (
              <li key={f.clientId}>
                {f.name}: {f.note}
              </li>
            ))}
            {check.failures.length > 10 && (
              <li className="text-muted-foreground">
                +{check.failures.length - 10} more
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function TotalsReconciliationPanel({
  primary,
  comparison,
  scopedClientIds,
  clientNameById,
  primaryLabel,
  comparisonLabel,
}: {
  /** Primary RFQ scope data (e.g. RFQ3). */
  primary: ScopeForecastData;
  /** Comparison RFQ scope data (e.g. RFQ2). */
  comparison: ScopeForecastData;
  scopedClientIds: string[];
  clientNameById: Record<string, string>;
  /** Header label for the primary side (e.g. "RFQ3 · 2026"). */
  primaryLabel: string;
  /** Header label for the comparison side (e.g. "RFQ2 · 2026"). */
  comparisonLabel: string;
}) {
  const recon = useMemo(
    () =>
      computeReconciliation(primary, comparison, scopedClientIds, clientNameById),
    [primary, comparison, scopedClientIds, clientNameById]
  );

  const columns = useMemo(
    () => buildColumns(primaryLabel, comparisonLabel),
    [primaryLabel, comparisonLabel]
  );

  // Display order: largest primary revenue first (stable, mirrors the dashboard).
  const sortedRows = useMemo(
    () => [...recon.rows].sort((a, b) => b.revenuePrimary - a.revenuePrimary),
    [recon.rows]
  );

  if (!primary.hasContext || !comparison.hasContext) {
    return (
      <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
        Pick a primary RFQ (top) and a comparison RFQ to reconcile.
      </div>
    );
  }

  if (primary.loading || comparison.loading) return <LoadingTab />;

  if (recon.rows.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
        No clients in scope for this selection.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Attestation band — mirrors the consistency-checks band. */}
      <div
        className={`flex items-center gap-3 border px-4 py-3 text-sm ${
          recon.allPass
            ? "border-green-500 bg-green-500 text-white"
            : "border-red-500 bg-red-500 text-white"
        }`}
      >
        {recon.allPass ? (
          <CheckCircle2 size={18} className="flex-shrink-0" />
        ) : (
          <XCircle size={18} className="flex-shrink-0" />
        )}
        <span className="font-medium">
          {recon.allPass
            ? "All reconciliation checks pass — every figure ties to the forecast entries."
            : "Reconciliation found a mismatch — see the checks below."}
        </span>
      </div>

      {/* The three integrity checks. */}
      <div className="border border-border bg-white px-4 py-3">
        {recon.checks.map((c) => (
          <CheckLine key={c.id} check={c} />
        ))}
      </div>

      {/* Per-client reconciliation table + export. */}
      <div className="border border-border bg-white">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              Totals reconciliation by client
            </h3>
            <p className="text-xs text-muted-foreground">
              {primaryLabel} vs {comparisonLabel} · all amounts CAD ·{" "}
              {sortedRows.length} clients · excludes test clients · scroll for all
            </p>
          </div>
          <ExportSheetButton
            columns={columns}
            rows={sortedRows}
            totals={recon.totals}
            title={`Totals Reconciliation — ${primaryLabel} vs ${comparisonLabel}`}
            sheetTitle="Reconciliation"
          />
        </div>

        <div className="max-h-[640px] overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wider text-muted-foreground">
                {columns.map((col) => (
                  <th
                    key={col.id}
                    className={`sticky top-0 z-10 whitespace-nowrap border-b border-border bg-white px-3 py-2 font-medium ${
                      col.align === "right" ? "text-right" : "text-left"
                    }`}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row) => (
                <tr key={row.clientId} className="border-b border-border/60">
                  {columns.map((col) => (
                    <td
                      key={col.id}
                      className={`whitespace-nowrap px-3 py-2 tabular-nums ${
                        col.align === "right"
                          ? "text-right text-muted-foreground"
                          : "text-left text-foreground"
                      }`}
                    >
                      {col.display(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold text-foreground">
                {columns.map((col, i) => (
                  <td
                    key={col.id}
                    className={`sticky bottom-0 z-10 whitespace-nowrap border-t-2 border-gray-900 bg-white px-3 py-2 tabular-nums ${
                      col.align === "right" ? "text-right" : "text-left"
                    }`}
                  >
                    {col.total ? col.total(recon.totals) : i === 0 ? "Grand total" : ""}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}