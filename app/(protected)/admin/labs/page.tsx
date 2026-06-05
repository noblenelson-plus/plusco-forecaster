// app/(protected)/admin/labs/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Trash2,
  Loader2,
  AlertCircle,
  Sparkles,
  CalendarPlus,
} from "lucide-react";
import { useUserProfile } from "../../../../lib/hooks/use-user-profile";
import type { LabsPartner } from "../../../../lib/types/labs.types";
import type { MediaType } from "../../../../lib/types/common.types";
import { MEDIA_TYPES } from "../../../../lib/types/common.types";
import { MEDIA_TYPE_LABELS } from "../../../../lib/types/forecaster.types";
import {
  subscribeToLabsPartners,
  createLabsPartner,
  deleteLabsPartner,
  getLabsPartnerYears,
  getLabsPartnersForYear,
} from "../../../../lib/services/labs-partner-service";
import PageHeader from "../../../../components/_shared/page-header";

// Shape captured by the inline add form, before the year is attached.
interface NewPartnerDraft {
  name: string;
  mediaType: MediaType;
  description: string;
}

export default function AdminLabsPage() {
  const { isAdmin, loading: profileLoading } = useUserProfile();
  const router = useRouter();

  const [partners, setPartners] = useState<LabsPartner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Years the admin has manually introduced this session but that don't
  // yet have any persisted partners. Merged with years from data when
  // rendering sections.
  const [draftYears, setDraftYears] = useState<number[]>([]);

  // Per-year state — each year section owns its own input + busy flag
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

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
    const unsubscribe = subscribeToLabsPartners(
      (data) => {
        setPartners(data);
        setLoading(false);
      },
      (err) => {
        setError("Failed to load LABS partners: " + err.message);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, [isAdmin]);

  // Union of years from data + admin-added draft years, sorted desc
  const years = useMemo(() => {
    const set = new Set<number>([
      ...getLabsPartnerYears(partners),
      ...draftYears,
    ]);
    return Array.from(set).sort((a, b) => b - a);
  }, [partners, draftYears]);

  async function handleCreate(
    year: number,
    draft: NewPartnerDraft
  ): Promise<boolean> {
    setError("");
    try {
      await createLabsPartner({
        year,
        name: draft.name,
        mediaType: draft.mediaType,
        description: draft.description,
      });
      // Year is now backed by data; drop it from drafts if it was there
      setDraftYears((prev) => prev.filter((y) => y !== year));
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create partner.");
      return false;
    }
  }

  async function handleDelete(partnerId: string) {
    setBusyId(partnerId);
    setError("");
    try {
      await deleteLabsPartner(partnerId);
      setConfirmDeleteId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete partner.");
    } finally {
      setBusyId(null);
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
    setShowAddYear(false);
  }

  if (profileLoading) return null;
  if (!isAdmin) return null;

  return (
    <div>
      <PageHeader
        title="LABS"
        description="Manage global LABS partners shared across all clients."
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

      <div className="p-6 max-w-4xl mx-auto">
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
              New year section
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
              The new year stays empty until you add a partner to it.
            </p>
          </div>
        )}

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-24 gap-2 text-gray-400">
            <Loader2 size={18} className="animate-spin" />
            <span className="text-sm">Loading partners...</span>
          </div>
        ) : years.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-gray-400">
            <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
              <Sparkles size={24} className="opacity-40" />
            </div>
            <p className="text-sm font-medium text-gray-500">
              No LABS partners yet
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Use &ldquo;Add year&rdquo; above to create your first year
              section.
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {years.map((year) => (
              <YearSection
                key={year}
                year={year}
                partners={getLabsPartnersForYear(partners, year)}
                busyId={busyId}
                confirmDeleteId={confirmDeleteId}
                onCreate={(draft) => handleCreate(year, draft)}
                onAskDelete={(id) => setConfirmDeleteId(id)}
                onCancelDelete={() => setConfirmDeleteId(null)}
                onConfirmDelete={(id) => handleDelete(id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Year section ─────────────────────────────────────────────────────────────

function YearSection({
  year,
  partners,
  busyId,
  confirmDeleteId,
  onCreate,
  onAskDelete,
  onCancelDelete,
  onConfirmDelete,
}: {
  year: number;
  partners: LabsPartner[];
  busyId: string | null;
  confirmDeleteId: string | null;
  onCreate: (draft: NewPartnerDraft) => Promise<boolean>;
  onAskDelete: (id: string) => void;
  onCancelDelete: () => void;
  onConfirmDelete: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [mediaType, setMediaType] = useState<MediaType>(MEDIA_TYPES[0]);
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);

  async function submit() {
    if (!name.trim() || creating) return;
    setCreating(true);
    const ok = await onCreate({ name, mediaType, description });
    setCreating(false);
    if (ok) {
      // Keep the chosen media type — adding several partners of the same
      // type in a row is the common case.
      setName("");
      setDescription("");
    }
  }

  return (
    <div>
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
        {year}
      </h2>
      <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden">
        {/* Existing partners */}
        {partners.length === 0 ? (
          <div className="px-4 py-4 text-xs text-gray-400 italic">
            No partners yet for {year}.
          </div>
        ) : (
          partners.map((p) => (
            <PartnerRow
              key={p.partnerId}
              partner={p}
              busy={busyId === p.partnerId}
              confirmingDelete={confirmDeleteId === p.partnerId}
              onAskDelete={() => onAskDelete(p.partnerId)}
              onCancelDelete={onCancelDelete}
              onConfirmDelete={() => onConfirmDelete(p.partnerId)}
            />
          ))
        )}

        {/* Always-visible inline add form */}
        <div className="px-4 py-3 bg-gray-50 space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
              placeholder={`Partner name for ${year}…`}
              className="flex-1 min-w-0 px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
            />
            <select
              value={mediaType}
              onChange={(e) => setMediaType(e.target.value as MediaType)}
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
            >
              {MEDIA_TYPES.map((t) => (
                <option key={t} value={t}>
                  {MEDIA_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
            <button
              onClick={submit}
              disabled={creating || !name.trim()}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-900 bg-yellow-400 rounded-lg hover:bg-yellow-500 disabled:opacity-50 transition-colors flex-shrink-0"
            >
              {creating ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Plus size={14} />
              )}
              Add
            </button>
          </div>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
            placeholder="Description (optional)"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
          />
        </div>
      </div>
    </div>
  );
}

// ─── Partner row ──────────────────────────────────────────────────────────────

function PartnerRow({
  partner,
  busy,
  confirmingDelete,
  onAskDelete,
  onCancelDelete,
  onConfirmDelete,
}: {
  partner: LabsPartner;
  busy: boolean;
  confirmingDelete: boolean;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-8 h-8 rounded-lg bg-yellow-100 flex items-center justify-center flex-shrink-0">
          <Sparkles size={14} className="text-yellow-600" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-gray-900 truncate">
              {partner.name}
            </p>
            {partner.mediaType && (
              <span className="flex-shrink-0 px-2 py-0.5 text-[11px] font-medium text-yellow-700 bg-yellow-100 rounded-full">
                {MEDIA_TYPE_LABELS[partner.mediaType]}
              </span>
            )}
          </div>
          {partner.description && (
            <p className="text-xs text-gray-400 truncate">
              {partner.description}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {confirmingDelete ? (
          <>
            <span className="text-xs text-red-600 mr-1">Remove?</span>
            <button
              onClick={onConfirmDelete}
              disabled={busy}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              {busy && <Loader2 size={12} className="animate-spin" />}
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
            title="Remove partner"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </div>
  );
}