// components/forecaster/product-grid.tsx
"use client";

/**
 * Product axis grid — always-on product tracking for the selected client.
 *
 * No year/RFQ context and no monthly values: one row per catalog product, one
 * column per pipeline status. Clicking a status cell selects it (clicking the
 * active one clears it). Statuses on the revenue path (everything except
 * Rejected) may optionally carry a timing — the month revenue is expected to
 * start. Each product also has a free-text note (NoteCell/NoteDialog, same as
 * the grid axes), which may exist without a status. Saves like the other
 * axes: debounced autosave (with leave-flush) plus the manual Save/Discard
 * buttons.
 */

import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, Package, RotateCcw } from "lucide-react";
import {
  PRODUCTS,
  PRODUCT_STATUS_LABELS,
  PRODUCT_STATUS_ORDER,
  statusAllowsTiming,
  type ProductEntry,
  type ProductStatus,
  type ProductTrackingMap,
} from "../../lib/types/product.types";
import {
  saveProductTracking,
  subscribeToProductTracking,
} from "../../lib/services/product-tracking-service";
import { useAutosave } from "../../lib/hooks/use-autosave";
import SaveStatusIndicator from "./save-status";
import { NoteCell } from "./forecast-grid";
import NoteDialog from "./note-dialog";

// Per-status colors — selected chip + its dot (idle chips share a gray style).
const STATUS_THEME: Record<ProductStatus, { selected: string; dot: string }> = {
  IDENTIFIED_PROSPECT: {
    selected: "border-blue-300 bg-blue-50 text-blue-700",
    dot: "bg-blue-500",
  },
  PITCHED_TO_CLIENT: {
    selected: "border-amber-300 bg-amber-50 text-amber-700",
    dot: "bg-amber-500",
  },
  APPROVED: {
    selected: "border-emerald-300 bg-emerald-50 text-emerald-700",
    dot: "bg-emerald-500",
  },
  REJECTED: {
    selected: "border-red-300 bg-red-50 text-red-700",
    dot: "bg-red-500",
  },
};

/**
 * Loaded grid state, updated atomically: the live Firestore snapshot, the
 * local working copy, and the doc's last-updated stamp. `null` while the
 * first snapshot for the current client is in flight.
 */
interface GridState {
  snapshot: ProductTrackingMap;
  working: ProductTrackingMap;
  lastUpdated: string | null;
}

interface ProductGridProps {
  clientId: string;
}

export default function ProductGrid({ clientId }: ProductGridProps) {
  const [state, setState] = useState<GridState | null>(null);
  const [saving, setSaving] = useState(false);
  // Load and save failures are tracked separately: a load failure replaces the
  // grid with a banner, while a save failure keeps the (dirty) grid editable
  // and drives the autosave indicator's "error" state.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Reset when the selected client changes — render-time state adjustment
  // (avoids a setState-in-effect cascade); the effect below resubscribes.
  const [loadedFor, setLoadedFor] = useState(clientId);
  if (loadedFor !== clientId) {
    setLoadedFor(clientId);
    setState(null);
    setLoadError(null);
    setSaveError(null);
  }

  useEffect(() => {
    const unsubscribe = subscribeToProductTracking(
      clientId,
      (data) => {
        const remote = data?.products ?? {};
        // Follow the remote copy unless local edits are pending, so a
        // concurrent write never clobbers in-progress changes.
        setState((prev) => ({
          snapshot: remote,
          working:
            prev !== null && !sameMap(prev.working, prev.snapshot)
              ? prev.working
              : remote,
          lastUpdated: data?.updatedAt ?? null,
        }));
      },
      (err) => {
        console.error("Product tracking subscription failed:", err);
        setLoadError("Failed to load product tracking.");
      }
    );
    return () => unsubscribe();
  }, [clientId]);

  const hasChanges = state !== null && !sameMap(state.working, state.snapshot);
  const dirtyCount = useMemo(
    () => (state ? countChangedProducts(state.working, state.snapshot) : 0),
    [state]
  );

  const updateWorking = (
    fn: (working: ProductTrackingMap) => ProductTrackingMap
  ) =>
    setState((prev) => (prev ? { ...prev, working: fn(prev.working) } : prev));

  /** Write an entry, dropping empty fields — a fully empty entry loses its key. */
  const putEntry = (
    working: ProductTrackingMap,
    productId: string,
    entry: ProductEntry
  ): ProductTrackingMap => {
    const clean: ProductEntry = {
      ...(entry.status ? { status: entry.status } : {}),
      ...(entry.timing ? { timing: entry.timing } : {}),
      ...(entry.note ? { note: entry.note } : {}),
    };
    const next = { ...working };
    if (Object.keys(clean).length === 0) delete next[productId];
    else next[productId] = clean;
    return next;
  };

  const setStatus = (productId: string, status: ProductStatus) =>
    updateWorking((working) => {
      const current = working[productId];
      // Clicking the active status clears it (the note survives); timing
      // survives a status change only where it still applies.
      const nextStatus = current?.status === status ? undefined : status;
      return putEntry(working, productId, {
        status: nextStatus,
        timing:
          nextStatus && statusAllowsTiming(nextStatus)
            ? current?.timing
            : undefined,
        note: current?.note,
      });
    });

  const setTiming = (productId: string, timing: string) =>
    updateWorking((working) => {
      const current = working[productId];
      if (!current) return working;
      return putEntry(working, productId, { ...current, timing });
    });

  const setNote = (productId: string, note: string) =>
    updateWorking((working) =>
      putEntry(working, productId, {
        ...working[productId],
        note: note.trim(),
      })
    );

  const discard = () =>
    setState((prev) => (prev ? { ...prev, working: prev.snapshot } : prev));

  // Product whose note dialog is open (null = closed).
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const noteProduct = PRODUCTS.find((p) => p.productId === noteFor);

  const save = async () => {
    if (!state || !hasChanges) return;
    setSaving(true);
    setSaveError(null);
    try {
      await saveProductTracking(clientId, state.working);
    } catch (err) {
      console.error("Product tracking save failed:", err);
      setSaveError("Save failed — please try again.");
    } finally {
      setSaving(false);
    }
  };

  // Debounced autosave + leave-guards, same behavior as the grid axes: edits
  // persist on their own after a short pause; Save forces an immediate write.
  const { status: saveStatus } = useAutosave({
    hasChanges,
    saving,
    error: !!saveError,
    save,
  });

  if (state === null && !loadError) {
    return (
      <div className="flex items-center justify-center py-24 bg-white border border-gray-200 rounded-xl text-gray-400">
        <Loader2 size={20} className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ─── Toolbar ─── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-xs text-gray-400">
          <span className="flex items-center gap-1.5 px-3 py-2 font-medium rounded-lg bg-gray-50 text-gray-500 border border-gray-200">
            <Package size={12} />
            Always on — not tied to a year or submission
          </span>
          {state?.lastUpdated && (
            <span>
              Last updated{" "}
              {new Date(state.lastUpdated).toLocaleDateString("en-CA", {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <SaveStatusIndicator status={saveStatus} />
          {hasChanges && (
            <button
              onClick={discard}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 transition-colors"
              title="Discard unsaved changes"
            >
              <RotateCcw size={13} />
              Discard
            </button>
          )}
          <button
            onClick={save}
            disabled={!hasChanges || saving}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-900 bg-yellow-400 rounded-lg hover:bg-yellow-500 disabled:opacity-50 transition-colors"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            Save
            {hasChanges && (
              <span className="px-1.5 py-0.5 rounded-md bg-gray-900 text-yellow-400 text-[10px] font-bold">
                {dirtyCount > 0 ? dirtyCount : "•"}
              </span>
            )}
          </button>
        </div>
      </div>

      {(loadError || saveError) && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {loadError ?? saveError}
        </div>
      )}

      {/* ─── Grid ─── */}
      {state && (
        <div className="overflow-x-auto bg-white border border-gray-200 rounded-xl">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Product
                </th>
                {PRODUCT_STATUS_ORDER.map((status) => (
                  <th
                    key={status}
                    className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide"
                  >
                    {PRODUCT_STATUS_LABELS[status]}
                  </th>
                ))}
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide w-44">
                  Timing
                  <span
                    className="ml-1 normal-case font-normal text-gray-400"
                    title="Month revenue is expected to start (optional)"
                  >
                    (revenue start)
                  </span>
                </th>
                <th className="px-2 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide w-56">
                  Notes
                </th>
              </tr>
            </thead>
            <tbody>
              {PRODUCTS.map((product) => {
                const entry = state.working[product.productId];
                const timingEnabled = statusAllowsTiming(entry?.status ?? null);
                return (
                  <tr
                    key={product.productId}
                    className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50/50"
                  >
                    <td className="px-4 py-2.5 font-medium text-gray-800 whitespace-nowrap">
                      {product.name}
                    </td>
                    {PRODUCT_STATUS_ORDER.map((status) => {
                      const selected = entry?.status === status;
                      const theme = STATUS_THEME[status];
                      return (
                        <td key={status} className="px-3 py-2.5 text-center">
                          <button
                            type="button"
                            onClick={() => setStatus(product.productId, status)}
                            aria-pressed={selected}
                            title={
                              selected
                                ? `Clear ${PRODUCT_STATUS_LABELS[status]}`
                                : `Set ${PRODUCT_STATUS_LABELS[status]}`
                            }
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                              selected
                                ? theme.selected
                                : "border-gray-200 bg-white text-gray-400 hover:border-gray-300 hover:text-gray-600"
                            }`}
                          >
                            {selected ? (
                              <Check size={12} />
                            ) : (
                              <span className="w-2 h-2 rounded-full bg-gray-200" />
                            )}
                            {selected ? PRODUCT_STATUS_LABELS[status] : "—"}
                          </button>
                        </td>
                      );
                    })}
                    <td className="px-4 py-2.5">
                      <input
                        type="month"
                        value={timingEnabled ? entry?.timing ?? "" : ""}
                        disabled={!timingEnabled}
                        onChange={(e) =>
                          setTiming(product.productId, e.target.value)
                        }
                        title={
                          timingEnabled
                            ? "Month revenue is expected to start (optional)"
                            : "Set a status (other than Rejected) to add a timing"
                        }
                        className="w-40 px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-yellow-400 disabled:bg-gray-50 disabled:text-gray-300 disabled:cursor-not-allowed"
                      />
                    </td>
                    <NoteCell
                      note={entry?.note}
                      readOnly={false}
                      onClick={() => setNoteFor(product.productId)}
                    />
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Note dialog — edits the working copy; persisted by the autosave. */}
      {noteFor && noteProduct && state && (
        <NoteDialog
          rowLabel={noteProduct.name}
          note={state.working[noteFor]?.note ?? ""}
          onSave={(note) => setNote(noteFor, note)}
          onClose={() => setNoteFor(null)}
        />
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sameEntry(a?: ProductEntry, b?: ProductEntry): boolean {
  if (!a || !b) return !a && !b;
  return (
    a.status === b.status &&
    (a.timing ?? "") === (b.timing ?? "") &&
    (a.note ?? "") === (b.note ?? "")
  );
}

/** Deep equality on two product maps (small, so key-wise compare is fine). */
function sameMap(a: ProductTrackingMap, b: ProductTrackingMap): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    if (!sameEntry(a[k], b[k])) return false;
  }
  return true;
}

/** Number of products whose entry differs between the working copy and snapshot. */
function countChangedProducts(
  a: ProductTrackingMap,
  b: ProductTrackingMap
): number {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let count = 0;
  for (const k of keys) {
    if (!sameEntry(a[k], b[k])) count++;
  }
  return count;
}
