// components/users/person-clients-drawer.tsx
"use client";

/**
 * Admin → Forecast Access, one person → many clients. The person is checked
 * on every client whose team they are on; ticking a client adds them as a
 * collaborator, unticking removes them. GM / BL / DL seats come from the
 * client itself (GM Pod, Business Lead, Digital Lead fields) and are shown
 * locked — change them in the client drawer on the Clients page.
 *
 * Also holds the person's admin actions (User / Admin, revoke, delete).
 */

import { useMemo, useState } from "react";
import {
  X,
  Search,
  Loader2,
  Check,
  Briefcase,
  ChevronDown,
  Sparkles,
  Shield,
  Ban,
  RotateCcw,
  Trash2,
  Lock,
} from "lucide-react";
import type { Client } from "../../lib/types/client.types";
import type { UserProfile } from "../../lib/services/user-service";
import { APP_ROLE_LABELS, type AppRole } from "../../lib/types/access.types";
import { CLIENT_AGENCIES } from "../../lib/constants/client.constants";
import { isClientHidden } from "../../lib/format/client";
import {
  TEAM_ROLE_SHORT,
  toggleCollaborator,
  type TeamRole,
} from "../../lib/format/client-team";
import { applyCollaboratorsUpdates } from "../../lib/services/team-access-service";

export interface AccessPerson {
  email: string;
  displayName: string | null;
  /** The users row; absent for a team email nobody has added or signed in with. */
  user: UserProfile | null;
  /** cl_id → roles held on that client. */
  clients: Map<string, TeamRole[]>;
}

type Show = "ALL" | "ASSIGNED";

export default function PersonClientsDrawer({
  person,
  clients,
  isSelf,
  busy,
  onClose,
  onSaved,
  onRoleChange,
  onToggleDisabled,
  onDelete,
}: {
  person: AccessPerson;
  clients: Client[];
  isSelf: boolean;
  /** A user-row action (role, revoke, delete) is in flight. */
  busy: boolean;
  onClose: () => void;
  /** The clients that changed, with their new team fields. */
  onSaved: (updated: Client[]) => void;
  onRoleChange: (role: AppRole) => void;
  onToggleDisabled: () => void;
  onDelete: () => void;
}) {
  const { email } = person;
  const isCollaborator = (c: Client) =>
    (c.CL_Collaborators ?? []).some((x) => x.trim().toLowerCase() === email);
  /** Seats that come from the client's own fields (not editable here). */
  const lockedRoles = (c: Client) =>
    (person.clients.get(c.cl_id) ?? []).filter((r) => r !== "COLLABORATOR");

  const initial = useMemo(
    () => new Set(clients.filter(isCollaborator).map((c) => c.cl_id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clients, email]
  );
  const [selected, setSelected] = useState<Set<string>>(initial);
  const [search, setSearch] = useState("");
  const [agency, setAgency] = useState("ALL");
  const [show, setShow] = useState<Show>("ALL");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const onTeam = (c: Client) => selected.has(c.cl_id) || lockedRoles(c).length > 0;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return clients
      .filter((c) => agency === "ALL" || c.CL_Agency === agency)
      .filter((c) => !q || c.CL_Name.toLowerCase().includes(q) || c.cl_id.toLowerCase().includes(q))
      .filter((c) => show === "ALL" || onTeam(c))
      // Hidden clients stay listed only while the person is on them.
      .filter((c) => !isClientHidden(c) || onTeam(c))
      .sort(
        (a, b) => Number(onTeam(b)) - Number(onTeam(a)) || a.CL_Name.localeCompare(b.CL_Name)
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clients, search, agency, show, selected]);

  const editable = filtered.filter((c) => lockedRoles(c).length === 0);
  const allEditableSelected = editable.length > 0 && editable.every((c) => selected.has(c.cl_id));
  const added = [...selected].filter((id) => !initial.has(id));
  const removed = [...initial].filter((id) => !selected.has(id));
  const hasChanges = added.length + removed.length > 0;
  const total = clients.filter(onTeam).length;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function setFiltered(on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const c of editable) {
        if (on) next.add(c.cl_id);
        else next.delete(c.cl_id);
      }
      return next;
    });
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const byId = new Map(clients.map((c) => [c.cl_id, c]));
      const updates = [
        ...added.map((id) => toggleCollaborator(byId.get(id)!, email, true)),
        ...removed.map((id) => toggleCollaborator(byId.get(id)!, email, false)),
      ];
      await applyCollaboratorsUpdates(updates);
      onSaved(updates.map((u) => ({ ...byId.get(u.cl_id)!, ...u })));
    } catch (err) {
      setError("Failed to save: " + (err instanceof Error ? err.message : "Unknown error"));
    } finally {
      setSaving(false);
    }
  }

  const user = person.user;
  const isAdmin = user?.role === "ADMIN";
  const disabled = !!user?.disabled;
  const initials = person.displayName
    ? person.displayName.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : email[0].toUpperCase();

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div className="fixed top-0 right-0 z-50 h-[calc(100vh/var(--app-zoom,1))] w-full max-w-2xl bg-white shadow-2xl flex flex-col">
        {/* Header */}
        <div className="bg-gray-900 px-6 py-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 bg-yellow-400 flex items-center justify-center text-gray-900 text-sm font-bold flex-shrink-0">
              {initials}
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-white truncate">{person.displayName ?? email}</h2>
              <p className="text-xs text-gray-400 truncate">
                {email} · {total} client{total !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:bg-gray-800 hover:text-white transition-colors flex-shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        {/* User row actions */}
        <div className="px-6 py-3 border-b border-gray-100 flex items-center gap-2 flex-wrap">
          {!user ? (
            <p className="text-xs text-gray-500">
              No user row yet — it is created on their first sign-in (or with Add user).
            </p>
          ) : busy ? (
            <span className="flex items-center gap-2 text-xs text-gray-400">
              <Loader2 size={13} className="animate-spin" /> Saving...
            </span>
          ) : (
            <>
              <span className="text-xs text-gray-500 mr-1">Role</span>
              <div className="inline-flex border border-gray-200">
                {(["USER", "ADMIN"] as AppRole[]).map((r) => (
                  <button
                    key={r}
                    disabled={isSelf || disabled}
                    onClick={() => r !== user.role && onRoleChange(r)}
                    title={isSelf ? "You can't change your own role" : undefined}
                    className={`inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold disabled:cursor-default ${
                      user.role === r ? "bg-gray-900 text-white" : "bg-white text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    {r === "ADMIN" && <Shield size={11} />}
                    {APP_ROLE_LABELS[r]}
                  </button>
                ))}
              </div>
              <span className="text-xs text-gray-400 ml-2">
                {user.lastLoginAt
                  ? `Last sign-in ${user.lastLoginAt.toDate().toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}`
                  : "Never signed in"}
              </span>
              {!isSelf && (
                <div className="ml-auto flex items-center gap-2">
                  <button
                    onClick={onToggleDisabled}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium ${
                      disabled ? "bg-red-500 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                    title={disabled ? "Restore access" : "Revoke access"}
                  >
                    {disabled ? <RotateCcw size={12} /> : <Ban size={12} />}
                    {disabled ? "Revoked · Restore" : "Revoke"}
                  </button>
                  {confirmDelete ? (
                    <button
                      onClick={onDelete}
                      onBlur={() => setConfirmDelete(false)}
                      autoFocus
                      className="px-2.5 py-1 text-xs font-semibold bg-red-500 text-white"
                    >
                      Delete user?
                    </button>
                  ) : (
                    <button
                      onClick={() => setConfirmDelete(true)}
                      className="p-1 text-gray-300 hover:text-red-500"
                      title="Delete the user row (their client allocations stay on the clients)"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {isAdmin && (
          <p className="px-6 py-2 text-[11px] text-gray-500 border-b border-gray-100">
            Admins see and edit every client; allocations here only record their team seats.
          </p>
        )}

        {/* Toolbar */}
        <div className="px-6 py-4 border-b border-gray-100 space-y-3 bg-gray-50">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search clients..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-yellow-400"
              />
            </div>
            <div className="relative">
              <select
                value={agency}
                onChange={(e) => setAgency(e.target.value)}
                className="appearance-none pl-3 pr-8 py-2 text-sm border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-yellow-400 cursor-pointer"
              >
                <option value="ALL">All agencies</option>
                {CLIENT_AGENCIES.map((a) => (
                  <option key={a.value} value={a.value}>
                    {a.label}
                  </option>
                ))}
              </select>
              <ChevronDown size={13} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            </div>
            <div className="inline-flex border border-gray-200 bg-white">
              {(["ALL", "ASSIGNED"] as Show[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setShow(s)}
                  className={`px-3 py-2 text-xs font-medium ${show === s ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-50"}`}
                >
                  {s === "ALL" ? "All" : "Allocated"}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setFiltered(!allEditableSelected)}
              disabled={editable.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-yellow-400 text-gray-900 hover:bg-yellow-300 disabled:opacity-40 transition-colors"
            >
              <Sparkles size={12} />
              {allEditableSelected ? `Remove filtered (${editable.length})` : `Allocate filtered (${editable.length})`}
            </button>
            <span className="text-xs text-gray-400">
              {filtered.length} client{filtered.length !== 1 ? "s" : ""} shown
            </span>
          </div>
        </div>

        {error && (
          <div className="mx-6 mt-3 bg-red-500 text-white px-3 py-2 text-sm">{error}</div>
        )}

        {/* Client list */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <Briefcase size={28} className="mb-2 opacity-40" />
              <p className="text-sm">No clients match your filters.</p>
            </div>
          ) : (
            <ul className="space-y-1.5">
              {filtered.map((c) => {
                const locked = lockedRoles(c);
                const checked = locked.length > 0 || selected.has(c.cl_id);
                return (
                  <li key={c.cl_id}>
                    <button
                      type="button"
                      disabled={locked.length > 0}
                      onClick={() => toggle(c.cl_id)}
                      title={locked.length ? "Set on the client (GM Pod / Business Lead / Digital Lead) — change it on the Clients page" : undefined}
                      className={`w-full flex items-center gap-3 px-3 py-2 border text-left transition-colors ${
                        checked ? "border-gray-900 bg-white" : "border-gray-200 bg-white hover:border-gray-300"
                      } disabled:cursor-default`}
                    >
                      <span
                        className={`w-4 h-4 flex items-center justify-center flex-shrink-0 border ${
                          checked ? (locked.length ? "bg-gray-400 border-gray-400" : "bg-gray-900 border-gray-900") : "border-gray-300"
                        }`}
                      >
                        {checked && <Check size={11} className="text-white" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-gray-900 truncate">
                          {c.CL_Name}
                          {isClientHidden(c) && <span className="ml-2 text-[10px] text-gray-400 uppercase">Hidden</span>}
                        </span>
                        <span className="block text-[11px] text-gray-400 truncate">
                          {c.cl_id} · {c.CL_Agency}
                        </span>
                      </span>
                      {locked.map((r) => (
                        <span key={r} className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium border border-gray-200 bg-gray-100 text-gray-700">
                          <Lock size={9} />
                          {TEAM_ROLE_SHORT[r]}
                        </span>
                      ))}
                      {!locked.length && selected.has(c.cl_id) && (
                        <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium border border-gray-200 text-gray-700"><span className="w-1.5 h-1.5 mr-1 bg-pink-500" />
                          {TEAM_ROLE_SHORT.COLLABORATOR}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between gap-3">
          <span className="text-xs text-gray-500">
            {hasChanges ? (
              <>
                <span className="text-green-700 font-semibold">+{added.length}</span>{" "}
                <span className="text-red-600 font-semibold">−{removed.length}</span> collaborator change
                {added.length + removed.length !== 1 ? "s" : ""}
              </>
            ) : (
              "No changes"
            )}
          </span>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900">
              Cancel
            </button>
            <button
              onClick={save}
              disabled={!hasChanges || saving}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-40"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              Save
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
