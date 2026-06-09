// components/users/user-clients-drawer.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import {
  X,
  Search,
  Loader2,
  Check,
  Briefcase,
  ChevronDown,
  Sparkles,
} from "lucide-react";
import { db } from "../../lib/firebase";
import { Client } from "../../lib/types/client.types";
import { UserProfile } from "../../lib/services/user-service";
import {
  setUserAssignments,
  diffAssignments,
} from "../../lib/services/assignment-service";
import {
  CLIENT_AGENCIES,
  STATUS_DOT_COLORS,
  type ClientStatus,
} from "../../lib/constants/client.constants";
import { resolveClientStatus, isClientHidden } from "../../lib/format/client";

interface UserClientsDrawerProps {
  open: boolean;
  user: UserProfile | null;
  onClose: () => void;
  /** Callback après Save réussi — renvoie la nouvelle liste d'assignations */
  onSaved: (uid: string, assignedClients: string[]) => void;
}

type AgencyFilter = "ALL" | string;
type StatusFilter = "ALL" | ClientStatus;

// Palette d'avatars — même logique que client-card pour la cohérence
const AVATAR_COLORS = [
  "bg-yellow-400",
  "bg-blue-400",
  "bg-emerald-400",
  "bg-rose-400",
  "bg-violet-400",
  "bg-orange-400",
  "bg-teal-400",
  "bg-pink-400",
];

function avatarColor(name: string): string {
  const idx =
    name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) %
    AVATAR_COLORS.length;
  return AVATAR_COLORS[idx];
}

/**
 * Drawer d'assignation en masse : 1 user → N clients.
 *
 * — Recherche + filtres Agency / Status
 * — "Select all (filtered)" / "Clear (filtered)" pour les assignations par lot
 *   (ex. tous les clients d'une agence)
 * — Un seul Save : remplace assignedClients d'un coup (setUserAssignments)
 * — Compteur de diff (+X / −Y) avant commit
 */
export default function UserClientsDrawer({
  open,
  user,
  onClose,
  onSaved,
}: UserClientsDrawerProps) {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Sélection en cours d'édition
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const initialAssignments = user?.assignedClients ?? [];

  // Filtres
  const [search, setSearch] = useState("");
  const [agencyFilter, setAgencyFilter] = useState<AgencyFilter>("ALL");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");

  // Charger les clients à l'ouverture
  useEffect(() => {
    if (!open) return;

    async function fetchClients() {
      setLoading(true);
      setError("");
      try {
        const snapshot = await getDocs(collection(db, "clients"));
        const data = snapshot.docs.map((d) => ({
          cl_id: d.id,
          ...(d.data() as Omit<Client, "cl_id">),
        }));
        // Tri alpha pour scanner la liste facilement
        data.sort((a, b) => a.CL_Name.localeCompare(b.CL_Name));
        setClients(data);
      } catch (err: any) {
        setError("Failed to load clients: " + (err?.message ?? "Unknown error"));
      } finally {
        setLoading(false);
      }
    }

    fetchClients();
  }, [open]);

  // Réinitialiser la sélection quand le user change ou que le drawer s'ouvre
  useEffect(() => {
    setSelected(new Set(user?.assignedClients ?? []));
    setSearch("");
    setAgencyFilter("ALL");
    setStatusFilter("ALL");
    setError("");
  }, [user, open]);

  // Clients visibles selon filtres
  const filteredClients = useMemo(() => {
    const q = search.toLowerCase();
    return clients.filter((c) => {
      // Hidden clients aren't assignable — but keep ones already assigned to
      // this user so they remain visible (and removable) in the list.
      if (isClientHidden(c) && !selected.has(c.cl_id)) return false;
      const matchesSearch =
        !q ||
        c.CL_Name.toLowerCase().includes(q) ||
        c.CL_Agency.toLowerCase().includes(q);
      const matchesAgency = agencyFilter === "ALL" || c.CL_Agency === agencyFilter;
      const matchesStatus =
        statusFilter === "ALL" ||
        resolveClientStatus(c, new Date().getFullYear()) === statusFilter;
      return matchesSearch && matchesAgency && matchesStatus;
    });
  }, [clients, search, agencyFilter, statusFilter, selected]);

  const diff = useMemo(
    () => diffAssignments(initialAssignments, [...selected]),
    [initialAssignments, selected]
  );

  const allFilteredSelected =
    filteredClients.length > 0 &&
    filteredClients.every((c) => selected.has(c.cl_id));

  // ─── Handlers ───────────────────────────────────────────────────────────────

  function toggle(clId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(clId)) next.delete(clId);
      else next.add(clId);
      return next;
    });
  }

  function selectAllFiltered() {
    setSelected((prev) => {
      const next = new Set(prev);
      filteredClients.forEach((c) => next.add(c.cl_id));
      return next;
    });
  }

  function clearFiltered() {
    setSelected((prev) => {
      const next = new Set(prev);
      filteredClients.forEach((c) => next.delete(c.cl_id));
      return next;
    });
  }

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    setError("");
    try {
      const finalList = [...selected];
      await setUserAssignments(user.uid, finalList);
      onSaved(user.uid, finalList);
    } catch (err: any) {
      setError("Failed to save: " + (err?.message ?? "Unknown error"));
      setSaving(false);
    }
  }

  if (!user) return null;

  const userInitials = user.displayName
    ? user.displayName.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : user.email[0].toUpperCase();

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
          onClick={onClose}
        />
      )}

      {/* Drawer élargi : max-w-2xl */}
      <div
        className={`
          fixed top-0 right-0 z-50 h-full w-full max-w-2xl bg-white shadow-2xl
          flex flex-col transform transition-transform duration-250 ease-in-out
          ${open ? "translate-x-0" : "translate-x-full"}
        `}
      >
        {/* Header — bandeau sombre assorti à la sidebar */}
        <div className="bg-gray-900 px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full bg-yellow-400 flex items-center justify-center text-gray-900 text-sm font-bold flex-shrink-0">
              {userInitials}
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-white truncate">
                {user.displayName ?? user.email}
              </h2>
              <p className="text-xs text-gray-400 truncate">
                Assign clients · {selected.size} selected
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

        {/* Toolbar — recherche + filtres */}
        <div className="px-6 py-4 border-b border-gray-100 space-y-3 bg-gray-50/60">
          <div className="flex items-center gap-2">
            {/* Recherche */}
            <div className="relative flex-1">
              <Search
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                type="text"
                placeholder="Search clients..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
              />
            </div>

            {/* Filtre agence */}
            <div className="relative">
              <select
                value={agencyFilter}
                onChange={(e) => setAgencyFilter(e.target.value)}
                className="appearance-none pl-3 pr-8 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-yellow-400 cursor-pointer"
              >
                <option value="ALL">All agencies</option>
                {CLIENT_AGENCIES.map((a) => (
                  <option key={a.value} value={a.value}>
                    {a.label}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={13}
                className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400"
              />
            </div>

            {/* Filtre statut */}
            <div className="relative">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                className="appearance-none pl-3 pr-8 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-yellow-400 cursor-pointer"
              >
                <option value="ALL">All statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
                <option value="LOSS">Loss</option>
                <option value="NEW_CLIENT">New</option>
              </select>
              <ChevronDown
                size={13}
                className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400"
              />
            </div>
          </div>

          {/* Actions par lot + compteur */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={allFilteredSelected ? clearFiltered : selectAllFiltered}
                disabled={filteredClients.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-yellow-300 bg-yellow-50 text-yellow-800 hover:bg-yellow-100 disabled:opacity-40 transition-colors"
              >
                <Sparkles size={12} />
                {allFilteredSelected
                  ? `Clear filtered (${filteredClients.length})`
                  : `Select all filtered (${filteredClients.length})`}
              </button>
            </div>
            <span className="text-xs text-gray-400">
              {filteredClients.length} client
              {filteredClients.length !== 1 ? "s" : ""} shown
            </span>
          </div>
        </div>

        {/* Erreur */}
        {error && (
          <div className="mx-6 mt-3 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* Liste des clients */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-16 gap-2 text-gray-400">
              <Loader2 size={18} className="animate-spin" />
              <span className="text-sm">Loading clients...</span>
            </div>
          ) : filteredClients.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <Briefcase size={28} className="mb-2 opacity-40" />
              <p className="text-sm">No clients match your filters.</p>
            </div>
          ) : (
            <ul className="space-y-1.5">
              {filteredClients.map((c) => {
                const isSelected = selected.has(c.cl_id);
                const initials = c.CL_Name.split(" ")
                  .map((w) => w[0])
                  .join("")
                  .toUpperCase()
                  .slice(0, 2);

                return (
                  <li key={c.cl_id}>
                    <button
                      type="button"
                      onClick={() => toggle(c.cl_id)}
                      className={`
                        w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left
                        transition-all duration-100
                        ${isSelected
                          ? "border-yellow-400 bg-yellow-50 shadow-sm"
                          : "border-gray-100 bg-white hover:border-gray-200 hover:bg-gray-50"
                        }
                      `}
                    >
                      {/* Checkbox custom */}
                      <span
                        className={`
                          w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0
                          transition-colors
                          ${isSelected
                            ? "bg-yellow-400 border-yellow-400 text-gray-900"
                            : "bg-white border-gray-300"
                          }
                        `}
                      >
                        {isSelected && <Check size={13} strokeWidth={3} />}
                      </span>

                      {/* Avatar / logo */}
                      <div
                        className={`w-8 h-8 rounded-lg ${
                          c.CL_Logo ? "bg-transparent" : avatarColor(c.CL_Name)
                        } flex items-center justify-center flex-shrink-0 overflow-hidden`}
                      >
                        {c.CL_Logo ? (
                          <img
                            src={c.CL_Logo}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="text-white text-[10px] font-bold">
                            {initials}
                          </span>
                        )}
                      </div>

                      {/* Nom + agence */}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {c.CL_Name}
                        </p>
                        <p className="text-xs text-gray-400 truncate">
                          {c.CL_Agency}
                        </p>
                      </div>

                      {/* Status dot */}
                      {(() => {
                        const status = resolveClientStatus(c, new Date().getFullYear());
                        return (
                          <span className="flex items-center gap-1.5 flex-shrink-0">
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                STATUS_DOT_COLORS[status] ?? "bg-gray-300"
                              }`}
                            />
                            <span className="text-xs text-gray-400 hidden sm:inline">
                              {status === "NEW_CLIENT"
                                ? "New"
                                : status.charAt(0) + status.slice(1).toLowerCase()}
                            </span>
                          </span>
                        );
                      })()}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer — diff + Save */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-3 bg-white">
          {/* Compteur de changements */}
          <div className="flex items-center gap-2 text-xs">
            {diff.added.length > 0 && (
              <span className="px-2 py-1 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium">
                +{diff.added.length}
              </span>
            )}
            {diff.removed.length > 0 && (
              <span className="px-2 py-1 rounded-md bg-red-50 text-red-600 border border-red-200 font-medium">
                −{diff.removed.length}
              </span>
            )}
            {!diff.hasChanges && (
              <span className="text-gray-400">No changes</span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !diff.hasChanges}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-900 bg-yellow-400 rounded-lg hover:bg-yellow-500 disabled:opacity-50 transition-colors"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              Save assignments
            </button>
          </div>
        </div>
      </div>
    </>
  );
}