// app/(protected)/admin/users/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createUserManually,
  deleteUserRecord,
  fetchUsers,
  setUserDisabled,
  setUserRole,
  type UserProfile,
} from "../../../../lib/services/user-service";
import { fetchAccessibleClients } from "../../../../lib/services/assignment-service";
import { APP_ROLE_LABELS, type AppRole } from "../../../../lib/types/access.types";
import { useUserProfile } from "../../../../lib/hooks/use-user-profile";
import { isValidEmail, normalizeEmail } from "../../../../lib/format/email";
import AccessLevelsCard from "../../../../components/users/access-levels-card";
import AgenciesPanel from "../../../../components/agencies/agencies-panel";
import {
  Shield,
  Users,
  Building2,
  ChevronDown,
  Loader2,
  AlertCircle,
  Search,
  UserPlus,
  Ban,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";

// Flat Plus-palette badge per role (no yellow — reserved for actions/warnings).
const ROLE_BADGE: Record<AppRole, string> = {
  ADMIN: "bg-gray-900 text-white",
  USER: "bg-blue-200 text-blue-900",
};
const ROLES: AppRole[] = ["USER", "ADMIN"];

type MainTab = "team" | "agencies";
type Filter = "ALL" | AppRole | "NEVER" | "REVOKED";

const FILTER_LABELS: Record<Filter, string> = {
  ALL: "All",
  ADMIN: "Admins",
  USER: "Users",
  NEVER: "Never signed in",
  REVOKED: "Revoked",
};

function lastLoginLabel(u: UserProfile): string {
  if (!u.lastLoginAt) return "Never signed in";
  return u.lastLoginAt.toDate().toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function AdminUsersPage() {
  const { profile, isAdmin, loading: profileLoading } = useUserProfile();
  const router = useRouter();

  const [users, setUsers] = useState<UserProfile[]>([]);
  // email → number of client teams the person is on (from CL_Team_Emails).
  const [teamCounts, setTeamCounts] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mainTab, setMainTab] = useState<MainTab>("team");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");
  const [updating, setUpdating] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  // Guard — redirect non-admins
  useEffect(() => {
    if (!profileLoading && !isAdmin) router.replace("/");
  }, [isAdmin, profileLoading, router]);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const [list, clients] = await Promise.all([
          fetchUsers(),
          fetchAccessibleClients(null, true),
        ]);
        const counts = new Map<string, number>();
        for (const c of clients) {
          for (const e of c.CL_Team_Emails ?? []) counts.set(e, (counts.get(e) ?? 0) + 1);
        }
        if (cancelled) return;
        setUsers(list);
        setTeamCounts(counts);
      } catch (err) {
        if (!cancelled) setError("Failed to load users: " + (err instanceof Error ? err.message : "Unknown error"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  /** Runs an update for one row, then patches it locally. */
  async function run(email: string, action: () => Promise<void>, patch: Partial<UserProfile> | null, label: string) {
    setUpdating(email);
    setError("");
    try {
      await action();
      setUsers((prev) =>
        patch ? prev.map((u) => (u.email === email ? { ...u, ...patch } : u)) : prev.filter((u) => u.email !== email)
      );
    } catch (err) {
      setError(`Failed to ${label}: ` + (err instanceof Error ? err.message : "Unknown error"));
    } finally {
      setUpdating(null);
    }
  }

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { ALL: users.length, ADMIN: 0, USER: 0, NEVER: 0, REVOKED: 0 };
    for (const u of users) {
      c[u.role] += 1;
      if (!u.lastLoginAt) c.NEVER += 1;
      if (u.disabled) c.REVOKED += 1;
    }
    return c;
  }, [users]);

  const filteredUsers = useMemo(() => {
    const q = search.toLowerCase();
    return users
      .filter((u) =>
        filter === "ALL" ? true
        : filter === "NEVER" ? !u.lastLoginAt
        : filter === "REVOKED" ? !!u.disabled
        : u.role === filter
      )
      .filter((u) => u.email.includes(q) || (u.displayName ?? "").toLowerCase().includes(q))
      .sort((a, b) => (a.displayName ?? a.email).localeCompare(b.displayName ?? b.email));
  }, [users, filter, search]);

  if (profileLoading || !isAdmin) return null;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Access</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage users, admins and the agency ↔ domain mapping. Client access
            comes from client teams; dashboard access from Dashboard Access.
          </p>
        </div>
        <button
          onClick={() => setAddOpen((v) => !v)}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-gray-900 text-white hover:bg-gray-800 transition-colors flex-shrink-0"
        >
          <UserPlus size={16} />
          Add user
        </button>
      </div>

      {addOpen && (
        <AddUserForm
          existing={users}
          createdBy={profile?.email ?? ""}
          onClose={() => setAddOpen(false)}
          onCreated={(u) => {
            setUsers((prev) => [...prev, u]);
            setAddOpen(false);
          }}
        />
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 bg-red-500 border border-red-500 text-white px-4 py-3 rounded-lg mb-4 text-sm">
          <AlertCircle size={16} className="flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Stat tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
        <StatTile label="Total" value={counts.ALL} accent="bg-gray-900 text-white" />
        <StatTile label="Admins" value={counts.ADMIN} accent={ROLE_BADGE.ADMIN} />
        <StatTile label="Users" value={counts.USER} accent={ROLE_BADGE.USER} />
        <StatTile label="Never signed in" value={counts.NEVER} accent="bg-gray-100 text-gray-600" />
        <StatTile label="Revoked" value={counts.REVOKED} accent="bg-red-500 text-white" />
      </div>

      {/* Segmented tabs */}
      <div className="inline-flex border border-gray-200 rounded-lg overflow-hidden mb-6">
        <TabButton active={mainTab === "team"} onClick={() => setMainTab("team")} icon={<Users size={15} />} label="Users" />
        <TabButton
          active={mainTab === "agencies"}
          onClick={() => setMainTab("agencies")}
          icon={<Building2 size={15} />}
          label="Agencies & Domains"
        />
      </div>

      {mainTab === "agencies" ? (
        <>
          <p className="text-xs text-gray-500 max-w-xl mb-4">
            The domain ↔ agency mapping decides a person&apos;s agency on dashboards
            in Agency mode. It is read live — changes apply to everyone at once.
          </p>
          <AgenciesPanel />
        </>
      ) : (
        <>
          <AccessLevelsCard className="mb-6" />

          {/* Search + filter */}
          <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[220px] max-w-sm">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search by name or email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
              />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {(Object.keys(FILTER_LABELS) as Filter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                    filter === f
                      ? "bg-gray-900 border-gray-900 text-white"
                      : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
                  }`}
                >
                  {FILTER_LABELS[f]}
                </button>
              ))}
            </div>
          </div>

          {/* User list */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-16 gap-2 text-gray-400">
                <Loader2 size={18} className="animate-spin" />
                <span className="text-sm">Loading users...</span>
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                <Users size={32} className="mb-2 opacity-40" />
                <p className="text-sm">No users found.</p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {filteredUsers.map((u) => (
                  <UserRow
                    key={u.email}
                    user={u}
                    teamCount={teamCounts.get(u.email) ?? 0}
                    updating={updating === u.email}
                    isSelf={u.email === profile?.email}
                    onRoleChange={(role) => run(u.email, () => setUserRole(u.email, role), { role }, "update role")}
                    onToggleDisabled={() =>
                      run(u.email, () => setUserDisabled(u.email, !u.disabled), { disabled: !u.disabled }, "update access")
                    }
                    onDelete={() => run(u.email, () => deleteUserRecord(u.email), null, "delete user")}
                  />
                ))}
              </ul>
            )}
          </div>

          <p className="mt-3 text-xs text-gray-400">
            {filteredUsers.length} user{filteredUsers.length !== 1 ? "s" : ""} shown
          </p>
        </>
      )}
    </div>
  );
}

// ─── Add user ─────────────────────────────────────────────────────────────────

function AddUserForm({
  existing,
  createdBy,
  onClose,
  onCreated,
}: {
  existing: UserProfile[];
  createdBy: string;
  onClose: () => void;
  onCreated: (u: UserProfile) => void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AppRole>("USER");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const normalized = normalizeEmail(email);
  const duplicate = existing.some((u) => u.email === normalized);
  const canSave = isValidEmail(normalized) && !duplicate && !saving;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setError("");
    try {
      onCreated(await createUserManually(normalized, role, createdBy));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add user.");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="mb-6 bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-900">Add a user</h2>
        <button type="button" onClick={onClose} className="p-1 text-gray-400 hover:text-gray-900" title="Close">
          <X size={16} />
        </button>
      </div>
      <p className="text-xs text-gray-500 mb-3">
        They can be put on client teams and dashboard grants right away; their
        first Google sign-in links this row.
      </p>
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="email"
          autoFocus
          placeholder="name@agency.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="flex-1 min-w-[220px] px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-400"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as AppRole)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white"
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {APP_ROLE_LABELS[r]}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={!canSave}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-yellow-400 text-gray-900 hover:bg-yellow-300 disabled:opacity-50 transition-colors"
        >
          {saving && <Loader2 size={14} className="animate-spin" />}
          Add
        </button>
      </div>
      {duplicate && <p className="mt-2 text-xs text-red-600">{normalized} is already a user.</p>}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </form>
  );
}

// ─── Stat tile ──────────────────────────────────────────────────────────────

function StatTile({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3">
      <div className={`inline-flex items-center px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${accent}`}>
        {label}
      </div>
      <p className="mt-2 text-2xl font-bold text-gray-900 leading-none">{value}</p>
    </div>
  );
}

// ─── Tab button ───────────────────────────────────────────────────────────────

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${
        active ? "bg-gray-900 text-white" : "bg-white text-gray-600 hover:bg-gray-50"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

// ─── User row ─────────────────────────────────────────────────────────────────

function UserRow({
  user,
  teamCount,
  updating,
  isSelf,
  onRoleChange,
  onToggleDisabled,
  onDelete,
}: {
  user: UserProfile;
  teamCount: number;
  updating: boolean;
  isSelf: boolean;
  onRoleChange: (role: AppRole) => void;
  onToggleDisabled: () => void;
  onDelete: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const initials = user.displayName
    ? user.displayName.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : user.email[0].toUpperCase();
  const disabled = !!user.disabled;

  return (
    <li className={`flex items-center gap-3 px-4 py-3 transition-colors ${disabled ? "bg-gray-50" : "hover:bg-gray-50"}`}>
      {/* Avatar */}
      <div
        className={`w-9 h-9 flex items-center justify-center text-xs font-bold flex-shrink-0 ${
          disabled ? "bg-gray-200 text-gray-400" : "bg-yellow-400 text-gray-900"
        }`}
      >
        {initials}
      </div>

      {/* Name + email */}
      <div className="min-w-0 flex-1">
        <p className={`font-medium truncate ${disabled ? "text-gray-400" : "text-gray-900"}`}>
          {user.displayName ?? "—"}
        </p>
        <p className="text-gray-400 text-xs truncate">{user.email}</p>
      </div>

      {/* Last login */}
      <div className="hidden md:block w-32 text-right">
        <span className={`text-xs ${user.lastLoginAt ? "text-gray-500" : "text-gray-300"}`}>{lastLoginLabel(user)}</span>
      </div>

      {/* Client teams */}
      <div className="hidden sm:block w-20 text-right">
        <span className={`text-xs ${teamCount ? "text-gray-600" : "text-gray-300"}`}>
          {teamCount} team{teamCount !== 1 ? "s" : ""}
        </span>
      </div>

      {updating ? (
        <div className="flex items-center gap-2 text-gray-400 text-sm w-28 justify-center">
          <Loader2 size={14} className="animate-spin" />
          Saving...
        </div>
      ) : disabled ? (
        <>
          <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-semibold bg-red-500 text-white">
            Revoked
          </span>
          <button
            onClick={onToggleDisabled}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900 transition-colors"
            title="Restore access"
          >
            <RotateCcw size={13} />
            Restore
          </button>
        </>
      ) : (
        <>
          {/* Role selector — your own role is locked (no self-demotion lockout) */}
          <div className="relative flex-shrink-0">
            <select
              value={user.role}
              disabled={isSelf}
              onChange={(e) => onRoleChange(e.target.value as AppRole)}
              className={`appearance-none pl-7 pr-7 py-1.5 text-xs font-semibold rounded-lg border-transparent cursor-pointer disabled:cursor-default focus:outline-none focus:ring-2 focus:ring-yellow-400 ${ROLE_BADGE[user.role]}`}
            >
              {ROLES.map((role) => (
                <option key={role} value={role} className="bg-white text-gray-900">
                  {APP_ROLE_LABELS[role]}
                </option>
              ))}
            </select>
            <div className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2">
              {user.role === "ADMIN" && <Shield size={12} />}
            </div>
            <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 opacity-70">
              <ChevronDown size={12} />
            </div>
          </div>

          {!isSelf && (
            <button
              onClick={onToggleDisabled}
              className="p-1.5 text-gray-300 hover:text-red-500 transition-colors flex-shrink-0"
              title="Revoke access"
            >
              <Ban size={16} />
            </button>
          )}
        </>
      )}

      {/* Delete the row — two clicks; never your own */}
      {!isSelf && !updating && (
        confirmDelete ? (
          <button
            onClick={onDelete}
            onBlur={() => setConfirmDelete(false)}
            autoFocus
            className="px-2 py-1 text-[11px] font-semibold bg-red-500 text-white flex-shrink-0"
            title="Delete this user row"
          >
            Delete?
          </button>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            className="p-1.5 text-gray-300 hover:text-red-500 transition-colors flex-shrink-0"
            title="Delete user"
          >
            <Trash2 size={16} />
          </button>
        )
      )}
    </li>
  );
}
