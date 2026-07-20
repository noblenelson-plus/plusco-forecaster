// components/dashboard/product-data-table.tsx
"use client";

/**
 * Detailed product tracking table — one sortable row per (client × product)
 * entry, with the pipeline status, expected timing and the BL's note, plus a
 * one-click CSV export. Built on TanStack Table + the shared shadcn Table
 * primitives, mirroring the Media/Labs detail tables.
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
import {
  PRODUCT_STATUS_LABELS,
  PRODUCT_STATUS_ORDER,
  type ProductStatus,
} from "../../lib/types/product.types";
import type { ClientProductEntry } from "../../lib/dashboard/data/use-scope-product-tracking";
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
  TableHead,
  TableRow,
  TableCell,
} from "../ui/table";
import { Button } from "../ui/button";

/** Quote a CSV field when it contains a comma, quote or newline. */
function csvField(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Flat status chips — same palette as the Product grid's status buttons. */
const STATUS_CHIP: Record<ProductStatus, string> = {
  IDENTIFIED_PROSPECT: "bg-blue-200 text-gray-900",
  PITCHED_TO_CLIENT: "bg-yellow-400 text-gray-900",
  APPROVED: "bg-green-500 text-white",
  REJECTED: "bg-red-500 text-white",
};

/** "YYYY-MM" → "Mar 2026" (falls back to the raw string on a bad value). */
export function formatTiming(timing?: string): string {
  if (!timing) return "";
  const [y, m] = timing.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) return timing;
  return new Date(y, m - 1, 1).toLocaleDateString("en-CA", {
    month: "short",
    year: "numeric",
  });
}

export default function ProductDataTable({
  entries,
  productNameById,
  clientNameById,
}: {
  entries: ClientProductEntry[];
  productNameById: Record<string, string>;
  clientNameById: Record<string, string>;
}) {
  const rows = useMemo(
    () =>
      entries.map((e) => ({
        ...e,
        client: clientNameById[e.clientId] ?? e.clientId,
        product: productNameById[e.productId] ?? e.productId,
      })),
    [entries, clientNameById, productNameById]
  );

  type Row = (typeof rows)[number];

  const columns = useMemo<ColumnDef<Row>[]>(
    () => [
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
        accessorKey: "product",
        header: "Product",
        cell: (ctx) => (
          <span className="text-foreground">{ctx.getValue<string>()}</span>
        ),
      },
      {
        id: "status",
        // Sort by pipeline position; entries with no status sink to the end.
        accessorFn: (r) =>
          r.status ? PRODUCT_STATUS_ORDER.indexOf(r.status) : PRODUCT_STATUS_ORDER.length,
        header: "Status",
        cell: (ctx) => {
          const status = ctx.row.original.status;
          if (!status)
            return <span className="text-xs italic text-muted-foreground">Note only</span>;
          return (
            <span
              className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-medium ${STATUS_CHIP[status]}`}
            >
              {PRODUCT_STATUS_LABELS[status]}
            </span>
          );
        },
        sortingFn: "basic",
      },
      {
        id: "timing",
        // "YYYY-MM" sorts correctly as a plain string; missing timings last.
        accessorFn: (r) => r.timing ?? "9999-99",
        header: "Timing",
        cell: (ctx) => (
          <span className="tabular-nums text-muted-foreground">
            {formatTiming(ctx.row.original.timing)}
          </span>
        ),
      },
      {
        accessorKey: "note",
        header: "Note",
        enableSorting: false,
        cell: (ctx) => {
          const note = ctx.row.original.note;
          return note ? (
            <span
              title={note}
              className="block max-w-md truncate text-xs text-muted-foreground"
            >
              {note}
            </span>
          ) : null;
        },
      },
    ],
    []
  );

  const [sorting, setSorting] = useState<SortingState>([
    { id: "client", desc: false },
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
    const header = ["Client", "Product", "Status", "Timing", "Note"];
    const body = rows.map((r) => [
      r.client,
      r.product,
      r.status ? PRODUCT_STATUS_LABELS[r.status] : "",
      r.timing ?? "",
      r.note ?? "",
    ]);
    const lines = [header, ...body].map((row) => row.map(csvField).join(","));
    const csv = lines.join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "product-tracking.csv";
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
            <CardTitle>Product tracking detail</CardTitle>
            <CardDescription className="mt-0.5">
              Status, timing and notes by client and product · {rows.length} row
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
            No product tracking to display for this scope.
          </p>
        ) : (
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((hg) => (
                <TableRow key={hg.id} className="hover:bg-transparent">
                  {hg.headers.map((header) => {
                    const sorted = header.column.getIsSorted();
                    return (
                      <TableHead key={header.id}>
                        {header.column.getCanSort() ? (
                          <button
                            type="button"
                            onClick={header.column.getToggleSortingHandler()}
                            className="inline-flex items-center gap-1 hover:text-foreground"
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
                        ) : (
                          flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )
                        )}
                      </TableHead>
                    );
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
