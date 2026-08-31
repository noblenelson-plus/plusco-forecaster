// app/(protected)/admin/users/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, doc, updateDoc } from "firebase/firestore";
import { db } from "../../../../lib/firebase";
import {
  UserProfile,
  UserRole,
  setUserDisabled,
} from "../../../../lib/services/user-service";
import { ROLE_LABELS, ROLE_ORDER } from "../../../../lib/types/user.types";
import type { Invite } from "../../../../lib/types/invite.types";
import { useUserProfile } from "../../../../lib/hooks/use-user-profile";
import {
  resolveAgenciesForEmail,
  syncUserAgenciesFromDomains,
} from "../../../../lib/services/agency-service";
import {
  fetchInvites,
  deleteInvite,
  updateInviteRole,
  updateInviteClients,
} from "../../../../lib/services/invite-service";
import { useRouter } from "next/navigation";
import UserClientsDrawer from "../../../../components/users/user-clients-drawer";
import AccessLevelsCard from "../../../../components/users/access-levels-card";
import AgenciesPanel from "../../../../components/agencies/agencies-panel";
import InviteModal from "../../../../components/users/invite-modal";
import {
  Shield,
  Users,
  Building2,
  ChevronDown,
  Loader2,
  AlertCircle,
  Search,
  RefreshCw,
  UserPlus,
  Ban,
  RotateCcw,
  Mail,
} from "lucide-react";

// Flat Plus-palette badge per role (no yellow — reserved for actions/warnings).
const ROLE_BADGE: Record<UserRole, string> = {
  ADMIN: "bg-gray-900 text-white",
  EXEC: "bg-purple-600 text-white",
  BUSINESS_LEAD: "bg-blue-200 text-blue-900",
  VIEWER: "bg-gray-100 text-gray-600",
};

type MainTab = "team" | "agencies";
type RoleFilter = "ALL" | UserRole;

// Pending invites are shown inline in the team list as lightweight pseudo-users
// (no `users` doc exists yet — it's created on first sign-in). We tag them with
// `pending` and key them by a prefixed synthetic uid so the existing handlers
// can tell them apart and route writes to the invite doc instead.
const INVITE_UID_PREFIX = "invite:";
type Row = UserProfile & { pending?: boolean };
const inviteEmailFromUid = (uid: string) =>
  uid.slice(INVITE_UID_PREFIX.length);

export default function AdminUsersPage() {
  const { profile, isAdmin, loading: profileLoading } = useUserProfile();
  const router = useRouter();

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mainTab, setMainTab] = useState<MainTab>("team");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("ALL");
  const [updatingUid, setUpdatingUid] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);

  // Client assignment drawer
  const [assignUser, setAssignUser] = useState<Row | null>(null);

  // Guard — redirect non-admins
  useEffect(() => {
    if (!profileLoading && !isAdmin) {
      router.replace("/");
    }
  }, [isAdmin, profileLoading, router]);

  // Fetch all users + pending invites
  useEffect(() => {
    if (!isAdmin) return;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const [snapshot, inviteList] = await Promise.all([
          getDocs(collection(db, "users")),
          fetchInvites(),
        ]);
        setUsers(
          snapshot.docs.map((d) => ({
            uid: d.id,
            ...(d.data() as Omit<UserProfile, "uid">),
          }))
        );
        setInvites(inviteList);
      } catch (err) {
        setError("Failed to load users: " + (err instanceof Error ? err.message : "Unknown error"));
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [isAdmin]);

  async function reloadInvites() {
    try {
      setInvites(await fetchInvites());
    } catch {
      /* non-fatal — the list just won't refresh */
    }
  }

  async function handleRevokeInvite(email: string) {
    try {
      await deleteInvite(email);
      setInvites((prev) => prev.filter((i) => i.email !== email));
    } catch (err) {
      setError(
        "Failed to revoke invite: " +
          (err instanceof Error ? err.message : "Unknown error")
      );
    }
  }

  async function handleToggleDisabled(target: Row) {
    // For a pending invite, "remove access" means revoking the invite.
    if (target.pending) {
      await handleRevokeInvite(target.email);
      return;
    }
    setUpdatingUid(target.uid);
    setError("");
    try {
      const next = !target.disabled;
      await setUserDisabled(target.uid, next);
      setUsers((prev) =>
        prev.map((u) => (u.uid === target.uid ? { ...u, disabled: next } : u))
      );
    } catch (err) {
      setError(
        "Failed to update access: " +
          (err instanceof Error ? err.message : "Unknown error")
      );
    } finally {
      setUpdatingUid(null);
    }
  }

  async function handleRoleChange(target: Row, newRole: UserRole) {
    setUpdatingUid(target.uid);
    try {
      // Pending invite — just update the pre-provisioned role on the invite doc.
      if (target.pending) {
        await updateInviteRole(target.email, newRole);
        setInvites((prev) =>
          prev.map((i) =>
            i.email === target.email ? { ...i, role: newRole } : i
          )
        );
        return;
      }
      // Re-resolve the user's agencies from their email domain — their account
      // may predate the domain mapping being configured. Union with existing so
      // an unconfigured domain never wipes agencies (protects manually-set ones).
      const resolved = target.email
        ? await resolveAgenciesForEmail(target.email)
        : [];
      const mergedAgencies = Array.from(
        new Set([...(target.assignedAgencies ?? []), ...resolved])
      );
      await updateDoc(doc(db, "users", target.uid), {
        role: newRole,
        assignedAgencies: mergedAgencies,
      });
      setUsers((prev) =>
        prev.map((u) =>
          u.uid === target.uid
            ? { ...u, role: newRole, assignedAgencies: mergedAgencies }
            : u
        )
      );
    } catch (err) {
      setError("Failed to update role: " + (err instanceof Error ? err.message : "Unknown error"));
    } finally {
      setUpdatingUid(null);
    }
  }

  // Re-sync every user's agencies from the configured domain mapping. Runs as
  // admin (rules allow admin writes). Union-only, so nothing is ever removed.
  async function handleSyncAgencies() {
    setSyncing(true);
    setSyncMsg("");
    setError("");
    try {
      const changes = await syncUserAgenciesFromDomains(
        users
          .filter((u) => !u.disabled)
          .map((u) => ({
            uid: u.uid,
            email: u.email,
            assignedAgencies: u.assignedAgencies,
          }))
      );
      if (changes.length) {
        const byUid = new Map(changes.map((c) => [c.uid, c.agencies]));
        setUsers((prev) =>
          prev.map((u) =>
            byUid.has(u.uid)
              ? { ...u, assignedAgencies: byUid.get(u.uid) }
              : u
          )
        );
      }
      setSyncMsg(
        changes.length
          ? `Updated ${changes.length} user${changes.length !== 1 ? "s" : ""}.`
          : "Everyone is already in sync."
      );
    } catch (err) {
      setError(
        "Failed to sync agencies: " +
          (err instanceof Error ? err.message : "Unknown error")
      );
    } finally {
      setSyncing(false);
    }
  }

  // After the drawer saves — update the client counter locally. Routes to the
  // right collection depending on whether this is a real user or an invite.
  function handleAssignmentsSaved(uid: string, assignedClients: string[]) {
    if (uid.startsWith(INVITE_UID_PREFIX)) {
      const email = inviteEmailFromUid(uid);
      setInvites((prev) =>
        prev.map((i) => (i.email === email ? { ...i, assignedClients } : i))
      );
    } else {
      setUsers((prev) =>
        prev.map((u) => (u.uid === uid ? { ...u, assignedClients } : u))
      );
    }
    setAssignUser(null);
  }

  // Per-role counts for the stat tiles.
  const roleCounts = useMemo(() => {
    const counts: Record<UserRole, number> = {
      ADMIN: 0,
      EXEC: 0,
      BUSINESS_LEAD: 0,
      VIEWER: 0,
    };
    users.forEach((u) => {
      if (u.role in counts) counts[u.role] += 1;
    });
    return counts;
  }, [users]);

  // How many users belong to each agency (drives the agency card badges).
  const userCountByAgency = useMemo(() => {
    const map: Record<string, number> = {};
    users.forEach((u) =>
      (u.assignedAgencies ?? []).forEach((a) => {
        map[a] = (map[a] ?? 0) + 1;
      })
    );
    return map;
  }, [users]);

  // Pending invites rendered as lightweight pseudo-users, merged into the list.
  // Agencies are unknown until first sign-in (resolved from the email domain),
  // hence empty here.
  const inviteRows = useMemo<Row[]>(
    () =>
      invites.map((inv) => ({
        uid: INVITE_UID_PREFIX + inv.email,
        email: inv.email,
        displayName: null,
        photoURL: null,
        role: inv.role,
        assignedClients: inv.assignedClients ?? [],
        assignedAgencies: [],
        disabled: false,
        createdAt: null,
        lastLoginAt: null,
        pending: true,
      })),
    [invites]
  );

  const filteredUsers = useMemo(() => {
    const q = search.toLowerCase();
    const all: Row[] = [...users, ...inviteRows];
    return all
      .filter((u) => roleFilter === "ALL" || u.role === roleFilter)
      .filter(
        (u) =>
          u.email.toLowerCase().includes(q) ||
          (u.displayName ?? "").toLowerCase().includes(q)
      )
      .sort((a, b) => {
        // Pending invites sink to the bottom; then alphabetical.
        if (!!a.pending !== !!b.pending) return a.pending ? 1 : -1;
        return (a.displayName ?? a.email).localeCompare(b.displayName ?? b.email);
      });
  }, [users, inviteRows, roleFilter, search]);

  if (profileLoading) return null;
  if (!isAdmin) return null;

  // When the assignment drawer targets a pending invite, save to the invite doc.
  const pendingAssignEmail = assignUser?.pending ? assignUser.email : null;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Access</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage team roles, client assignments and the agency ↔ domain mapping.
          </p>
        </div>
        <button
          onClick={() => setInviteOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-gray-900 text-white hover:bg-gray-800 transition-colors flex-shrink-0"
        >
          <UserPlus size={16} />
          Invite
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 bg-red-500 border border-red-500 text-white px-4 py-3 rounded-lg mb-4 text-sm">
          <AlertCircle size={16} className="flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Stat tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
        <StatTile label="Total" value={users.length} accent="bg-gray-900 text-white" />
        {ROLE_ORDER.slice()
          .reverse()
          .map((role) => (
            <StatTile
              key={role}
              label={ROLE_LABELS[role]}
              value={roleCounts[role]}
              accent={ROLE_BADGE[role]}
            />
          ))}
      </div>

      {/* Segmented tabs */}
      <div className="inline-flex border border-gray-200 rounded-lg overflow-hidden mb-6">
        <TabButton
          active={mainTab === "team"}
          onClick={() => setMainTab("team")}
          icon={<Users size={15} />}
          label="Team"
        />
        <TabButton
          active={mainTab === "agencies"}
          onClick={() => setMainTab("agencies")}
          icon={<Building2 size={15} />}
          label="Agencies & Domains"
        />
      </div>

      {mainTab === "agencies" ? (
        <>
          {/* Sync agencies from the domain mapping */}
          <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
            <p className="text-xs text-gray-500 max-w-md">
              After editing domains, re-apply the mapping to existing accounts.
              This only <strong>adds</strong> agency access — it never removes any.
            </p>
            <div className="flex items-center gap-3">
              {syncMsg && (
                <span className="text-xs font-medium text-gray-500">
                  {syncMsg}
                </span>
              )}
              <button
                onClick={handleSyncAgencies}
                disabled={syncing}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50 transition-colors"
              >
                {syncing ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <RefreshCw size={15} />
                )}
                Sync agencies from domains
              </button>
            </div>
          </div>
          <AgenciesPanel userCountByAgency={userCountByAgency} />
        </>
      ) : (
        <>
          <AccessLevelsCard className="mb-6" />

          {/* Search + role filter */}
          <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[220px] max-w-sm">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                type="text"
                placeholder="Search by name or email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setRoleFilter("ALL")}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                  roleFilter === "ALL"
                    ? "bg-gray-900 border-gray-900 text-white"
                    : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
                }`}
              >
                All
              </button>
              {ROLE_ORDER.slice()
                .reverse()
                .map((role) => (
                  <button
                    key={role}
                    onClick={() => setRoleFilter(role)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                      roleFilter === role
                        ? `${ROLE_BADGE[role]} border-transparent`
                        : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
                    }`}
                  >
                    {ROLE_LABELS[role]}
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
                    key={u.uid}
                    user={u}
                    updating={updatingUid === u.uid}
                    isSelf={u.uid === profile?.uid}
                    onRoleChange={(role) => handleRoleChange(u, role)}
                    onAssignClients={() => setAssignUser(u)}
                    onToggleDisabled={() => handleToggleDisabled(u)}
                  />
                ))}
              </ul>
            )}
          </div>

          <p className="mt-3 text-xs text-gray-400">
            {filteredUsers.length} user{filteredUsers.length !== 1 ? "s" : ""}{" "}
            shown
          </p>
        </>
      )}

      {/* User → clients assignment drawer */}
      <UserClientsDrawer
        open={!!assignUser}
        user={assignUser}
        onClose={() => setAssignUser(null)}
        onSaved={handleAssignmentsSaved}
        saveFn={
          pendingAssignEmail
            ? (clients) => updateInviteClients(pendingAssignEmail, clients)
            : undefined
        }
      />

      {/* Invite (pre-provision) modal — mounted only while open */}
      {inviteOpen && (
        <InviteModal
          onClose={() => setInviteOpen(false)}
          onCreated={reloadInvites}
          createdBy={profile?.email}
        />
      )}
    </div>
  );
}

// ─── Stat tile ──────────────────────────────────────────────────────────────

function StatTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3">
      <div
        className={`inline-flex items-center px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${accent}`}
      >
        {label}
      </div>
      <p className="mt-2 text-2xl font-bold text-gray-900 leading-none">
        {value}
      </p>
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
        active
          ? "bg-gray-900 text-white"
          : "bg-white text-gray-600 hover:bg-gray-50"
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
  updating,
  isSelf,
  onRoleChange,
  onAssignClients,
  onToggleDisabled,
}: {
  user: Row;
  updating: boolean;
  isSelf: boolean;
  onRoleChange: (role: UserRole) => void;
  onAssignClients: () => void;
  onToggleDisabled: () => void;
}) {
  const pending = !!user.pending;
  const initials = user.displayName
    ? user.displayName.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : user.email[0].toUpperCase();

  const agencies = user.assignedAgencies ?? [];
  const clientCount = user.assignedClients?.length ?? 0;
  const isBL = user.role === "BUSINESS_LEAD";
  const disabled = !!user.disabled;

  return (
    <li
      className={`flex items-center gap-3 px-4 py-3 transition-colors ${
        disabled ? "bg-gray-50/60" : "hover:bg-gray-50"
      }`}
    >
      {/* Avatar — a mail glyph for not-yet-signed-in invites */}
      <div
        className={`w-9 h-9 flex items-center justify-center text-xs font-bold flex-shrink-0 ${
          pending
            ? "bg-gray-100 text-gray-400"
            : disabled
              ? "bg-gray-200 text-gray-400"
              : "bg-yellow-400 text-gray-900"
        }`}
      >
        {pending ? <Mail size={15} /> : initials}
      </div>

      {/* Name + email */}
      <div className="min-w-0 flex-1">
        <p
          className={`font-medium truncate ${
            disabled ? "text-gray-400" : "text-gray-900"
          }`}
        >
          {user.displayName ?? user.email}
        </p>
        <p className="text-gray-400 text-xs truncate">
          {pending ? "Invited · awaiting first sign-in" : user.email}
        </p>
      </div>

      {disabled ? (
        <>
          <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-semibold bg-red-500 text-white">
            Revoked
          </span>
          {updating ? (
            <Loader2 size={15} className="animate-spin text-gray-400" />
          ) : (
            <button
              onClick={onToggleDisabled}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900 transition-colors"
              title="Restore access"
            >
              <RotateCcw size={13} />
              Restore
            </button>
          )}
        </>
      ) : (
        <>
          {/* Invited badge */}
          {pending && (
            <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-semibold bg-gray-100 text-gray-600 flex-shrink-0">
              Invited
            </span>
          )}

          {/* Agency chips */}
          <div className="hidden md:flex items-center gap-1 flex-wrap justify-end max-w-[200px]">
            {pending ? (
              <span className="text-xs text-gray-300">Set at sign-in</span>
            ) : agencies.length === 0 ? (
              <span className="text-xs text-gray-300">No agency</span>
            ) : agencies.length <= 2 ? (
              agencies.map((a) => (
                <span
                  key={a}
                  className="inline-flex items-center px-2 py-0.5 text-[11px] font-medium bg-gray-100 text-gray-600"
                >
                  {a}
                </span>
              ))
            ) : (
              <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-medium bg-gray-100 text-gray-600">
                {agencies.length} agencies
              </span>
            )}
          </div>

          {/* Assigned clients — only meaningful for Business Leads (edit set) */}
          <div className="hidden sm:block w-24 text-right">
            {isBL ? (
              <button
                type="button"
                onClick={onAssignClients}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-800 transition-colors cursor-pointer"
                title="Manage editable clients"
              >
                {clientCount} client{clientCount !== 1 ? "s" : ""}
              </button>
            ) : (
              <span className="text-[11px] text-gray-300">agency-scoped</span>
            )}
          </div>

          {/* Role selector */}
          <div className="flex-shrink-0">
            {updating ? (
              <div className="flex items-center gap-2 text-gray-400 text-sm w-28 justify-center">
                <Loader2 size={14} className="animate-spin" />
                Saving...
              </div>
            ) : (
              <div className="relative">
                <select
                  value={user.role}
                  onChange={(e) => onRoleChange(e.target.value as UserRole)}
                  className={`appearance-none pl-7 pr-7 py-1.5 text-xs font-semibold rounded-lg border-transparent cursor-pointer focus:outline-none focus:ring-2 focus:ring-yellow-400 ${ROLE_BADGE[user.role]}`}
                >
                  {ROLE_ORDER.map((role) => (
                    <option key={role} value={role} className="bg-white text-gray-900">
                      {ROLE_LABELS[role]}
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
            )}
          </div>

          {/* Remove access / revoke invite — hidden for your own account */}
          {!isSelf && !updating && (
            <button
              onClick={onToggleDisabled}
              className="p-1.5 text-gray-300 hover:text-red-500 transition-colors flex-shrink-0"
              title={pending ? "Revoke invite" : "Remove access"}
            >
              <Ban size={16} />
            </button>
          )}
        </>
      )}
    </li>
  );
}
