// components/dashboard/media-data-table.tsx
"use client";

/**
 * Per-client media data table — one sortable row per (client × media type),
 * with the 12 monthly BL spend values and an annual total, plus a one-click CSV
 * export of the same data. Built on TanStack Table + the shared shadcn Table
 * primitives so sorting/columns stay declarative.
 */

import { useMemo, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowUpDown, ArrowDown, ArrowUp, Download, Table2 } from "lucide-react";
import { MEDIA_TYPES, MONTHS, type MediaType } from "../../lib/types/common.types";
import { MEDIA_TYPE_LABELS } from "../../lib/types/forecaster.types";
import { MEDIA_TYPE_COLORS } from "./charts/colors";
import { formatMoney } from "../../lib/format/money";
import type { ClientMediaBreakdown } from "../../lib/dashboard/data/aggregate";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
  CardContent,
} from "../ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
} from "../ui/table";
import { Button } from "../ui/button";

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

interface MediaRow {
  clientId: string;
  client: string;
  mediaType: MediaType;
  label: string;
  color: string;
  months: Record<number, number>;
  total: number;
}

/** Quote a CSV field when it contains a comma, quote or newline. */
function csvField(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Every column except the two text columns is a right-aligned money column. */
const isNumericColumn = (id: string) => id !== "client" && id !== "label";

export default function MediaDataTable({
  mediaByClient,
  clientNameById,
  fileLabel,
}: {
  mediaByClient: ClientMediaBreakdown[];
  clientNameById: Record<string, string>;
  /** Optional suffix for the exported file name, e.g. "2026-RFQ1". */
  fileLabel?: string;
}) {
  // Flatten the per-client breakdown into one row per (client × media type),
  // dropping types the client never planned.
  const rows = useMemo<MediaRow[]>(() => {
    const out: MediaRow[] = [];
    for (const entry of mediaByClient) {
      const client = clientNameById[entry.clientId] ?? entry.clientId;
      for (const mt of MEDIA_TYPES) {
        const months = entry.byType[mt];
        if (!months) continue;
        const total = MONTHS.reduce((acc, m) => acc + (months[m] ?? 0), 0);
        if (total === 0) continue;
        out.push({
          clientId: entry.clientId,
          client,
          mediaType: mt,
          label: MEDIA_TYPE_LABELS[mt],
          color: MEDIA_TYPE_COLORS[mt],
          months: Object.fromEntries(MONTHS.map((m) => [m, months[m] ?? 0])),
          total,
        });
      }
    }
    return out;
  }, [mediaByClient, clientNameById]);

  // Column totals for the footer row.
  const totals = useMemo(() => {
    const monthly: Record<number, number> = Object.fromEntries(
      MONTHS.map((m) => [m, 0])
    );
    let grand = 0;
    for (const r of rows) {
      for (const m of MONTHS) monthly[m] += r.months[m];
      grand += r.total;
    }
    return { monthly, grand };
  }, [rows]);

  const columns = useMemo<ColumnDef<MediaRow>[]>(() => {
    const monthCols: ColumnDef<MediaRow>[] = MONTHS.map((m, i) => ({
      id: String(m),
      accessorFn: (r) => r.months[m],
      header: MONTH_LABELS[i],
      cell: (ctx) => formatMoney(ctx.getValue<number>()),
      sortingFn: "basic",
    }));

    return [
      {
        accessorKey: "client",
        header: "Client",
        cell: (ctx) => (
          <span className="font-medium text-foreground">
            {ctx.getValue<string>()}
          </span>
        ),
      },
      {
        accessorKey: "label",
        header: "Media type",
        cell: (ctx) => (
          <span className="inline-flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 flex-shrink-0 rounded-sm"
              style={{ backgroundColor: ctx.row.original.color }}
            />
            {ctx.getValue<string>()}
          </span>
        ),
      },
      ...monthCols,
      {
        accessorKey: "total",
        header: "Total",
        cell: (ctx) => (
          <span className="font-semibold text-foreground">
            {formatMoney(ctx.getValue<number>())}
          </span>
        ),
      },
    ];
  }, []);

  const [sorting, setSorting] = useState<SortingState>([
    { id: "total", desc: true },
  ]);

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  function downloadCsv() {
    const header = ["Client", "Media Type", ...MONTH_LABELS, "Total"];
    const body = rows.map((r) => [
      r.client,
      r.label,
      ...MONTHS.map((m) => Math.round(r.months[m])),
      Math.round(r.total),
    ]);
    const footer = [
      "Total",
      "",
      ...MONTHS.map((m) => Math.round(totals.monthly[m])),
      Math.round(totals.grand),
    ];
    const lines = [header, ...body, footer].map((row) =>
      row.map(csvField).join(",")
    );
    const csv = lines.join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `media-forecast${fileLabel ? `-${fileLabel}` : ""}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex items-center gap-2">
          <Table2 size={16} className="flex-shrink-0 text-primary" />
          <div>
            <CardTitle>Media spend detail</CardTitle>
            <CardDescription className="mt-0.5">
              BL spend by client and media type · {rows.length} row
              {rows.length === 1 ? "" : "s"}
            </CardDescription>
          </div>
        </div>
        <CardAction>
          <Button
            variant="outline"
            size="sm"
            onClick={downloadCsv}
            disabled={rows.length === 0}
          >
            <Download />
            Download CSV
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        {rows.length === 0 ? (
          <p className="px-5 py-10 text-center text-xs text-muted-foreground">
            No media spend to display for this scope.
          </p>
        ) : (
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((hg) => (
                <TableRow key={hg.id} className="hover:bg-transparent">
                  {hg.headers.map((header) => {
                    const numeric = isNumericColumn(header.column.id);
                    const sorted = header.column.getIsSorted();
                    return (
                      <TableHead
                        key={header.id}
                        className={numeric ? "text-right" : undefined}
                      >
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className={`inline-flex items-center gap-1 hover:text-foreground ${
                            numeric ? "flex-row-reverse" : ""
                          }`}
                        >
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                          {sorted === "asc" ? (
                            <ArrowUp size={12} />
                          ) : sorted === "desc" ? (
                            <ArrowDown size={12} />
                          ) : (
                            <ArrowUpDown size={12} className="opacity-40" />
                          )}
                        </button>
                      </TableHead>
                    );
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => {
                    const numeric = isNumericColumn(cell.column.id);
                    return (
                      <TableCell
                        key={cell.id}
                        className={
                          numeric
                            ? "text-right tabular-nums text-muted-foreground"
                            : undefined
                        }
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow className="hover:bg-transparent">
                <TableCell className="font-semibold text-foreground">
                  Total
                </TableCell>
                <TableCell />
                {MONTHS.map((m) => (
                  <TableCell
                    key={m}
                    className="text-right tabular-nums font-medium text-foreground"
                  >
                    {formatMoney(totals.monthly[m])}
                  </TableCell>
                ))}
                <TableCell className="text-right tabular-nums font-semibold text-foreground">
                  {formatMoney(totals.grand)}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
