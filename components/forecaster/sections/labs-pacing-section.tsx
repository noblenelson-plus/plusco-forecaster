// components/forecaster/sections/labs-pacing-section.tsx
"use client";

/**
 * Labs Pacing section — Target (BL forecast, selected submission) vs Booked (MIR
 * actuals): a BY PARTNER table, the % booked and $ variance charts, and the BY
 * CLIENT flag table. (GM-pod views are built but currently not shown.)
 *
 * Own month + partner filters, independent of the page's global Months filter:
 * the month range defaults to January through two months back (e.g. August →
 * Jan–Jun) and resets when the year changes. The `selMonths` prop is
 * intentionally ignored. GM pod comes from the accessible-clients list.
 */

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  FlaskConical,
  Loader2,
  Percent,
  TrendingUp,
  Table2,
} from "lucide-react";
import ChartCard from "../../dashboard/charts/chart-card";
import BarList from "../../dashboard/charts/bar-list";
import LabsVarianceChart from "./labs-variance-chart";
import ExportSheetButton from "../table/export-sheet-button";
import MultiSelectDropdown from "../../_shared/multi-select-dropdown";
import { useTableSort } from "../table/use-table-sort";
import {
  computeLabsPacing,
  buildLabsPacingColumns,
  computeClientPacing,
  buildClientPacingColumns,
  percentBars,
  type LabsPacingRow,
  type LabsPacingColumn,
  type ClientPacingRow,
  type ClientPacingColumn,
} from "./labs-pacing-data";
import { useScopeLabsPacing } from "../../../lib/dashboard/data/use-scope-labs-pacing";
import {
  subscribeToLabsPartners,
  getLabsPartnersForYear,
} from "../../../lib/services/labs-partner-service";
import { useForecastSelection } from "../../../lib/stores/forecast-selection.store";
import { useAccessibleClients } from "../../../lib/hooks/use-accessible-clients";
import { useUsersMap } from "../../../lib/hooks/use-users-map";
import type { LabsPartner } from "../../../lib/types/labs.types";
import type { Currency } from "../../../lib/types/client.types";

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const MONTH_OPTIONS = MONTH_LABELS.map((label, i) => ({ value: String(i + 1), label }));

/** Jan through two months back for the current year (e.g. Aug → Jan–Jun); all 12 otherwise. */
function defaultMonthsForYear(year: number | null): number[] {
  const now = new Date();
  // getMonth() is 0-based, so getMonth() − 1 is two calendar months back.
  const through = year === now.getFullYear() ? Math.max(1, now.getMonth() - 1) : 12;
  return Array.from({ length: through }, (_, i) => i + 1);
}

export default function LabsPacingSection({
  scopedClientIds,
  currencyByClient,
  usdToCad,
}: {
  scopedClientIds: string[];
  currencyByClient: Record<string, Currency>;
  usdToCad?: number;
  /** Ignored — the pacing section manages its own month range. */
  selMonths?: number[];
}) {
  const { selectedYear, selectedRFQ } = useForecastSelection();
  const { clients } = useAccessibleClients();
  const usersMap = useUsersMap();

  const gmPodByClient = useMemo(
    () => Object.fromEntries(clients.map((c) => [c.cl_id, c.GM_Pod || "—"])),
    [clients]
  );

  // Own month range (default Jan → two months back), reset when year flips.
  const [months, setMonths] = useState<number[]>(() => defaultMonthsForYear(selectedYear));
  const [prevYear, setPrevYear] = useState(selectedYear);
  if (selectedYear !== prevYear) {
    setPrevYear(selectedYear);
    setMonths(defaultMonthsForYear(selectedYear));
  }

  // Own partner filter (empty = all partners).
  const [partnerIds, setPartnerIds] = useState<string[]>([]);

  const [partners, setPartners] = useState<LabsPartner[]>([]);
  useEffect(() => {
    const unsubscribe = subscribeToLabsPartners(setPartners);
    return () => unsubscribe();
  }, []);

  const { cells, detail, loading } = useScopeLabsPacing({
    scopedClientIds,
    year: selectedYear,
    rfq: selectedRFQ?.type ?? null,
    currencyByClient,
    gmPodByClient,
    usdToCad,
    selMonths: months,
  });

  const yearPartners = useMemo(
    () => (selectedYear ? getLabsPartnersForYear(partners, selectedYear) : []),
    [partners, selectedYear]
  );

  const partnerOptions = useMemo(
    () => yearPartners.map((p) => ({ value: p.partnerId, label: p.name })),
    [yearPartners]
  );

  const filteredCells = useMemo(
    () =>
      partnerIds.length > 0
        ? cells.filter((c) => partnerIds.includes(c.partnerId))
        : cells,
    [cells, partnerIds]
  );

  const { rows, totals } = useMemo(
    () => computeLabsPacing(filteredCells, yearPartners),
    [filteredCells, yearPartners]
  );

  const percentData = useMemo(() => percentBars(rows), [rows]);

  const targetLabel = selectedRFQ ? `Target (${selectedRFQ.type} Forecast)` : "Target";
  const columns = useMemo(() => buildLabsPacingColumns({ targetLabel }), [targetLabel]);

  const { directionFor, toggle: toggleSort, sortRows } = useTableSort(columns);
  const sortedRows = useMemo(() => sortRows(rows), [sortRows, rows]);

  const filteredDetail = useMemo(
    () =>
      partnerIds.length > 0
        ? detail.filter((d) => partnerIds.includes(d.partnerId))
        : detail,
    [detail, partnerIds]
  );
  const client = useMemo(
    () => computeClientPacing(filteredDetail, clients, yearPartners, usersMap),
    [filteredDetail, clients, yearPartners, usersMap]
  );
  const clientColumns = useMemo(
    () => buildClientPacingColumns({ targetLabel }),
    [targetLabel]
  );
  const clientSort = useTableSort(clientColumns);
  const sortedClientRows = useMemo(
    () => clientSort.sortRows(client.rows),
    [clientSort, client.rows]
  );

  const controls = (
    <div className="flex items-center gap-2">
      <MultiSelectDropdown
        label="Months"
        options={MONTH_OPTIONS}
        selectedValues={months.map(String)}
        onChange={(vals) => setMonths(vals.map(Number))}
      />
      <MultiSelectDropdown
        label="Partner"
        options={partnerOptions}
        selectedValues={partnerIds}
        onChange={setPartnerIds}
      />
      <ExportSheetButton
        columns={columns}
        rows={sortedRows}
        totals={totals}
        title={`Labs Pacing — ${targetLabel}`}
        sheetTitle="Labs Pacing"
      />
    </div>
  );

  const header = (
    <div className="flex items-center justify-between gap-3">
      <div>
        <h2 className="text-base font-semibold text-foreground">Labs Pacing</h2>
        <p className="text-xs text-muted-foreground">Target vs Booked (MIR) by partner</p>
      </div>
      {controls}
    </div>
  );

  if (loading && rows.length === 0) {
    return (
      <section className="space-y-4">
        {header}
        <div className="flex h-32 items-center justify-center text-muted-foreground">
          <Loader2 size={18} className="animate-spin" />
        </div>
      </section>
    );
  }

  if (rows.length === 0) {
    return (
      <section className="space-y-4">
        {header}
        <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
          No labs pacing data for this selection.
        </div>
      </section>
    );
  }

  const headerCell = (column: LabsPacingColumn) => {
    const direction = directionFor(column.id);
    return (
      <th
        key={column.id}
        className="whitespace-nowrap px-3 py-2 font-medium first:pr-3 first:pl-0 last:pr-0 last:pl-3"
      >
        <button
          type="button"
          onClick={() => toggleSort(column)}
          title={`Sort by ${column.label}`}
          className={`flex w-full items-center gap-1 transition-colors hover:text-foreground ${
            column.align === "right" ? "justify-end" : "justify-start"
          } ${direction ? "text-foreground" : ""}`}
        >
          <span className="truncate">{column.label}</span>
          {direction === "asc" ? (
            <ArrowUp size={12} className="shrink-0" />
          ) : direction === "desc" ? (
            <ArrowDown size={12} className="shrink-0" />
          ) : null}
        </button>
      </th>
    );
  };

  const bodyCell = (column: LabsPacingColumn, row: LabsPacingRow) => {
    const text = column.display(row);
    if (column.kind === "text") {
      return (
        <td key={column.id} className="px-3 py-2 text-left text-foreground first:pl-0">
          {text}
        </td>
      );
    }
    return (
      <td
        key={column.id}
        style={column.cellStyle?.(row)}
        className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-foreground last:pr-0"
      >
        {text}
      </td>
    );
  };

  const footerCell = (column: LabsPacingColumn) => {
    if (!column.total) return <td key={column.id} className="bg-muted" />;
    return (
      <td
        key={column.id}
        className={`whitespace-nowrap px-3 py-2 tabular-nums ${
          column.align === "right" ? "text-right" : "text-left"
        } first:pl-0 last:pr-0`}
      >
        {column.total(totals)}
      </td>
    );
  };

  const clientHeaderCell = (column: ClientPacingColumn) => {
    const direction = clientSort.directionFor(column.id);
    return (
      <th
        key={column.id}
        className="whitespace-nowrap px-3 py-2 font-medium first:pl-0 last:pr-0"
      >
        <button
          type="button"
          onClick={() => clientSort.toggle(column)}
          title={`Sort by ${column.label}`}
          className={`flex w-full items-center gap-1 transition-colors hover:text-foreground ${
            column.align === "right" ? "justify-end" : "justify-start"
          } ${direction ? "text-foreground" : ""}`}
        >
          <span className="truncate">{column.label}</span>
          {direction === "asc" ? (
            <ArrowUp size={12} className="shrink-0" />
          ) : direction === "desc" ? (
            <ArrowDown size={12} className="shrink-0" />
          ) : null}
        </button>
      </th>
    );
  };

  const clientBodyCell = (column: ClientPacingColumn, row: ClientPacingRow) => {
    const text = column.display(row);
    const style = column.cellStyle?.(row);
    if (column.kind === "text") {
      return (
        <td
          key={column.id}
          style={style}
          title={text === "—" ? undefined : text}
          className="max-w-[180px] truncate px-3 py-2 text-left text-foreground first:pl-0"
        >
          {text}
        </td>
      );
    }
    return (
      <td
        key={column.id}
        style={style}
        className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-foreground last:pr-0"
      >
        {text}
      </td>
    );
  };

  const clientFooterCell = (column: ClientPacingColumn) => {
    if (!column.total) return <td key={column.id} className="bg-muted" />;
    return (
      <td
        key={column.id}
        className={`whitespace-nowrap px-3 py-2 tabular-nums ${
          column.align === "right" ? "text-right" : "text-left"
        } first:pl-0 last:pr-0`}
      >
        {column.total(client.totals)}
      </td>
    );
  };

  return (
    <section className="space-y-6">
      {header}

      <ChartCard title="By Partner" icon={FlaskConical}>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                {columns.map(headerCell)}
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row) => (
                <tr key={row.partnerId} className="border-b border-border/60">
                  {columns.map((column) => bodyCell(column, row))}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border bg-muted font-semibold text-foreground">
                {columns.map(footerCell)}
              </tr>
            </tfoot>
          </table>
        </div>
      </ChartCard>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard title="% of Target Booked" icon={Percent}>
          <BarList items={percentData} valueFormat={(v) => `${Math.round(v)}%`} />
        </ChartCard>
        <ChartCard title="$ Variance to Target" icon={TrendingUp}>
          <LabsVarianceChart rows={rows} />
        </ChartCard>
      </div>

      <ChartCard title="By Client" icon={Table2}>
        <div className="flex items-center justify-end pb-2">
          <ExportSheetButton
            columns={clientColumns}
            rows={sortedClientRows}
            totals={client.totals}
            title={`Labs Pacing by Client — ${targetLabel}`}
            sheetTitle="Labs Pacing by Client"
          />
        </div>
        <div className="max-h-[520px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                {clientColumns.map(clientHeaderCell)}
              </tr>
            </thead>
            <tbody>
              {sortedClientRows.map((row) => (
                <tr key={row.key} className="border-b border-border/60">
                  {clientColumns.map((column) => clientBodyCell(column, row))}
                </tr>
              ))}
            </tbody>
            <tfoot className="sticky bottom-0 z-10">
              <tr className="border-t-2 border-border bg-muted font-semibold text-foreground">
                {clientColumns.map(clientFooterCell)}
              </tr>
            </tfoot>
          </table>
        </div>
      </ChartCard>
    </section>
  );
}