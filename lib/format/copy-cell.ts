// lib/format/copy-cell.ts

/**
 * Copy a non-editable cell's value to the clipboard and signal the global
 * CopyToast. Used by read-only cells (locked/closed/actuals/totals and the
 * MediaBox section) so a click yields a paste-friendly number.
 */
export function copyCellValue(value: number): void {
  // Trim float residue to at most 2 decimals; integers stay clean (no separators).
  const clean = Math.round(value * 100) / 100;
  const text = String(clean);
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    void navigator.clipboard.writeText(text);
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("forecast-cell-copied", { detail: text }));
  }
}

/** Event name the CopyToast listens to. */
export const CELL_COPIED_EVENT = "forecast-cell-copied";
