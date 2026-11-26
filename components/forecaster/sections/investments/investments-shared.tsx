// components/forecaster/sections/investments/investments-shared.tsx
"use client";

/**
 * Shared bits of the Exec KPI investments pages (Media YOY, PCC Deals,
 * Broadcast): formatting, the page heading with its source note, loading /
 * error states, and the three table shapes (simple list, YoY, pivot). Same table
 * styling as the Media Investments and Local Media pages.
 */

import type { ReactNode } from "react";
import { Loader2, type LucideIcon } from "lucide-react";
import type { Matrix, YoyLine } from "../../../../lib/format/investment-deals";

// Sign from the rounded value, so tiny amounts read "$0" / "0.0%" rather than "−$0" / "+0.0%".
export const money = (v: number) => {
  const r = Math.round(v);
  return `${r < 0 ? "−" : ""}$${Math.abs(r).toLocaleString("en-CA")}`;
};
export const pct = (v: number | null, digits = 1) => {
  if (v === null || !Number.isFinite(v)) return "—";
  const s = Math.abs(v * 100).toFixed(digits);
  const zero = Number(s) === 0;
  return `${zero ? "" : v > 0 ? "+" : "−"}${s}%`;
};
export const change = (cur: number, prev: number) => (prev ? (cur - prev) / Math.abs(prev) : null);

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function monthsLabel(months: readonly number[]): string {
  if (months.length === 0 || months.length === 12) return "Full year";
  const sorted = [...months].sort((a, b) => a - b);
  const contiguous = sorted.every((m, i) => i === 0 || m === sorted[i - 1] + 1);
  return contiguous
    ? `${MONTH_ABBR[sorted[0] - 1]}–${MONTH_ABBR[sorted.at(-1)! - 1]}`
    : sorted.map((m) => MONTH_ABBR[m - 1]).join(", ");
}

export const TH = "py-2 font-medium";
export const HEAD_ROW = "border-b border-border text-xs uppercase tracking-wider text-muted-foreground";
export const ROW = "border-b border-border/60";
export const CELL = "py-2 pr-3 text-left text-foreground";
export const MUTED_CELL = "py-2 pr-3 text-left text-muted-foreground";
export const NUM = "py-2 pl-3 text-right tabular-nums text-muted-foreground";
export const TOTAL_ROW = "border-t-2 border-border font-semibold";
export const TOTAL_NUM = "py-2 pl-3 text-right tabular-nums text-foreground";

export function Loading() {
  return (
    <div className="flex h-64 items-center justify-center text-muted-foreground">
      <Loader2 size={20} className="animate-spin" />
    </div>
  );
}

export function ErrorBox({ what, message }: { what: string; message: string }) {
  return (
    <div className="border border-red-500 bg-red-500 px-4 py-3 text-sm text-white">
      Couldn&apos;t load {what}: {message}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-32 items-center justify-center border border-dashed border-gray-200 text-sm text-muted-foreground">
      {children}
    </div>
  );
}

/** Page heading + period + the "where these numbers come from" note. */
export function PageHeading({
  icon: Icon,
  title,
  period,
  children,
}: {
  icon: LucideIcon;
  title: string;
  period: string;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <Icon size={18} className="text-primary" />
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        <span className="text-xs font-medium text-muted-foreground">· {period}</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{children}</p>
    </div>
  );
}

/** Black band heading (as in the Looker pages). */
export function Band({ children }: { children: ReactNode }) {
  return <div className="bg-gray-900 px-4 py-2 text-sm font-bold uppercase tracking-wider text-white">{children}</div>;
}

/** Label column(s) + one amount, with a grand total. */
export function ListTable({
  headers,
  rows,
  totalLabel = "Grand total",
  maxHeight,
}: {
  headers: string[];
  rows: { label: string[]; net: number }[];
  totalLabel?: string;
  maxHeight?: number;
}) {
  const total = rows.reduce((t, r) => t + r.net, 0);
  const labelCols = headers.length - 1;
  return (
    <div className="overflow-auto" style={maxHeight ? { maxHeight } : undefined}>
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-card">
          <tr className={HEAD_ROW}>
            {headers.map((h, i) => (
              <th key={h} className={`${TH} ${i < labelCols ? "pr-3 text-left" : "pl-3 text-right"}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.label.join("|") + i} className={ROW}>
              {r.label.map((l, j) => (
                <td key={j} className={j === labelCols - 1 ? CELL : MUTED_CELL}>
                  {j < labelCols - 1 && i > 0 && rows[i - 1].label.slice(0, j + 1).join() === r.label.slice(0, j + 1).join() ? "" : l}
                </td>
              ))}
              <td className={NUM}>{money(r.net)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className={TOTAL_ROW}>
            <td className="py-2 text-left" colSpan={labelCols}>
              {totalLabel}
            </td>
            <td className={TOTAL_NUM}>{money(total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/** Previous year vs current year, with $ and % change. */
export function YoyTable({
  labelHeaders,
  lines,
  year,
  limit,
  showTotal = true,
  numbered = false,
}: {
  labelHeaders: string[];
  lines: YoyLine[];
  year: number;
  limit?: number;
  showTotal?: boolean;
  numbered?: boolean;
}) {
  const shown = limit ? lines.slice(0, limit) : lines;
  const prev = lines.reduce((t, l) => t + l.prev, 0);
  const cur = lines.reduce((t, l) => t + l.cur, 0);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className={HEAD_ROW}>
            {numbered && <th className={`${TH} pr-2 text-left`}>#</th>}
            {labelHeaders.map((h) => (
              <th key={h} className={`${TH} pr-3 text-left`}>
                {h}
              </th>
            ))}
            <th className={`${TH} pl-3 text-right`}>{year - 1} $</th>
            <th className={`${TH} pl-3 text-right`}>{year} $</th>
            <th className={`${TH} pl-3 text-right`}>Change $</th>
            <th className={`${TH} pl-3 text-right`}>Change %</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((l, i) => {
            const d = l.cur - l.prev;
            const p = change(l.cur, l.prev);
            return (
              <tr key={l.key} className={ROW}>
                {numbered && <td className="py-2 pr-2 text-left tabular-nums text-muted-foreground">{i + 1}</td>}
                <td className={CELL}>{l.key}</td>
                {(l.extra ?? []).slice(0, labelHeaders.length - 1).map((e, j) => (
                  <td key={j} className={MUTED_CELL}>
                    {e}
                  </td>
                ))}
                <td className={NUM}>{money(l.prev)}</td>
                <td className={NUM}>{money(l.cur)}</td>
                <td className={`${NUM} ${d > 0 ? "text-green-700" : d < 0 ? "text-red-600" : ""}`}>{money(d)}</td>
                <td className={`${NUM} ${d > 0 ? "text-green-700" : d < 0 ? "text-red-600" : ""}`}>{pct(p)}</td>
              </tr>
            );
          })}
        </tbody>
        {showTotal && (
          <tfoot>
            <tr className={TOTAL_ROW}>
              <td className="py-2 text-left" colSpan={labelHeaders.length + (numbered ? 1 : 0)}>
                {limit && lines.length > limit ? `Total (all ${lines.length})` : "Grand total"}
              </td>
              <td className={TOTAL_NUM}>{money(prev)}</td>
              <td className={TOTAL_NUM}>{money(cur)}</td>
              <td className={TOTAL_NUM}>{money(cur - prev)}</td>
              <td className={TOTAL_NUM}>{pct(change(cur, prev))}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

/** Pivot table: label columns + one column per value + row total. */
export function MatrixTable({
  labelHeaders,
  matrix,
  subtotals = false,
}: {
  labelHeaders: string[];
  matrix: Matrix;
  /** Add a "Total" line after each group of the first label column (as in Looker). */
  subtotals?: boolean;
}) {
  const subtotalRow = (group: string) => {
    const lines = matrix.rows.filter((r) => r.label[0] === group);
    return (
      <tr key={`${group}|subtotal`} className="border-b border-border bg-gray-100 font-semibold">
        <td className="py-2 pr-3 text-left text-foreground" colSpan={labelHeaders.length}>
          {group} total
        </td>
        {matrix.columns.map((c) => (
          <td key={c} className={TOTAL_NUM}>
            {money(lines.reduce((t, l) => t + (l.cells[c] ?? 0), 0))}
          </td>
        ))}
        <td className={TOTAL_NUM}>{money(lines.reduce((t, l) => t + l.total, 0))}</td>
      </tr>
    );
  };
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className={HEAD_ROW}>
            {labelHeaders.map((h) => (
              <th key={h} className={`${TH} pr-3 text-left`}>
                {h}
              </th>
            ))}
            {matrix.columns.map((c) => (
              <th key={c} className={`${TH} pl-3 text-right`}>
                {c}
              </th>
            ))}
            <th className={`${TH} pl-3 text-right`}>Total</th>
          </tr>
        </thead>
        <tbody>
          {matrix.rows.flatMap((r, i) => [
            <tr key={r.label.join("|")} className={ROW}>
              {r.label.map((l, j) => (
                <td key={j} className={j === r.label.length - 1 ? CELL : MUTED_CELL}>
                  {j < r.label.length - 1 && i > 0 && matrix.rows[i - 1].label.slice(0, j + 1).join() === r.label.slice(0, j + 1).join() ? "" : l}
                </td>
              ))}
              {matrix.columns.map((c) => (
                <td key={c} className={NUM}>
                  {r.cells[c] ? money(r.cells[c]) : "—"}
                </td>
              ))}
              <td className={TOTAL_NUM}>{money(r.total)}</td>
            </tr>,
            ...(subtotals && (i === matrix.rows.length - 1 || matrix.rows[i + 1].label[0] !== r.label[0])
              ? [subtotalRow(r.label[0])]
              : []),
          ])}
        </tbody>
        <tfoot>
          <tr className={TOTAL_ROW}>
            <td className="py-2 text-left" colSpan={labelHeaders.length}>
              Grand total
            </td>
            {matrix.columns.map((c) => (
              <td key={c} className={TOTAL_NUM}>
                {money(matrix.columnTotals[c] ?? 0)}
              </td>
            ))}
            <td className={TOTAL_NUM}>{money(matrix.total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/** "Source" sentence shared by the three pages. */
export function sourceNote(source: string, unlinked: { names: string[]; total: number }) {
  return (
    <>
      Booked net ordered (CAD) from the MIR{source ? ` (${source})` : ""} — table{" "}
      <code>PCC_Dashboard_NATIVE</code>, column <code>NET_ORDERED_CAD</code>; media channel N/A left out. Same numbers as the
      former Looker MIR dashboard.
      {unlinked.names.length > 0 && (
        <>
          {" "}Includes {money(unlinked.total)} for MIR clients that aren&apos;t in the Forecaster ({unlinked.names.slice(0, 8).join(", ")}
          {unlinked.names.length > 8 ? `, +${unlinked.names.length - 8} more` : ""}); filtering the dashboard leaves them out.
        </>
      )}
    </>
  );
}

/** Share of a total as "42%" ("—" when the total is 0). */
export const share = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : "—");
