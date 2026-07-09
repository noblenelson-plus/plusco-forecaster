// components/forecaster/selection-total.tsx
"use client";

/**
 * Floating "selected cells total" widget, shared by every forecast axis.
 *
 * Pinned to the bottom-right corner, it shows the live sum (and count) of the
 * cells in the current selection and copies that total to the clipboard in one
 * click. Hidden until at least two cells are selected — a single cell's total
 * is just its own value.
 */

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { formatMoney } from "../../lib/format/money";

export default function SelectionTotal({
  count,
  sum,
}: {
  count: number;
  sum: number;
}) {
  const [copied, setCopied] = useState(false);

  // Only worth showing for a multi-cell selection.
  if (count < 2) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(String(Math.round(sum)));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API unavailable (e.g. non-secure context) — fail silently.
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-full border border-gray-200 bg-white/95 px-4 py-2 shadow-lg backdrop-blur">
      <span className="text-[11px] font-medium uppercase tracking-wider text-gray-400">
        {count} cells
      </span>
      <span className="text-sm font-semibold tabular-nums text-gray-800">
        {formatMoney(sum)}
      </span>
      <button
        onClick={copy}
        aria-label="Copy total to clipboard"
        className="flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-indigo-600 transition-colors hover:bg-indigo-50"
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
