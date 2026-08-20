// filepath: app/(protected)/admin/targets/page.tsx
"use client";

/**
 * Admin — Labs Targets. Per-year, admin-editable partner media-spend targets +
 * the Executive Summary goal lines (the source of truth behind the Executive
 * Summary). One year is edited at a time: pick a year (or add one), edit the
 * year-level Labs-share target, the Exec goals, and the partner rows, then Save
 * (upserts the whole year via the service). Mirrors the Currency admin page:
 * non-admins are redirected, data is real-time, writes are validated.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Target,
  Plus,
  Trash2,
  Loader2,
  AlertCircle,
  Check,
  CalendarPlus,
} from "lucide-react";
import { useUserProfile } from "../../../../lib/hooks/use-user-profile";
import PageHeader from "../../../../components/_shared/page-header";
import {
  DEAL_TYPES,
  type DealType,
  type ExecGoals,
  type PartnerTarget,
  type PartnerTargetsYear,
} from "../../../../lib/types/partner-targets.types";
import {
  subscribeToPartnerTargets,
  setPartnerTargetsForYear,
  deletePartnerTargetsYear,
  getPartnerTargetsForYear,
  emptyPartnerTargetsYear,
  makePartnerRow,
} from "../../../../lib/services/partner-targets-service";

/** Deep clone via JSON — the data is plain (no dates/functions). */
function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T;
}

/** 9000000 → "$9,000,000"; null → "$0". */
function money(v: number): string {
  return `$${Math.round(v).toLocaleString("en-CA")}`;
}

export default function AdminTargetsPage() {
  const { isAdmin, loading: profileLoading } = useUserProfile();
  const router = useRouter();

  const [years, setYears] = useState<PartnerTargetsYear[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [draftYears, setDraftYears] = useState<number[]>([]);
  const [draft, setDraft] = useState<PartnerTargetsYear | null>(null);
  const [baseline, setBaseline] = useState("");

  const [saving, setSaving] = useState(false);
  const [confirmDeleteYear, setConfirmDeleteYear] = useState(false);

  const [showAddYear, setShowAddYear] = useState(false);
  const [newYear, setNewYear] = useState<number>(new Date().getFullYear());

  // Guard — redirect non-admins.
  useEffect(() => {
    if (!profileLoading && !isAdmin) router.replace("/");
  }, [isAdmin, profileLoading, router]);

  // Real-time subscription.
  useEffect(() => {
    if (!isAdmin) return;
    const unsubscribe = subscribeToPartnerTargets(
      (data) => {
        setYears(data);
        setLoading(false);
      },
      (err) => {
        setError("Failed to load targets: " + err.message);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, [isAdmin]);

  // Union of persisted + draft years, newest first.
  const availableYears = useMemo(() => {
    const set = new Set<number>([...years.map((y) => y.year), ...draftYears]);
    return Array.from(set).sort((a, b) => b - a);
  }, [years, draftYears]);

  // Default the selected year once data is available.
  useEffect(() => {
    if (selectedYear == null && availableYears.length > 0) {
      setSelectedYear(availableYears[0]);
    }
  }, [availableYears, selectedYear]);

  // Sync the editable draft from the persisted year. Re-syncs on year change and
  // on external writes; local edits are safe because no snapshot fires while
  // editing (nothing writes until Save).
  const persisted = useMemo(
    () =>
      selectedYear == null
        ? null
        : getPartnerTargetsForYear(years, selectedYear) ??
          emptyPartnerTargetsYear(selectedYear),
    [years, selectedYear]
  );

  useEffect(() => {
    if (!persisted) {
      setDraft(null);
      setBaseline("");
      return;
    }
    setDraft(clone(persisted));
    setBaseline(JSON.stringify(persisted));
  }, [persisted]);

  const dirty = draft != null && JSON.stringify(draft) !== baseline;

  // Derived: the total Labs target (every "Labs*" deal type), previewing what
  // the Executive Summary will read.
  const labsTarget = useMemo(
    () =>
      (draft?.partners ?? [])
        .filter((p) => p.dealType.startsWith("Labs"))
        .reduce((acc, p) => acc + (p.mediaSpendTarget ?? 0), 0),
    [draft]
  );

  // ── Draft editing ──────────────────────────────────────────────────────────
  function patchDraft(patch: Partial<PartnerTargetsYear>) {
    setDraft((d) => (d ? { ...d, ...patch } : d));
  }
  function patchGoals(patch: Partial<ExecGoals>) {
    setDraft((d) =>
      d ? { ...d, execGoals: { ...d.execGoals, ...patch } } : d
    );
  }
  function updateRow(id: string, patch: Partial<PartnerTarget>) {
    setDraft((d) =>
      d
        ? {
            ...d,
            partners: d.partners.map((p) =>
              p.id === id ? { ...p, ...patch } : p
            ),
          }
        : d
    );
  }
  function addRow() {
    setDraft((d) => (d ? { ...d, partners: [...d.partners, makePartnerRow()] } : d));
  }
  function deleteRow(id: string) {
    setDraft((d) =>
      d ? { ...d, partners: d.partners.filter((p) => p.id !== id) } : d
    );
  }

  // ── Year actions ─────────────────────────────────────────────────────────────
  function handleAddYear() {
    if (!newYear || newYear < 2020 || newYear > 2100) {
      setError("Year must be between 2020 and 2100.");
      return;
    }
    if (!availableYears.includes(newYear)) {
      setDraftYears((prev) => [...prev, newYear]);
    }
    setError("");
    setShowAddYear(false);
    setSelectedYear(newYear);
  }

  async function handleSave() {
    if (!draft) return;
    setError("");
    setSaving(true);
    try {
      await setPartnerTargetsForYear(draft);
      setDraftYears((prev) => prev.filter((y) => y !== draft.year));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save targets.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteYear() {
    if (selectedYear == null) return;
    setError("");
    try {
      if (years.some((y) => y.year === selectedYear)) {
        await deletePartnerTargetsYear(selectedYear);
      }
      setDraftYears((prev) => prev.filter((y) => y !== selectedYear));
      setConfirmDeleteYear(false);
      setSelectedYear(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete year.");
    }
  }

  if (profileLoading) return null;
  if (!isAdmin) return null;

  const sharePct =
    draft?.totalLabsShareOfMediaTarget != null
      ? String(Math.round(draft.totalLabsShareOfMediaTarget * 1000) / 10)
      : "";

  return (
    <div>
      <PageHeader
        title="Labs Targets"
        description="Per-year partner media-spend targets that drive the Executive Summary goals."
        actions={
          <div className="flex items-center gap-2">
            {availableYears.length > 0 && (
              <select
                value={selectedYear ?? ""}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-yellow-400"
              >
                {availableYears.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            )}
            <button
              onClick={() => setShowAddYear((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-900 bg-yellow-400 rounded-lg hover:bg-yellow-500 transition-colors"
            >
              <CalendarPlus size={14} />
              Add year
            </button>
          </div>
        }
      />

      <div className="p-6 max-w-5xl mx-auto">
        {error && (
          <div className="flex items-center gap-2 bg-red-500 border border-red-500 text-white px-4 py-3 rounded-lg mb-4 text-sm">
            <AlertCircle size={16} className="flex-shrink-0" />
            {error}
          </div>
        )}

        {showAddYear && (
          <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              New year
            </p>
            <div className="flex items-end gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Year
                </label>
                <input
                  type="number"
                  value={newYear}
                  min={2020}
                  max={2100}
                  onChange={(e) => setNewYear(Number(e.target.value))}
                  className="w-28 px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
                />
              </div>
              <button
                onClick={handleAddYear}
                className="px-4 py-2 text-sm font-medium text-gray-900 bg-yellow-400 rounded-lg hover:bg-yellow-500 transition-colors"
              >
                Add
              </button>
              <button
                onClick={() => setShowAddYear(false)}
                className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-3">
              Add the year, then enter its targets below and click Save.
            </p>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-24 gap-2 text-gray-400">
            <Loader2 size={18} className="animate-spin" />
            <span className="text-sm">Loading targets...</span>
          </div>
        ) : selectedYear == null || draft == null ? (
          <div className="flex flex-col items-center justify-center py-24 text-gray-400">
            <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
              <Target size={24} className="opacity-40" />
            </div>
            <p className="text-sm font-medium text-gray-500">No targets yet</p>
            <p className="text-xs text-gray-400 mt-1">
              Use &ldquo;Add year&rdquo; above to set your first year of targets.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Year-level target + derived Labs total */}
            <div className="bg-white border border-gray-200 rounded-xl p-5 flex flex-wrap items-end justify-between gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Total Labs Share of Media Target
                </label>
                <div className="flex items-center gap-1.5 text-sm text-gray-500">
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={sharePct}
                    onChange={(e) => {
                      const v = e.target.value.trim();
                      patchDraft({
                        totalLabsShareOfMediaTarget:
                          v === "" ? null : Number(v) / 100,
                      });
                    }}
                    placeholder="25"
                    className="w-24 px-2.5 py-1.5 text-sm text-right border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
                  />
                  <span>%</span>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs font-medium text-gray-500">
                  Total Labs target (derived)
                </p>
                <p className="text-lg font-bold tabular-nums text-gray-900">
                  {money(labsTarget)}
                </p>
                <p className="text-xs text-gray-400">
                  Sum of every &ldquo;Labs&rdquo; deal-type target
                </p>
              </div>
            </div>

            {/* Executive Summary goals */}
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
                Executive Summary goals
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Labs spend goal
                  </label>
                  <div className="flex items-center gap-1.5 text-sm text-gray-500">
                    <span>$</span>
                    <input
                      type="number"
                      min="0"
                      step="100000"
                      value={
                        draft.execGoals.labsSpend == null
                          ? ""
                          : String(draft.execGoals.labsSpend)
                      }
                      onChange={(e) => {
                        const v = e.target.value.trim();
                        patchGoals({ labsSpend: v === "" ? null : Number(v) });
                      }}
                      placeholder="116500000"
                      className="w-full px-2.5 py-1.5 text-sm text-right border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Meta spend goal (ceiling)
                  </label>
                  <div className="flex items-center gap-1.5 text-sm text-gray-500">
                    <span>&lt; $</span>
                    <input
                      type="number"
                      min="0"
                      step="100000"
                      value={
                        draft.execGoals.metaSpend == null
                          ? ""
                          : String(draft.execGoals.metaSpend)
                      }
                      onChange={(e) => {
                        const v = e.target.value.trim();
                        patchGoals({ metaSpend: v === "" ? null : Number(v) });
                      }}
                      placeholder="32000000"
                      className="w-full px-2.5 py-1.5 text-sm text-right border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Meta share of social goal
                  </label>
                  <div className="flex items-center gap-1.5 text-sm text-gray-500">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      value={
                        draft.execGoals.metaShareOfSocial == null
                          ? ""
                          : String(
                              Math.round(
                                draft.execGoals.metaShareOfSocial * 1000
                              ) / 10
                            )
                      }
                      onChange={(e) => {
                        const v = e.target.value.trim();
                        patchGoals({
                          metaShareOfSocial: v === "" ? null : Number(v) / 100,
                        });
                      }}
                      placeholder="49"
                      className="w-full px-2.5 py-1.5 text-sm text-right border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
                    />
                    <span>%</span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Billups share goal
                  </label>
                  <div className="flex items-center gap-1.5 text-sm text-gray-500">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      value={
                        draft.execGoals.billupsShare == null
                          ? ""
                          : String(
                              Math.round(draft.execGoals.billupsShare * 1000) / 10
                            )
                      }
                      onChange={(e) => {
                        const v = e.target.value.trim();
                        patchGoals({
                          billupsShare: v === "" ? null : Number(v) / 100,
                        });
                      }}
                      placeholder="100"
                      className="w-full px-2.5 py-1.5 text-sm text-right border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
                    />
                    <span>%</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Partner rows */}
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
                    <th className="px-3 py-2.5 text-left font-medium">Partner</th>
                    <th className="px-3 py-2.5 text-left font-medium">Deal Type</th>
                    <th className="px-3 py-2.5 text-center font-medium">
                      In Labs Forecaster 2.0?
                    </th>
                    <th className="px-3 py-2.5 text-right font-medium">
                      Media Spend Target
                    </th>
                    <th className="px-3 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {draft.partners.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-3 py-8 text-center text-sm text-gray-400"
                      >
                        No partners yet — add a row below.
                      </td>
                    </tr>
                  ) : (
                    draft.partners.map((p) => (
                      <tr
                        key={p.id}
                        className="border-b border-gray-100 hover:bg-gray-50"
                      >
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={p.partner}
                            onChange={(e) =>
                              updateRow(p.id, { partner: e.target.value })
                            }
                            placeholder="Partner name"
                            className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={p.dealType}
                            onChange={(e) =>
                              updateRow(p.id, {
                                dealType: e.target.value as DealType,
                              })
                            }
                            className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-yellow-400"
                          >
                            {DEAL_TYPES.map((dt) => (
                              <option key={dt} value={dt}>
                                {dt}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={p.inLabsForecaster2}
                            onChange={(e) =>
                              updateRow(p.id, {
                                inLabsForecaster2: e.target.checked,
                              })
                            }
                            className="h-4 w-4 accent-yellow-400"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min="0"
                            step="1000"
                            value={
                              p.mediaSpendTarget == null
                                ? ""
                                : String(p.mediaSpendTarget)
                            }
                            onChange={(e) => {
                              const v = e.target.value.trim();
                              updateRow(p.id, {
                                mediaSpendTarget: v === "" ? null : Number(v),
                              });
                            }}
                            placeholder="—"
                            className="w-36 px-2.5 py-1.5 text-sm text-right border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            onClick={() => deleteRow(p.id)}
                            className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-gray-100 transition-colors"
                            title="Remove partner"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>

              <div className="border-t border-gray-100 px-3 py-2">
                <button
                  onClick={addRow}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 hover:text-gray-900"
                >
                  <Plus size={14} />
                  Add partner
                </button>
              </div>
            </div>

            {/* Save / delete row */}
            <div className="flex items-center justify-between gap-3">
              <div>
                {confirmDeleteYear ? (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-500">
                      Delete all {selectedYear} targets?
                    </span>
                    <button
                      onClick={handleDeleteYear}
                      className="px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700 transition-colors"
                    >
                      Yes, remove
                    </button>
                    <button
                      onClick={() => setConfirmDeleteYear(false)}
                      className="px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDeleteYear(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-500 hover:text-red-500"
                  >
                    <Trash2 size={14} />
                    Delete year
                  </button>
                )}
              </div>

              <div className="flex items-center gap-3">
                {dirty && (
                  <span className="text-xs text-gray-400">Unsaved changes</span>
                )}
                <button
                  onClick={handleSave}
                  disabled={!dirty || saving}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-900 bg-yellow-400 rounded-lg hover:bg-yellow-500 disabled:opacity-40 transition-colors"
                >
                  {saving ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Check size={14} />
                  )}
                  Save {selectedYear}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
