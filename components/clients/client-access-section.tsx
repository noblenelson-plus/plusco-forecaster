// components/clients/client-access-section.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { Loader2, Plus, Search, Shield, User, X } from "lucide-react";
import { db } from "../../lib/firebase";
import { UserProfile } from "../../lib/services/user-service";
import {
  assignClientsToUser,
  removeClientsFromUser,
  getUsersForClient,
  getUsersNotOnClient,
} from "../../lib/services/assignment-service";

interface ClientAccessSectionProps {
  /** ID du client en cours d'édition — null si création (section masquée) */
  clId: string | null;
  /**
   * Admin → contrôles complets (ajouter / retirer des accès).
   * BL → liste en lecture seule (voir qui d'autre a accès au client).
   */
  isAdmin: boolean;
}

/**
 * Section "Access" à insérer dans le ClientDrawer (mode édition).
 *
 * — Liste les utilisateurs ayant accès au client (assignedClients ∋ clId)
 * — Admin only : combobox de recherche pour ajouter quelqu'un, bouton ×
 *   pour retirer un accès
 *
 * Les écritures sont immédiates (arrayUnion / arrayRemove sur users/{uid}),
 * indépendantes du Save du formulaire client.
 */
export default function ClientAccessSection({
  clId,
  isAdmin,
}: ClientAccessSectionProps) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyUid, setBusyUid] = useState<string | null>(null);

  // Combobox state (admin only)
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const pickerRef = useRef<HTMLDivElement>(null);

  // Charger tous les users (une fois par ouverture du drawer)
  useEffect(() => {
    if (!clId) return;

    async function fetchUsers() {
      setLoading(true);
      setError("");
      try {
        const snapshot = await getDocs(collection(db, "users"));
        const data = snapshot.docs.map((d) => ({
          uid: d.id,
          ...(d.data() as Omit<UserProfile, "uid">),
        }));
        setUsers(data);
      } catch (err: any) {
        setError("Failed to load users: " + (err?.message ?? "Unknown error"));
      } finally {
        setLoading(false);
      }
    }

    fetchUsers();
  }, [clId]);

  // Fermer le picker au clic extérieur
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    }
    if (pickerOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [pickerOpen]);

  const assignedUsers = useMemo(
    () => (clId ? getUsersForClient(users, clId) : []),
    [users, clId]
  );

  const candidates = useMemo(() => {
    if (!clId) return [];
    const pool = getUsersNotOnClient(users, clId);
    const q = search.toLowerCase();
    if (!q) return pool;
    return pool.filter(
      (u) =>
        u.email.toLowerCase().includes(q) ||
        (u.displayName ?? "").toLowerCase().includes(q)
    );
  }, [users, clId, search]);

  async function handleAdd(uid: string) {
    if (!clId) return;
    setBusyUid(uid);
    setError("");
    try {
      await assignClientsToUser(uid, [clId]);
      // Mise à jour optimiste locale
      setUsers((prev) =>
        prev.map((u) =>
          u.uid === uid
            ? { ...u, assignedClients: [...(u.assignedClients ?? []), clId] }
            : u
        )
      );
      setSearch("");
      setPickerOpen(false);
    } catch (err: any) {
      setError("Failed to add access: " + (err?.message ?? "Unknown error"));
    } finally {
      setBusyUid(null);
    }
  }

  async function handleRemove(uid: string) {
    if (!clId) return;
    setBusyUid(uid);
    setError("");
    try {
      await removeClientsFromUser(uid, [clId]);
      setUsers((prev) =>
        prev.map((u) =>
          u.uid === uid
            ? {
                ...u,
                assignedClients: (u.assignedClients ?? []).filter(
                  (id) => id !== clId
                ),
              }
            : u
        )
      );
    } catch (err: any) {
      setError("Failed to remove access: " + (err?.message ?? "Unknown error"));
    } finally {
      setBusyUid(null);
    }
  }

  // Création d'un nouveau client → pas encore d'ID, on n'affiche rien
  if (!clId) return null;

  return (
    <div>
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
        Access
      </p>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm mb-3">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-gray-400 text-sm py-2">
          <Loader2 size={14} className="animate-spin" />
          Loading access list...
        </div>
      ) : (
        <div className="space-y-2">
          {/* Liste des users assignés */}
          {assignedUsers.length === 0 ? (
            <p className="text-sm text-gray-400 py-1">
              No one has access to this client yet.
            </p>
          ) : (
            assignedUsers.map((u) => (
              <AccessRow
                key={u.uid}
                user={u}
                busy={busyUid === u.uid}
                canRemove={isAdmin}
                onRemove={() => handleRemove(u.uid)}
              />
            ))
          )}

          {/* Add person — combobox, admin only */}
          {isAdmin && (
            <div className="relative" ref={pickerRef}>
              {!pickerOpen ? (
                <button
                  type="button"
                  onClick={() => setPickerOpen(true)}
                  className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors py-1"
                >
                  <Plus size={14} />
                  Add person
                </button>
              ) : (
                <div className="border border-gray-200 rounded-lg bg-white shadow-sm">
                  <div className="relative border-b border-gray-100">
                    <Search
                      size={14}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                    />
                    <input
                      autoFocus
                      type="text"
                      placeholder="Search by name or email..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="w-full pl-8 pr-3 py-2 text-sm rounded-t-lg focus:outline-none"
                    />
                  </div>
                  <div className="max-h-44 overflow-y-auto py-1">
                    {candidates.length === 0 ? (
                      <p className="text-xs text-gray-400 px-3 py-2">
                        No matching users.
                      </p>
                    ) : (
                      candidates.map((u) => (
                        <button
                          key={u.uid}
                          type="button"
                          disabled={busyUid === u.uid}
                          onClick={() => handleAdd(u.uid)}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-gray-50 disabled:opacity-50 transition-colors"
                        >
                          <UserAvatar user={u} />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-gray-900 truncate">
                              {u.displayName ?? "—"}
                            </p>
                            <p className="text-xs text-gray-400 truncate">
                              {u.email}
                            </p>
                          </div>
                          {busyUid === u.uid && (
                            <Loader2
                              size={13}
                              className="animate-spin text-gray-400 flex-shrink-0"
                            />
                          )}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function AccessRow({
  user,
  busy,
  canRemove,
  onRemove,
}: {
  user: UserProfile;
  busy: boolean;
  canRemove: boolean;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-2.5 px-3 py-2 border border-gray-100 rounded-lg bg-gray-50/50">
      <UserAvatar user={user} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-900 truncate">
          {user.displayName ?? "—"}
        </p>
        <p className="text-xs text-gray-400 truncate">{user.email}</p>
      </div>

      {/* Badge rôle */}
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-white border border-gray-200 text-gray-500 flex-shrink-0">
        {user.role === "ADMIN" ? (
          <>
            <Shield size={10} className="text-yellow-500" /> Admin
          </>
        ) : (
          <>
            <User size={10} className="text-gray-400" /> BL
          </>
        )}
      </span>

      {/* Retrait — admin only */}
      {canRemove && (
        <button
          type="button"
          onClick={onRemove}
          disabled={busy}
          className="p-1 rounded-md text-gray-400 hover:bg-gray-200 hover:text-gray-700 disabled:opacity-50 transition-colors flex-shrink-0"
          title="Remove access"
        >
          {busy ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <X size={14} />
          )}
        </button>
      )}
    </div>
  );
}

function UserAvatar({ user }: { user: UserProfile }) {
  const initials = user.displayName
    ? user.displayName
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : user.email[0].toUpperCase();

  return (
    <div className="w-7 h-7 rounded-full bg-yellow-400 flex items-center justify-center text-gray-900 text-[10px] font-bold flex-shrink-0">
      {initials}
    </div>
  );
}