// components/clients/commissions-drawer.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import {
  X,
  Loader2,
  Percent,
  ChevronDown,
  ChevronRight,
  Copy,
  AlertTriangle,
} from "lucide-react";
import { Client, CommissionsConfig } from "../../lib/types/client.types";
import {
  MediaType,
  MonthlyMap,
  MEDIA_TYPES,
  MONTHS,
} from "../../lib/types/common.types";
import {
  uniformRate,
  detectUniformRate,
  copyYearConfig,
  validateYearConfig,
  saveYearCommissions,
} from "../../lib/services/commission-service";
import { propagateCommissionForYear } from "../../lib/services/data-entry-service";

interface CommissionsDrawerProps {
  open: boolean;
  client: Client | null;
  onClose: () => void;
  /** Callback après Save — renvoie la config complète mise à jour */
  onSaved: (clId: string, config: CommissionsConfig) => void;
}

const MEDIA_LABELS: Record<MediaType, string> = {
  social: "Social",
  programmatic: "Programmatic",
  ooh: "OOH",
  print: "Print",
  tv: "TV",
  radio: "Radio",
  sem: "SEM",
  digitalDirect: "Digital Direct",
};

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// Années proposées dans le sélecteur : année courante −1 → +2
function yearOptions(): number[] {
  const current = new Date().getFullYear();
  return [current - 1, current, current + 1, current + 2];
}

// État d'édition d'une rangée média
interface RowState {
  enabled: boolean;        // type configuré pour l'année ?
  expanded: boolean;       // mode mensuel déplié ?
  uniform: string;         // valeur du champ unique (string pour l'input)
  months: MonthlyMap;      // valeurs mensuelles
}

function buildRows(
  config: CommissionsConfig,
  year: number
): Record<MediaType, RowState> {
  const yearConfig = config?.[year] ?? {};
  const rows = {} as Record<MediaType, RowState>;
  MEDIA_TYPES.forEach((type) => {
    const map = yearConfig[type];
    if (!map) {
      rows[type] = {
        enabled: false,
        expanded: false,
        uniform: "0",
        months: uniformRate(0),
      };
    } else {
      const uniform = detectUniformRate(map);
      rows[type] = {
        enabled: true,
        expanded: uniform === null, // mensuel non-uniforme → déplié d'office
        uniform: String(uniform ?? map[1] ?? 0),
        months: { ...map },
      };
    }
  });
  return rows;
}

/**
 * Drawer de configuration des commissions d'un client.
 *
 * — Sélecteur d'année + "Copy from previous year"
 * — Une rangée par type de média : toggle on/off, champ % unique
 *   (cas courant), bouton déplier → 12 champs mensuels
 * — Un seul Save par année (saveYearCommissions)
 * — Accessible aux admins ET aux BLs assignés au client
 */
export default function CommissionsDrawer({
  open,
  client,
  onClose,
  onSaved,
}: CommissionsDrawerProps) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [rows, setRows] = useState<Record<MediaType, RowState>>(() =>
    buildRows({}, year)
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // (Ré)initialiser les rangées quand le client, l'année ou l'ouverture change
  useEffect(() => {
    if (!client) return;
    setRows(buildRows(client.commissionsConfig ?? {}, year));
    setError("");
  }, [client, year, open]);

  const enabledCount = useMemo(
    () => MEDIA_TYPES.filter((t) => rows[t]?.enabled).length,
    [rows]
  );

  const previousYearHasConfig =
    !!client &&
    Object.keys(client.commissionsConfig?.[year - 1] ?? {}).length > 0;

  // ─── Mutations locales ──────────────────────────────────────────────────────

  function updateRow(type: MediaType, patch: Partial<RowState>) {
    setRows((prev) => ({ ...prev, [type]: { ...prev[type], ...patch } }));
  }

  function toggleEnabled(type: MediaType) {
    const row = rows[type];
    updateRow(type, { enabled: !row.enabled });
  }

  function setUniform(type: MediaType, value: string) {
    const num = parseFloat(value);
    updateRow(type, {
      uniform: value,
      months: uniformRate(Number.isNaN(num) ? 0 : num),
    });
  }

  function setMonth(type: MediaType, month: number, value: string) {
    const num = parseFloat(value);
    const row = rows[type];
    updateRow(type, {
      months: { ...row.months, [month]: Number.isNaN(num) ? 0 : num },
    });
  }

  function toggleExpanded(type: MediaType) {
    const row = rows[type];
    if (row.expanded) {
      // Replier : on revient au mode uniforme avec la valeur du champ unique
      const num = parseFloat(row.uniform);
      updateRow(type, {
        expanded: false,
        months: uniformRate(Number.isNaN(num) ? 0 : num),
      });
    } else {
      updateRow(type, { expanded: true });
    }
  }

  function handleCopyPreviousYear() {
    if (!client) return;
    const next = copyYearConfig(
      client.commissionsConfig ?? {},
      year - 1,
      year
    );
    setRows(buildRows(next, year));
  }

  // ─── Save ───────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!client) return;

    // Construire la config de l'année à partir des rangées activées
    const yearConfig: Partial<Record<MediaType, MonthlyMap>> = {};
    MEDIA_TYPES.forEach((type) => {
      const row = rows[type];
      if (row.enabled) {
        yearConfig[type] = { ...row.months };
      }
    });

    const validationErrors = validateYearConfig(yearConfig);
    if (validationErrors.length > 0) {
      const first = validationErrors[0];
      setError(
        `${MEDIA_LABELS[first.mediaType]} — ${MONTH_LABELS[first.month - 1]}: ${first.reason}`
      );
      return;
    }

    setSaving(true);
    setError("");
    try {
      await saveYearCommissions(client.cl_id, year, yearConfig);
      // Re-sync the derived Revenue commission across every (unlocked) RFQ of
      // the year so Firestore reflects the new rates immediately. Best-effort —
      // a propagation failure must not fail the rate save itself.
      try {
        await propagateCommissionForYear(client.cl_id, year, yearConfig);
      } catch (err) {
        console.error("Commission propagation failed:", err);
      }
      const newConfig: CommissionsConfig = {
        ...(client.commissionsConfig ?? {}),
        [year]: yearConfig,
      };
      onSaved(client.cl_id, newConfig);
    } catch (err: any) {
      setError("Failed to save: " + (err?.message ?? "Unknown error"));
      setSaving(false);
    }
  }

  if (!client) return null;

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
          onClick={onClose}
        />
      )}

      <div
        className={`
          fixed top-0 right-0 z-50 h-full w-full max-w-2xl bg-white shadow-2xl
          flex flex-col transform transition-transform duration-250 ease-in-out
          ${open ? "translate-x-0" : "translate-x-full"}
        `}
      >
        {/* Header — bandeau sombre */}
        <div className="bg-gray-900 px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-yellow-400 flex items-center justify-center text-gray-900 flex-shrink-0">
              <Percent size={18} strokeWidth={2.5} />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-white truncate">
                Commissions — {client.CL_Name}
              </h2>
              <p className="text-xs text-gray-400">
                {enabledCount} media type{enabledCount !== 1 ? "s" : ""} configured for {year}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-800 hover:text-white transition-colors flex-shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        {/* Toolbar — année + copie */}
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/60 flex items-center justify-between gap-3">
          <div className="relative">
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="appearance-none pl-3 pr-8 py-2 text-sm font-medium border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-yellow-400 cursor-pointer"
            >
              {yearOptions().map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <ChevronDown
              size={13}
              className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400"
            />
          </div>

          <button
            type="button"
            onClick={handleCopyPreviousYear}
            disabled={!previousYearHasConfig}
            title={
              previousYearHasConfig
                ? `Copy rates from ${year - 1}`
                : `No configuration found for ${year - 1}`
            }
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-yellow-300 bg-yellow-50 text-yellow-800 hover:bg-yellow-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Copy size={12} />
            Copy from {year - 1}
          </button>
        </div>

        {/* Erreur */}
        {error && (
          <div className="mx-6 mt-3 flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">
            <AlertTriangle size={14} className="flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Rangées média */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
          {MEDIA_TYPES.map((type) => {
            const row = rows[type];
            if (!row) return null;

            return (
              <div
                key={type}
                className={`
                  rounded-xl border transition-colors
                  ${row.enabled
                    ? "border-yellow-300 bg-yellow-50/50"
                    : "border-gray-100 bg-white"
                  }
                `}
              >
                {/* Ligne principale */}
                <div className="flex items-center gap-3 px-4 py-3">
                        {/* Toggle on/off */}
                        <button
                        type="button"
                        onClick={() => toggleEnabled(type)}
                        className={`
                            relative w-9 h-5 rounded-full flex-shrink-0 transition-colors
                            ${row.enabled ? "bg-yellow-400" : "bg-gray-200"}
                        `}
                        title={row.enabled ? "Disable commission" : "Enable commission"}
                        >
                        <span
                            className={`
                            absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow
                            transition-transform duration-150
                            ${row.enabled ? "translate-x-4" : "translate-x-0"}
                            `}
                        />
                        </button>

                  {/* Nom du type */}
                  <span
                    className={`text-sm font-medium flex-1 ${
                      row.enabled ? "text-gray-900" : "text-gray-400"
                    }`}
                  >
                    {MEDIA_LABELS[type]}
                  </span>

                  {row.enabled && (
                    <>
                      {/* Champ uniforme — masqué si déplié */}
                      {!row.expanded && (
                        <div className="relative w-24">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step={0.1}
                            value={row.uniform}
                            onChange={(e) => setUniform(type, e.target.value)}
                            className="w-full pl-3 pr-7 py-1.5 text-sm text-right border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
                          />
                          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                            %
                          </span>
                        </div>
                      )}

                      {/* Toggle mensuel */}
                      <button
                        type="button"
                        onClick={() => toggleExpanded(type)}
                        className="flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
                      >
                        {row.expanded ? (
                          <>
                            <ChevronDown size={13} />
                            Monthly
                          </>
                        ) : (
                          <>
                            <ChevronRight size={13} />
                            Monthly
                          </>
                        )}
                      </button>
                    </>
                  )}
                </div>

                {/* Grille mensuelle dépliée */}
                {row.enabled && row.expanded && (
                  <div className="px-4 pb-4 pt-1 border-t border-yellow-200/60">
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mt-3">
                      {MONTHS.map((m) => (
                        <div key={m}>
                          <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                            {MONTH_LABELS[m - 1]}
                          </label>
                          <div className="relative">
                            <input
                              type="number"
                              min={0}
                              max={100}
                              step={0.1}
                              value={row.months[m] ?? 0}
                              onChange={(e) => setMonth(type, m, e.target.value)}
                              className="w-full pl-2 pr-6 py-1.5 text-sm text-right border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
                            />
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">
                              %
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3 bg-white">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-900 bg-yellow-400 rounded-lg hover:bg-yellow-500 disabled:opacity-50 transition-colors"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            Save {year} rates
          </button>
        </div>
      </div>
    </>
  );
}