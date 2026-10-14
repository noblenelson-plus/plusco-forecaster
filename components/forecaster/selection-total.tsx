// components/forecaster/selection-total.tsx
"use client";

/**
 * Floating "selected cells" box, shared by every forecast axis.
 *
 * Pinned to the bottom-right corner, it shows the count and live sum of the
 * cells in the current selection, and its "Copy cells" button copies the
 * selected cells themselves as a block (the same TSV as Ctrl/Cmd+C), ready to
 * paste into Excel. Hidden until at least two cells are selected — a single
 * cell's total is just its own value.
 */

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { formatMoney } from "../../lib/format/money";

export default function SelectionTotal({
  count,
  sum,
  getCopyText,
}: {
  count: number;
  sum: number;
  /** The selected cells as TSV (useGridSelection().selectionText). */
  getCopyText: () => string;
}) {
  const [copied, setCopied] = useState(false);

  // Only worth showing for a multi-cell selection.
  if (count < 2) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(getCopyText());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API unavailable (e.g. non-secure context) — fail silently;
      // Ctrl/Cmd+C on the grid still works.
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 border border-gray-200 bg-white px-4 py-2 shadow-lg">
      <span className="text-[11px] font-medium uppercase tracking-wider text-gray-400">
        {count} cells
      </span>
      <span
        className="text-sm font-semibold tabular-nums text-gray-800"
        title="Sum of the selected cells"
      >
        Σ {formatMoney(sum)}
      </span>
      <button
        onClick={copy}
        // Don't steal focus from the active cell, so keyboard use continues.
        onMouseDown={(e) => e.preventDefault()}
        title="Copy the selected cells (same as Ctrl+C) — pastes into Excel as a block"
        aria-label="Copy the selected cells to the clipboard"
        className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-indigo-600 transition-colors hover:bg-gray-100"
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
        {copied ? "Copied" : "Copy cells"}
      </button>
    </div>
  );
}
