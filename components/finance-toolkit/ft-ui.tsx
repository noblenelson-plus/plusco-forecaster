// filepath: components/finance-toolkit/ft-ui.tsx
"use client";

/**
 * Small building blocks shared by the three Finance Toolkit tabs: segmented
 * control, month-range picker, the "How this is calculated" expander, notices,
 * status chips and a sortable table shell. Styling follows the app's flat Plus
 * look (square, solid surfaces, Card primitives).
 */

import { useMemo, useState } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, ChevronDown, Download, Info, Sigma } from "lucide-react";
import { Card } from "../ui/card";
import { monthLabel } from "../../lib/finance-toolkit/model";

// ─── Segmented control ───────────────────────────────────────────────────────

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = "md",
  ariaLabel,
}: {
  options: readonly { id: T; label: string; hint?: string }[];
  value: T;
  onChange: (v: T) => void;
  size?: "sm" | "md";
  ariaLabel?: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="inline-flex flex-wrap border border-gray-200 bg-white">
      {options.map((o) => {
        const active = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={active}
            title={o.hint}
            onClick={() => onChange(o.id)}
            className={`${size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm"} font-medium transition-colors ${
              active ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Labeled control wrapper ─────────────────────────────────────────────────

export function Field({ label, hint, children, className = "" }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
        {label}
        {hint && <InfoTip text={hint} />}
      </span>
      {children}
    </div>
  );
}

// ─── Plain-language helpers ──────────────────────────────────────────────────

/** A small (i) that explains a term on hover or keyboard focus. */
export function InfoTip({ text, align = "center" }: { text: string; align?: "center" | "left" | "right" }) {
  const pos = align === "left" ? "left-0" : align === "right" ? "right-0" : "left-1/2 -translate-x-1/2";
  return (
    <span className="group/tip relative inline-flex normal-case tracking-normal" tabIndex={0} aria-label={text} role="note">
      <Info size={12} className="cursor-help text-gray-400 group-hover/tip:text-gray-900 group-focus/tip:text-gray-900" />
      <span
        className={`pointer-events-none absolute bottom-full z-30 mb-1.5 hidden w-64 bg-gray-900 px-3 py-2 text-left text-xs font-normal leading-snug text-white shadow-xl group-hover/tip:block group-focus/tip:block ${pos}`}
      >
        {text}
      </span>
    </span>
  );
}

/** The plain-English takeaway at the top of a tab, computed from the view. */
export function InShort({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-l-4 border-yellow-400 bg-white px-5 py-4">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">In short</div>
      <p className="mt-1 text-[15px] leading-relaxed text-gray-900">{children}</p>
    </div>
  );
}

// ─── Month range ─────────────────────────────────────────────────────────────

const selectClass = "border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-yellow-400";

export function MonthRange({
  months,
  from,
  to,
  onChange,
}: {
  /** Fact month indices the user may pick from (ascending). */
  months: number[];
  from: number;
  to: number;
  onChange: (from: number, to: number) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <select
        aria-label="From month"
        className={selectClass}
        value={from}
        onChange={(e) => {
          const f = Number(e.target.value);
          onChange(f, Math.max(f, to));
        }}
      >
        {months.map((m) => (
          <option key={m} value={m}>
            {monthLabel(m)}
          </option>
        ))}
      </select>
      <span className="text-xs text-gray-400">to</span>
      <select
        aria-label="To month"
        className={selectClass}
        value={to}
        onChange={(e) => {
          const t = Number(e.target.value);
          onChange(Math.min(from, t), t);
        }}
      >
        {months.map((m) => (
          <option key={m} value={m}>
            {monthLabel(m)}
          </option>
        ))}
      </select>
    </div>
  );
}

export { selectClass };

// ─── Notices ─────────────────────────────────────────────────────────────────

/** Cost coverage (share of hours with a cost on file): below NOTE a quiet note
 *  is shown, below WARN a yellow warning. */
export const COVERAGE_NOTE_BELOW = 0.98;
export const COVERAGE_WARN_BELOW = 0.9;

export function Notice({ tone = "info", children }: { tone?: "info" | "warn"; children: React.ReactNode }) {
  const Icon = tone === "warn" ? AlertTriangle : Info;
  return (
    <div
      className={`flex items-start gap-2 px-4 py-3 text-xs leading-relaxed ${
        tone === "warn" ? "bg-yellow-400 text-gray-900" : "border border-gray-200 bg-white text-gray-600"
      }`}
    >
      <Icon size={14} className="mt-0.5 shrink-0" />
      <div className="space-y-1">{children}</div>
    </div>
  );
}

// ─── Status chips ────────────────────────────────────────────────────────────

const CHIP_TONES = {
  loss: "bg-red-500 text-white",
  over: "bg-yellow-400 text-gray-900",
  neutral: "bg-gray-200 text-gray-700",
  dark: "bg-gray-900 text-white",
} as const;

export function Chip({ tone, children, title }: { tone: keyof typeof CHIP_TONES; children: React.ReactNode; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center whitespace-nowrap px-1.5 py-0.5 text-[11px] font-semibold ${CHIP_TONES[tone]}`}>
      {children}
    </span>
  );
}

// ─── Fold-away section ───────────────────────────────────────────────────────

/** A titled card that starts closed, for detail most readers don't need at a
 *  glance. The title row says what is inside, so nothing is hidden by surprise. */
export function Disclosure({
  title,
  subtitle,
  icon: Icon,
  defaultOpen = false,
  children,
}: {
  title: string;
  subtitle?: string;
  icon?: typeof Info;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card className="gap-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left hover:bg-gray-50"
      >
        <span className="flex min-w-0 items-center gap-2">
          {Icon && <Icon size={16} className="shrink-0 text-primary" />}
          <span className="text-sm font-semibold text-gray-900">{title}</span>
          {subtitle && <span className="truncate text-xs text-gray-500">{subtitle}</span>}
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-gray-500">
          {open ? "Hide" : "Show"}
          <ChevronDown size={16} className={`transition-transform ${open ? "rotate-180" : ""}`} />
        </span>
      </button>
      {open && <div className="border-t border-gray-200 p-5">{children}</div>}
    </Card>
  );
}

/** A card, or just its contents when it is already inside a Disclosure. */
export function CardShell({ bare, children }: { bare?: boolean; children: React.ReactNode }) {
  return bare ? <div className="flex flex-col gap-4">{children}</div> : <Card className="gap-4 p-5">{children}</Card>;
}

// ─── "How this is calculated" ────────────────────────────────────────────────

export function HowCalculated({ children, title = "How this is calculated" }: { children: React.ReactNode; title?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Card className="gap-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          <Sigma size={16} className="text-primary" />
          {title}
        </span>
        <ChevronDown size={16} className={`text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="border-t border-gray-200 px-5 py-4 text-sm leading-relaxed text-gray-700">{children}</div>}
    </Card>
  );
}

/** One formula line: a name, the formula, and (optionally) the worked numbers. */
export function Formula({ name, formula, worked }: { name: string; formula: string; worked?: string }) {
  return (
    <div className="grid grid-cols-1 gap-x-4 gap-y-0.5 border-b border-gray-100 py-2 last:border-0 md:grid-cols-[200px_1fr]">
      <div className="font-medium text-gray-900">{name}</div>
      <div>
        <code className="bg-gray-100 px-1.5 py-0.5 font-mono text-[12px] text-gray-800">{formula}</code>
        {worked && <div className="mt-1 font-mono text-[12px] text-gray-500">{worked}</div>}
      </div>
    </div>
  );
}

// ─── Buttons ─────────────────────────────────────────────────────────────────

export function GhostButton({
  onClick,
  children,
  icon: Icon = Download,
  disabled,
}: {
  onClick: () => void;
  children: React.ReactNode;
  icon?: typeof Download;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <Icon size={13} />
      {children}
    </button>
  );
}

// ─── Sortable table ──────────────────────────────────────────────────────────

export interface Column<R> {
  id: string;
  label: string;
  align?: "left" | "right";
  /** Sort value; null always sorts last. */
  sort?: (r: R) => number | string | null;
  render: (r: R) => React.ReactNode;
  /** Footer (totals) cell. */
  total?: React.ReactNode;
  className?: string;
  headerTitle?: string;
}

/** Rows shown before a table scrolls, and the pixel sizes used to cap its height. */
const DEFAULT_VISIBLE_ROWS = 15;
const ROW_PX = 37;
const HEADER_PX = 38;
const FOOTER_PX = 42;

export function DataTable<R>({
  columns,
  rows,
  rowKey,
  defaultSort,
  onRowClick,
  activeKey,
  visibleRows = DEFAULT_VISIBLE_ROWS,
  emptyText = "No data for this selection.",
  footerLabel,
}: {
  columns: Column<R>[];
  rows: R[];
  rowKey: (r: R) => string;
  defaultSort?: { id: string; dir: "asc" | "desc" } | null;
  onRowClick?: (r: R) => void;
  activeKey?: string | null;
  /** Rows visible before the table scrolls (the header and totals stay put). */
  visibleRows?: number;
  emptyText?: string;
  footerLabel?: string;
}) {
  const [sort, setSort] = useState<{ id: string; dir: "asc" | "desc" } | null>(defaultSort ?? null);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.id === sort.id);
    if (!col?.sort) return rows;
    const get = col.sort;
    return [...rows].sort((a, b) => {
      const va = get(a);
      const vb = get(b);
      if (va === null && vb === null) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [rows, columns, sort]);

  const hasFooter = columns.some((c) => c.total !== undefined);
  const scrolls = rows.length > visibleRows;
  const maxHeight = HEADER_PX + visibleRows * ROW_PX + (hasFooter ? FOOTER_PX : 0);

  const toggle = (c: Column<R>) => {
    if (!c.sort) return;
    setSort((s) =>
      s?.id !== c.id
        ? { id: c.id, dir: c.align === "right" ? "desc" : "asc" }
        : s.dir === "desc"
          ? { id: c.id, dir: "asc" }
          : { id: c.id, dir: "desc" },
    );
  };

  if (rows.length === 0) {
    return <div className="flex h-28 items-center justify-center border border-dashed border-gray-200 text-sm text-gray-500">{emptyText}</div>;
  }

  return (
    <div>
      <div className="overflow-auto border border-gray-200" style={scrolls ? { maxHeight } : undefined}>
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-white text-[11px] uppercase tracking-wide text-gray-500 shadow-[inset_0_-1px_0_#e5e7eb]">
            <tr>
              {columns.map((c) => {
                const dir = sort?.id === c.id ? sort.dir : null;
                return (
                  <th key={c.id} className={`whitespace-nowrap px-3 py-2.5 font-semibold ${c.className ?? ""}`} title={c.headerTitle}>
                    <button
                      type="button"
                      onClick={() => toggle(c)}
                      disabled={!c.sort}
                      className={`flex w-full items-center gap-1 ${c.align === "right" ? "justify-end" : "justify-start"} ${
                        c.sort ? "hover:text-gray-900" : "cursor-default"
                      } ${dir ? "text-gray-900" : ""}`}
                    >
                      <span>{c.label}</span>
                      {dir === "asc" ? <ArrowUp size={12} /> : dir === "desc" ? <ArrowDown size={12} /> : null}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const key = rowKey(r);
              const active = activeKey === key;
              return (
                <tr
                  key={key}
                  onClick={onRowClick ? () => onRowClick(r) : undefined}
                  className={`border-b border-gray-100 last:border-0 ${onRowClick ? "cursor-pointer hover:bg-gray-50" : ""} ${
                    active ? "bg-yellow-400 hover:bg-yellow-400" : ""
                  }`}
                >
                  {columns.map((c) => (
                    <td
                      key={c.id}
                      className={`whitespace-nowrap px-3 py-2 ${c.align === "right" ? "text-right tabular-nums" : "text-left"} ${c.className ?? ""}`}
                    >
                      {c.render(r)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
          {hasFooter && (
            <tfoot className="sticky bottom-0 z-10 bg-white shadow-[inset_0_2px_0_#111827]">
              <tr className="font-semibold text-gray-900">
                {columns.map((c, i) => (
                  <td key={c.id} className={`whitespace-nowrap px-3 py-2.5 ${c.align === "right" ? "text-right tabular-nums" : "text-left"}`}>
                    {c.total ?? (i === 0 ? (footerLabel ?? "Total") : "")}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {scrolls && <p className="mt-1.5 text-[11px] text-gray-500">{sorted.length.toLocaleString("en-CA")} rows · scroll the table to see them all</p>}
    </div>
  );
}
