// app/(protected)/admin/currency/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Trash2,
  Loader2,
  AlertCircle,
  DollarSign,
  CalendarPlus,
  Check,
} from "lucide-react";
import { useUserProfile } from "../../../../lib/hooks/use-user-profile";
import type { CurrencyRate } from "../../../../lib/types/currency.types";
import {
  subscribeToCurrencyRates,
  setCurrencyRate,
  deleteCurrencyRate,
} from "../../../../lib/services/currency-service";
import PageHeader from "../../../../components/_shared/page-header";

export default function AdminCurrencyPage() {
  const { isAdmin, loading: profileLoading } = useUserProfile();
  const router = useRouter();

  const [rates, setRates] = useState<CurrencyRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Years the admin has introduced this session but that don't yet have a
  // persisted rate. Merged with years from data when rendering rows.
  const [draftYears, setDraftYears] = useState<number[]>([]);

  const [confirmDeleteYear, setConfirmDeleteYear] = useState<number | null>(
    null
  );

  // "Add year" form state
  const [showAddYear, setShowAddYear] = useState(false);
  const [newYear, setNewYear] = useState<number>(new Date().getFullYear() + 1);

  // Guard — redirect non-admins
  useEffect(() => {
    if (!profileLoading && !isAdmin) {
      router.replace("/");
    }
  }, [isAdmin, profileLoading, router]);

  // Real-time subscription
  useEffect(() => {
    if (!isAdmin) return;
    const unsubscribe = subscribeToCurrencyRates(
      (data) => {
        setRates(data);
        setLoading(false);
      },
      (err) => {
        setError("Failed to load currency rates: " + err.message);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, [isAdmin]);

  // Union of years from data + admin-added draft years, sorted desc
  const years = useMemo(() => {
    const set = new Set<number>([
      ...rates.map((r) => r.year),
      ...draftYears,
    ]);
    return Array.from(set).sort((a, b) => b - a);
  }, [rates, draftYears]);

  async function handleSave(year: number, value: number): Promise<boolean> {
    setError("");
    try {
      await setCurrencyRate(year, value);
      // Year is now backed by data; drop it from drafts if it was there
      setDraftYears((prev) => prev.filter((y) => y !== year));
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save rate.");
      return false;
    }
  }

  async function handleDelete(year: number) {
    setError("");
    try {
      await deleteCurrencyRate(year);
      setDraftYears((prev) => prev.filter((y) => y !== year));
      setConfirmDeleteYear(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete rate.");
    }
  }

  function handleAddYear() {
    if (!newYear || newYear < 2020 || newYear > 2100) {
      setError("Year must be between 2020 and 2100.");
      return;
    }
    if (!years.includes(newYear)) {
      setDraftYears((prev) => [...prev, newYear]);
    }
    setError("");
    setShowAddYear(false);
  }

  if (profileLoading) return null;
  if (!isAdmin) return null;

  return (
    <div>
      <PageHeader
        title="Currency"
        description="Set the yearly USD → CAD conversion rate."
        actions={
          <button
            onClick={() => setShowAddYear((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-900 bg-yellow-400 rounded-lg hover:bg-yellow-500 transition-colors"
          >
            <CalendarPlus size={14} />
            Add year
          </button>
        }
      />

      <div className="p-6 max-w-2xl mx-auto">
        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">
            <AlertCircle size={16} className="flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Add year inline form */}
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
              Enter the rate for the new year, then click Save.
            </p>
          </div>
        )}

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-24 gap-2 text-gray-400">
            <Loader2 size={18} className="animate-spin" />
            <span className="text-sm">Loading rates...</span>
          </div>
        ) : years.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-gray-400">
            <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
              <DollarSign size={24} className="opacity-40" />
            </div>
            <p className="text-sm font-medium text-gray-500">
              No conversion rates yet
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Use &ldquo;Add year&rdquo; above to set your first rate.
            </p>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden">
            {years.map((year) => (
              <RateRow
                // Remount with a fresh input when the persisted rate changes
                // from elsewhere (e.g. another admin's write via the snapshot).
                key={`${year}:${rates.find((r) => r.year === year)?.usdToCad ?? "draft"}`}
                year={year}
                rate={rates.find((r) => r.year === year)}
                confirmingDelete={confirmDeleteYear === year}
                onSave={(value) => handleSave(year, value)}
                onAskDelete={() => setConfirmDeleteYear(year)}
                onCancelDelete={() => setConfirmDeleteYear(null)}
                onConfirmDelete={() => handleDelete(year)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Rate row ─────────────────────────────────────────────────────────────────

function RateRow({
  year,
  rate,
  confirmingDelete,
  onSave,
  onAskDelete,
  onCancelDelete,
  onConfirmDelete,
}: {
  year: number;
  rate: CurrencyRate | undefined;
  confirmingDelete: boolean;
  onSave: (value: number) => Promise<boolean>;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
}) {
  // Local input mirrors the persisted value; "" while a draft year has no rate.
  const [value, setValue] = useState<string>(
    rate ? String(rate.usdToCad) : ""
  );
  const [saving, setSaving] = useState(false);

  const parsed = Number(value);
  const isValid = value.trim() !== "" && Number.isFinite(parsed) && parsed > 0;
  const isDirty = value.trim() !== (rate ? String(rate.usdToCad) : "");

  async function submit() {
    if (!isValid || saving) return;
    setSaving(true);
    await onSave(parsed);
    setSaving(false);
  }

  return (
    <div className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-8 h-8 rounded-lg bg-yellow-100 flex items-center justify-center flex-shrink-0">
          <DollarSign size={14} className="text-yellow-600" />
        </div>
        <span className="text-sm font-semibold text-gray-900">{year}</span>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {/* Rate input: 1 USD = X CAD */}
        <div className="flex items-center gap-1.5 text-sm text-gray-500">
          <span>1 USD =</span>
          <input
            type="number"
            step="0.0001"
            min="0"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
            placeholder="1.3700"
            className="w-24 px-2.5 py-1.5 text-sm text-right border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
          />
          <span>CAD</span>
        </div>

        <button
          onClick={submit}
          disabled={!isValid || !isDirty || saving}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-900 bg-yellow-400 rounded-lg hover:bg-yellow-500 disabled:opacity-40 transition-colors"
        >
          {saving ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Check size={14} />
          )}
          Save
        </button>

        {/* Delete (only for persisted years) */}
        {rate &&
          (confirmingDelete ? (
            <>
              <button
                onClick={onConfirmDelete}
                className="px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700 transition-colors"
              >
                Yes, remove
              </button>
              <button
                onClick={onCancelDelete}
                className="px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              onClick={onAskDelete}
              className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
              title="Remove rate"
            >
              <Trash2 size={14} />
            </button>
          ))}
      </div>
    </div>
  );
}
