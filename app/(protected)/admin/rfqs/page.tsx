// app/(protected)/admin/rfqs/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Lock,
  Unlock,
  Trash2,
  Loader2,
  AlertCircle,
  CalendarRange,
  ChevronDown,
} from "lucide-react";
import { useUserProfile } from "../../../../lib/hooks/use-user-profile";
import {
  RFQ,
  RFQType,
  RFQ_TYPES,
  buildRFQId,
} from "../../../../lib/types/rfq.types";
import {
  subscribeToRFQs,
  createRFQ,
  updateRFQStatus,
  deleteRFQ,
  getRFQYears,
  getRFQsForYear,
} from "../../../../lib/services/rfq-service";
import PageHeader from "../../../../components/_shared/page-header";

export default function AdminRFQsPage() {
  const { isAdmin, loading: profileLoading } = useUserProfile();
  const router = useRouter();

  const [rfqs, setRFQs] = useState<RFQ[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Create form state
  const [showForm, setShowForm] = useState(false);
  const [formYear, setFormYear] = useState(new Date().getFullYear());
  const [formType, setFormType] = useState<RFQType>("RFQ0");
  const [creating, setCreating] = useState(false);

  // Row action state
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Guard — redirect non-admins
  useEffect(() => {
    if (!profileLoading && !isAdmin) {
      router.replace("/");
    }
  }, [isAdmin, profileLoading, router]);

  // Real-time subscription
  useEffect(() => {
    if (!isAdmin) return;
    const unsubscribe = subscribeToRFQs(
      (data) => {
        setRFQs(data);
        setLoading(false);
      },
      (err) => {
        setError("Failed to load RFQs: " + err.message);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, [isAdmin]);

  const years = useMemo(() => getRFQYears(rfqs), [rfqs]);

  // Types not yet created for the selected form year
  const availableTypes = useMemo(() => {
    const existing = new Set(
      getRFQsForYear(rfqs, formYear).map((r) => r.type)
    );
    return RFQ_TYPES.filter((t) => !existing.has(t.value));
  }, [rfqs, formYear]);

  // Keep formType valid when year changes
  useEffect(() => {
    if (!availableTypes.find((t) => t.value === formType)) {
      setFormType(availableTypes[0]?.value ?? "RFQ0");
    }
  }, [availableTypes, formType]);

  async function handleCreate() {
    if (availableTypes.length === 0) return;
    setCreating(true);
    setError("");
    try {
      await createRFQ({ year: formYear, type: formType, status: "UNLOCKED" });
      setShowForm(false);
    } catch (err: any) {
      setError("Failed to create RFQ: " + (err?.message ?? "Unknown error"));
    } finally {
      setCreating(false);
    }
  }

  async function handleToggleStatus(rfq: RFQ) {
    setBusyId(rfq.rfq_id);
    setError("");
    try {
      await updateRFQStatus(
        rfq.rfq_id,
        rfq.status === "LOCKED" ? "UNLOCKED" : "LOCKED"
      );
    } catch (err: any) {
      setError("Failed to update status: " + (err?.message ?? "Unknown error"));
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(rfq_id: string) {
    setBusyId(rfq_id);
    setError("");
    try {
      await deleteRFQ(rfq_id);
      setConfirmDeleteId(null);
    } catch (err: any) {
      setError("Failed to delete RFQ: " + (err?.message ?? "Unknown error"));
    } finally {
      setBusyId(null);
    }
  }

  if (profileLoading) return null;
  if (!isAdmin) return null;

  return (
    <div>
      <PageHeader
        title="RFQs"
        description="Manage forecasting windows — create, lock and unlock RFQs."
        actions={
          <button
            onClick={() => setShowForm((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-900 bg-yellow-400 rounded-lg hover:bg-yellow-500 transition-colors"
          >
            <Plus size={14} />
            Add RFQ
          </button>
        }
      />

      <div className="p-6 max-w-4xl mx-auto">

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">
            <AlertCircle size={16} className="flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Create form */}
        {showForm && (
          <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              New RFQ
            </p>
            <div className="flex flex-wrap items-end gap-3">
              {/* Year */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Year
                </label>
                <input
                  type="number"
                  value={formYear}
                  min={2020}
                  max={2100}
                  onChange={(e) => setFormYear(Number(e.target.value))}
                  className="w-28 px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
                />
              </div>

              {/* Type */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Type
                </label>
                <div className="relative">
                  <select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value as RFQType)}
                    disabled={availableTypes.length === 0}
                    className="w-32 appearance-none px-3 py-2 pr-8 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent cursor-pointer disabled:opacity-50"
                  >
                    {availableTypes.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    size={13}
                    className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400"
                  />
                </div>
              </div>

              {/* Submit */}
              <button
                onClick={handleCreate}
                disabled={creating || availableTypes.length === 0}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-900 bg-yellow-400 rounded-lg hover:bg-yellow-500 disabled:opacity-50 transition-colors"
              >
                {creating && <Loader2 size={14} className="animate-spin" />}
                Create
              </button>

              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>

            {availableTypes.length === 0 && (
              <p className="text-xs text-gray-400 mt-3">
                All RFQ types already exist for {formYear}.
              </p>
            )}
          </div>
        )}

        {/* Loading */}
        {loading ? (
          <div className="flex items-center justify-center py-24 gap-2 text-gray-400">
            <Loader2 size={18} className="animate-spin" />
            <span className="text-sm">Loading RFQs...</span>
          </div>
        ) : rfqs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-gray-400">
            <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
              <CalendarRange size={24} className="opacity-40" />
            </div>
            <p className="text-sm font-medium text-gray-500">No RFQs yet</p>
            <p className="text-xs text-gray-400 mt-1">
              Create your first RFQ using the button above.
            </p>
          </div>
        ) : (
          /* Grouped by year */
          <div className="space-y-8">
            {years.map((year) => (
              <div key={year}>
                <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
                  {year}
                </h2>
                <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden">
                  {getRFQsForYear(rfqs, year).map((rfq) => (
                    <RFQRow
                      key={rfq.rfq_id}
                      rfq={rfq}
                      busy={busyId === rfq.rfq_id}
                      confirmingDelete={confirmDeleteId === rfq.rfq_id}
                      onToggleStatus={() => handleToggleStatus(rfq)}
                      onAskDelete={() => setConfirmDeleteId(rfq.rfq_id)}
                      onCancelDelete={() => setConfirmDeleteId(null)}
                      onConfirmDelete={() => handleDelete(rfq.rfq_id)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Row sub-component ────────────────────────────────────────────────────────

function RFQRow({
  rfq,
  busy,
  confirmingDelete,
  onToggleStatus,
  onAskDelete,
  onCancelDelete,
  onConfirmDelete,
}: {
  rfq: RFQ;
  busy: boolean;
  confirmingDelete: boolean;
  onToggleStatus: () => void;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
}) {
  const isLocked = rfq.status === "LOCKED";
  const typeLabel =
    RFQ_TYPES.find((t) => t.value === rfq.type)?.label ?? rfq.type;

  return (
    <div className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
      {/* Left — type + id */}
      <div className="flex items-center gap-3 min-w-0">
        <div
          className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
            isLocked ? "bg-gray-100" : "bg-yellow-100"
          }`}
        >
          {isLocked ? (
            <Lock size={14} className="text-gray-500" />
          ) : (
            <Unlock size={14} className="text-yellow-600" />
          )}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900">{typeLabel}</p>
          <p className="text-xs text-gray-400 truncate">{rfq.rfq_id}</p>
        </div>
      </div>

      {/* Right — actions */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {confirmingDelete ? (
          <>
            <span className="text-xs text-red-600 mr-1">Delete?</span>
            <button
              onClick={onConfirmDelete}
              disabled={busy}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              {busy && <Loader2 size={12} className="animate-spin" />}
              Yes, delete
            </button>
            <button
              onClick={onCancelDelete}
              className="px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            {/* Status badge + toggle */}
            <button
              onClick={onToggleStatus}
              disabled={busy}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors disabled:opacity-50 ${
                isLocked
                  ? "bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200"
                  : "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
              }`}
            >
              {busy ? (
                <Loader2 size={12} className="animate-spin" />
              ) : isLocked ? (
                <Lock size={12} />
              ) : (
                <Unlock size={12} />
              )}
              {isLocked ? "Locked" : "Unlocked"}
            </button>

            {/* Delete */}
            <button
              onClick={onAskDelete}
              className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
            >
              <Trash2 size={14} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}