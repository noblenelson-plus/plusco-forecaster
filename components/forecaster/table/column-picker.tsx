// components/forecaster/table/column-picker.tsx
"use client";

/**
 * Column visibility dropdown for a descriptor-driven table.
 *
 * Checkboxes are sectioned by the column `group`, in first-seen order, so a
 * merged list (Media + Labs on one table) stays navigable at ~40 entries.
 * Pinned columns are never listed — they are structural, and hiding one would
 * break the frozen-column offsets.
 *
 * Selection is controlled by the parent: this component only reports changes.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Columns3, RotateCcw } from "lucide-react";
import { selectableColumns, type TableColumn } from "./table-column.types";

export default function ColumnPicker<R, T>({
  columns,
  visibleIds,
  onChange,
  onReset,
}: {
  columns: TableColumn<R, T>[];
  visibleIds: ReadonlySet<string>;
  onChange: (ids: Set<string>) => void;
  /** Restores the active preset. Hidden when not provided. */
  onReset?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectable = useMemo(() => selectableColumns(columns), [columns]);

  /** Groups in first-seen order, each with its columns. */
  const groups = useMemo(() => {
    const byGroup = new Map<string, TableColumn<R, T>[]>();
    for (const column of selectable) {
      const bucket = byGroup.get(column.group);
      if (bucket) bucket.push(column);
      else byGroup.set(column.group, [column]);
    }
    return [...byGroup.entries()];
  }, [selectable]);

  const selectedCount = selectable.filter((c) => visibleIds.has(c.id)).length;

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const toggleColumn = (id: string) => {
    const next = new Set(visibleIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  };

  const setGroup = (groupColumns: TableColumn<R, T>[], visible: boolean) => {
    const next = new Set(visibleIds);
    for (const column of groupColumns) {
      if (visible) next.add(column.id);
      else next.delete(column.id);
    }
    onChange(next);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Columns3 size={14} />
        Columns
        <span className="tabular-nums text-xs text-muted-foreground">
          {selectedCount}
        </span>
        <ChevronDown size={14} />
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-1 max-h-96 w-72 overflow-y-auto rounded-lg border border-border bg-card shadow-lg">
          {onReset && (
            <div className="sticky top-0 flex justify-end border-b border-border bg-card px-3 py-2">
              <button
                type="button"
                onClick={() => onReset()}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                <RotateCcw size={12} />
                Reset to view default
              </button>
            </div>
          )}

          {groups.map(([groupName, groupColumns]) => {
            const allOn = groupColumns.every((c) => visibleIds.has(c.id));
            return (
              <div key={groupName} className="border-b border-border last:border-b-0">
                <div className="flex items-center justify-between bg-muted px-3 py-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {groupName}
                  </span>
                  <button
                    type="button"
                    onClick={() => setGroup(groupColumns, !allOn)}
                    className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {allOn ? "None" : "All"}
                  </button>
                </div>

                {groupColumns.map((column) => {
                  const checked = visibleIds.has(column.id);
                  return (
                    <button
                      key={column.id}
                      type="button"
                      onClick={() => toggleColumn(column.id)}
                      className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm transition-colors hover:bg-muted"
                    >
                      <span
                        className={`flex size-4 shrink-0 items-center justify-center border ${
                          checked
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-card"
                        }`}
                      >
                        {checked && <Check size={11} strokeWidth={3} />}
                      </span>
                      <span
                        className={
                          checked ? "text-foreground" : "text-muted-foreground"
                        }
                      >
                        {column.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}