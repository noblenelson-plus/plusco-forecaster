// components/bulk-edit/history-panel.tsx
"use client";

/**
 * History side of Bulk Edit: the automatic backups taken before every import
 * and bulk delete, newest first, each undoable. Undo first compares every
 * backed-up section with the live data: sections still holding what the
 * operation wrote are restored; sections edited since are listed as conflicts
 * and skipped unless the admin explicitly chooses to overwrite them.
 */

import { useEffect, useState } from "react";
import {
  History,
  Loader2,
  RotateCcw,
  X,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";
import type { AxisId } from "../../lib/types/forecaster.types";
import type { BulkReference } from "../../lib/services/bulk-import-service";
import {
  type BackupActor,
  type BackupHeader,
  type PreparedUndo,
  type UndoResult,
  type UndoSection,
  listBackups,
  prepareUndo,
  commitUndo,
} from "../../lib/services/bulk-backup-service";

const AXIS_LABELS: Record<AxisId, string> = {
  media: "Media",
  labs: "Labs",
  revenue: "Revenue",
};

function when(iso: string): string {
  return new Date(iso).toLocaleString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function sectionLabel(s: UndoSection): string {
  const where = s.collection === "annual_actuals" ? "MediaOcean" : s.rfq ?? "";
  return `${s.clientName} · ${AXIS_LABELS[s.axisId]} · ${s.year} ${where}`;
}

export default function HistoryPanel({
  reference,
  actor,
  refreshKey,
  onRestored,
}: {
  reference: BulkReference;
  actor: BackupActor;
  /** Bumped by the page after an import / delete so the list reloads. */
  refreshKey: number;
  onRestored: () => void;
}) {
  const [backups, setBackups] = useState<BackupHeader[] | null>(null);
  const [error, setError] = useState("");
  const [reloadNonce, setReloadNonce] = useState(0);
  const [undoing, setUndoing] = useState<BackupHeader | null>(null);

  useEffect(() => {
    let cancelled = false;
    listBackups(15)
      .then((list) => {
        if (!cancelled) {
          setBackups(list);
          setError("");
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load history.");
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey, reloadNonce]);

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <History size={16} /> History &amp; undo
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Every import and bulk delete saves a backup of the sections it changes first. Undo puts them back.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setReloadNonce((n) => n + 1)}
          className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
          title="Refresh"
        >
          <RefreshCw size={15} />
        </button>
      </div>

      {error && (
        <div className="bg-red-500 border border-red-500 text-white px-3 py-2 rounded-lg text-sm">{error}</div>
      )}

      {!backups && !error && (
        <div className="flex items-center gap-2 text-sm text-gray-500 py-4">
          <Loader2 size={14} className="animate-spin" /> Loading history…
        </div>
      )}

      {backups && backups.length === 0 && (
        <p className="text-sm text-gray-400">No bulk operations recorded yet.</p>
      )}

      {backups && backups.length > 0 && (
        <div className="divide-y divide-gray-100 border border-gray-200">
          {backups.map((b) => (
            <div key={b.backupId} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm text-gray-900">
                  <span className="font-semibold">{b.kind === "IMPORT" ? "Import" : "Bulk delete"}</span>
                  {" · "}
                  {when(b.createdAt)}
                  {b.createdByEmail && <span className="text-gray-500"> · {b.createdByEmail}</span>}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {b.clientCount} client{b.clientCount !== 1 ? "s" : ""} · {b.sectionCount} section
                  {b.sectionCount !== 1 ? "s" : ""} · {b.axes.map((a) => AXIS_LABELS[a]).join(", ")} ·{" "}
                  {b.years.join(", ")}
                  {b.errors?.length > 0 && ` · ${b.errors.length} write error(s)`}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <StatusBadge header={b} />
                <button
                  type="button"
                  onClick={() => setUndoing(b)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <RotateCcw size={13} />
                  {b.status === "UNDONE" ? "Review" : "Undo…"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {undoing && (
        <UndoModal
          header={undoing}
          reference={reference}
          actor={actor}
          onClose={() => setUndoing(null)}
          onRestored={() => {
            setReloadNonce((n) => n + 1);
            onRestored();
          }}
        />
      )}
    </div>
  );
}

function StatusBadge({ header }: { header: BackupHeader }) {
  const map = {
    APPLIED: ["Applied", "bg-green-500 text-white"],
    UNDONE: ["Undone", "bg-gray-900 text-white"],
    PENDING: ["Interrupted", "bg-yellow-400 text-gray-900"],
  } as const;
  const [label, cls] = map[header.status];
  return (
    <span
      className={`px-2 py-0.5 text-[11px] font-semibold ${cls}`}
      title={
        header.status === "PENDING"
          ? "The operation stopped before it finished (e.g. the tab was closed). Its backup is intact."
          : undefined
      }
    >
      {label}
    </span>
  );
}

function UndoModal({
  header,
  reference,
  actor,
  onClose,
  onRestored,
}: {
  header: BackupHeader;
  reference: BulkReference;
  actor: BackupActor;
  onClose: () => void;
  onRestored: () => void;
}) {
  const [prepared, setPrepared] = useState<PreparedUndo | null>(null);
  const [loadError, setLoadError] = useState("");
  const [overwrite, setOverwrite] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<UndoResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    prepareUndo(header.backupId)
      .then((p) => !cancelled && setPrepared(p))
      .catch((err) => !cancelled && setLoadError(err instanceof Error ? err.message : "Failed to load backup."));
    return () => {
      cancelled = true;
    };
  }, [header.backupId]);

  const restore = prepared?.sections.filter((s) => s.state === "restore") ?? [];
  const conflicts = prepared?.sections.filter((s) => s.state === "conflict") ?? [];
  const unchanged = prepared?.sections.filter((s) => s.state === "unchanged") ?? [];
  const toRestore = restore.length + (overwrite ? conflicts.length : 0);

  async function handleUndo() {
    if (!prepared) return;
    setBusy(true);
    setError("");
    try {
      const res = await commitUndo(prepared, {
        overwriteConflicts: overwrite,
        actor,
        ratesOf: (clientId, year) => reference.clientsById.get(clientId)?.commissionsConfig?.[year],
      });
      setResult(res);
      onRestored();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Undo failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl flex flex-col max-h-[85vh] pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <h2 className="text-base font-semibold text-gray-900">
              Undo {header.kind === "IMPORT" ? "import" : "bulk delete"} of {when(header.createdAt)}
            </h2>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          <div className="flex-1 min-h-32 overflow-y-auto px-6 py-4 space-y-4">
            {loadError && (
              <div className="bg-red-500 text-white px-3 py-2 rounded-lg text-sm">{loadError}</div>
            )}
            {!prepared && !loadError && (
              <div className="flex items-center gap-2 text-sm text-gray-500 py-6 justify-center">
                <Loader2 size={14} className="animate-spin" /> Comparing the backup with the live data…
              </div>
            )}

            {prepared && result && (
              <div className="flex flex-col items-center text-center py-4">
                {result.errors.length === 0 ? (
                  <CheckCircle2 size={32} className="text-emerald-500 mb-3" />
                ) : (
                  <AlertTriangle size={32} className="text-amber-500 mb-3" />
                )}
                <p className="text-sm font-medium text-gray-900">
                  {result.restored} section{result.restored !== 1 ? "s" : ""} restored
                  {result.skipped > 0 && ` · ${result.skipped} skipped (edited since)`}
                  {result.commissionsRecalculated > 0 &&
                    ` · ${result.commissionsRecalculated} commission re-sync${result.commissionsRecalculated !== 1 ? "s" : ""}`}
                </p>
                {result.errors.map((e, i) => (
                  <p key={i} className="text-xs text-red-700 mt-1">{e}</p>
                ))}
              </div>
            )}

            {prepared && !result && (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <Stat value={restore.length} label="will be restored" desc="Still exactly as the operation left them." />
                  <Stat
                    value={conflicts.length}
                    label="edited since"
                    desc="Changed after the operation — skipped unless you choose to overwrite."
                    warn={conflicts.length > 0}
                  />
                  <Stat value={unchanged.length} label="already restored" desc="Already match the backup — nothing to do." />
                </div>

                {conflicts.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      Edited since the operation
                    </p>
                    <div className="max-h-48 overflow-y-auto border border-gray-200 divide-y divide-gray-100">
                      {conflicts.map((s, i) => (
                        <div key={i} className="px-3 py-1.5 text-xs text-gray-700">
                          {sectionLabel(s)} <span className="text-gray-400">— {s.reason}</span>
                        </div>
                      ))}
                    </div>
                    <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={overwrite}
                        onChange={(e) => setOverwrite(e.target.checked)}
                        className="mt-0.5"
                      />
                      <span>
                        Also restore these — <span className="font-semibold">this discards the edits made since</span>.
                      </span>
                    </label>
                  </div>
                )}

                {restore.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">To restore</p>
                    <div className="max-h-48 overflow-y-auto border border-gray-200 divide-y divide-gray-100">
                      {restore.map((s, i) => (
                        <div key={i} className="px-3 py-1.5 text-xs text-gray-700">{sectionLabel(s)}</div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {error && (
            <div className="mx-6 mb-2 bg-red-500 text-white px-3 py-2 rounded-lg text-sm">{error}</div>
          )}

          <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              {result ? "Close" : "Cancel"}
            </button>
            {prepared && !result && (
              <button
                onClick={handleUndo}
                disabled={busy || toRestore === 0}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-900 bg-yellow-400 rounded-lg hover:bg-yellow-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {busy ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                {busy ? "Restoring…" : `Restore ${toRestore} section${toRestore !== 1 ? "s" : ""}`}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function Stat({ value, label, desc, warn }: { value: number; label: string; desc: string; warn?: boolean }) {
  return (
    <div className={`border px-3 py-2.5 ${warn ? "border-yellow-400 bg-yellow-400" : "border-gray-100 bg-gray-50"}`}>
      <p className="text-sm font-semibold text-gray-900">
        {value} <span className="font-medium">{label}</span>
      </p>
      <p className={`mt-0.5 text-[11px] leading-snug ${warn ? "text-gray-800" : "text-gray-500"}`}>{desc}</p>
    </div>
  );
}
