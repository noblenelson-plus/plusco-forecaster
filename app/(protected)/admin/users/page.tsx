// app/(protected)/admin/users/page.tsx
"use client";

/**
 * Admin → Access → Forecast Access. Everyone with a seat on a client team
 * (GM, Business Lead, Digital Lead, collaborator) plus every users row, with
 * the role(s) they hold and how many clients they are allocated. Clicking the
 * count opens the person → clients panel; the Clients view does the reverse
 * (client → people). Allocations are collaborator seats on the client doc
 * (lib/format/client-team.ts).
 */

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
import type { Client } from "../../../../lib/types/client.types";
import { useUserProfile } from "../../../../lib/hooks/use-user-profile";
import { isValidEmail, nameFromEmail, normalizeEmail } from "../../../../lib/format/email";
import { isClientHidden } from "../../../../lib/format/client";
import {
  teamMemberships,
  teamSeats,
  TEAM_ROLES,
  TEAM_ROLE_LABELS,
  type TeamRole,
} from "../../../../lib/format/client-team";
import PageHeader from "../../../../components/_shared/page-header";
import StatCard from "../../../../components/dashboard/charts/stat-card";
import AccessLevelsCard from "../../../../components/users/access-levels-card";
import PersonClientsDrawer, { type AccessPerson } from "../../../../components/users/person-clients-drawer";
import ClientPeopleDrawer from "../../../../components/users/client-people-drawer";
import TeamSheetImportModal from "../../../../components/users/team-sheet-import-modal";
import { exportToNewSheet } from "../../../../components/forecaster/table/table-export";
import { buildTeamSheet, TEAM_SHEET_ROLES, type TeamSheetChange } from "../../../../lib/format/team-sheet";
import {
  Users,
  UsersRound,
  Crown,
  MonitorSmartphone,
  Briefcase,
  Loader2,
  AlertCircle,
  Search,
  UserPlus,
  X,
  Download,
  Upload,
  FileSpreadsheet,
  ExternalLink,
} from "lucide-react";

const ROLES: AppRole[] = ["USER", "ADMIN"];

type View = "people" | "clients";
type Filter = "ALL" | "ADMIN" | TeamRole;

const FILTERS: Filter[] = ["ALL", "ADMIN", "GM", "BL", "DL", "COLLABORATOR"];
const FILTER_LABELS: Record<Filter, string> = {
  ALL: "All",
  ADMIN: "Admin",
  GM: "GM",
  BL: "BL",
  DL: "DL",
  COLLABORATOR: "Collaborator",
};

// One Plus-palette color per role: badge dot and scorecard icon.
const ROLE_DOT: Record<"ADMIN" | TeamRole, string> = {
  ADMIN: "bg-gray-900",
  GM: "bg-purple-600",
  BL: "bg-green-500",
  DL: "bg-blue-400",
  COLLABORATOR: "bg-pink-500",
};
const ROLE_ICON: Record<TeamRole, string> = {
  GM: "text-purple-600",
  BL: "text-green-500",
  DL: "text-blue-400",
  COLLABORATOR: "text-pink-500",
};



/** Shows ~20 rows, then the table scrolls (rows are h-14 = 3.5rem). */
const TABLE_MAX_H = "max-h-[73.5rem]";

/** Highest role first: a person shows only their top role. */
type PrimaryRole = "ADMIN" | TeamRole;

interface PersonRow extends AccessPerson {
  isAdmin: boolean;
  roles: TeamRole[];
  /** Admin > GM > Business Lead > Digital Lead > Collaborator; null = no client. */
  primary: PrimaryRole | null;
}

export default function AdminUsersPage() {
  const { profile, isAdmin, loading: profileLoading } = useUserProfile();
  const router = useRouter();

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [view, setView] = useState<View>("people");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");
  const [updating, setUpdating] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [openPerson, setOpenPerson] = useState<string | null>(null);
  const [openClient, setOpenClient] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportedUrl, setExportedUrl] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [imported, setImported] = useState<number | null>(null);

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
        const [list, all] = await Promise.all([fetchUsers(), fetchAccessibleClients(null, true)]);
        if (cancelled) return;
        setUsers(list);
        setClients([...all].sort((a, b) => a.CL_Name.localeCompare(b.CL_Name)));
      } catch (err) {
        if (!cancelled) setError("Failed to load: " + (err instanceof Error ? err.message : "Unknown error"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  /** Runs an update on one users row, then patches it locally. */
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

  function patchClients(updated: Client[]) {
    const byId = new Map(updated.map((c) => [c.cl_id, c]));
    setClients((prev) => prev.map((c) => byId.get(c.cl_id) ?? c));
  }

  /**
   * Every client team to a new Google Sheet (all clients, whatever the view
   * filters — the import treats each client's rows as its full team). Text
   * cells get a leading apostrophe so ids like "1e820aff" stay text.
   */
  async function exportTeams() {
    setExporting(true);
    setError("");
    setExportedUrl(null);
    try {
      const table = buildTeamSheet(clients);
      const url = await exportToNewSheet({
        title: `Client teams — ${new Date().toISOString().slice(0, 10)}`,
        sheetTitle: "Client teams",
        matrix: table.map((row, r) => (r === 0 ? row : row.map((v) => (v ? `'${v}` : v)))),
        dropdowns: { Role: TEAM_SHEET_ROLES },
      });
      setExportedUrl(url);
    } catch (err) {
      setError("Google Sheets export failed: " + (err instanceof Error ? err.message : "Unknown error"));
    } finally {
      setExporting(false);
    }
  }

  function applyImported(changes: TeamSheetChange[]) {
    const byId = new Map(changes.map((c) => [c.cl_id, c]));
    setClients((prev) =>
      prev.map((c) => {
        const ch = byId.get(c.cl_id);
        return ch
          ? {
              ...c,
              CL_Business_Lead: ch.CL_Business_Lead,
              CL_Digital_Lead: ch.CL_Digital_Lead,
              CL_Collaborators: ch.CL_Collaborators,
              CL_Team_Emails: ch.CL_Team_Emails,
            }
          : c;
      })
    );
    setImportOpen(false);
    setImported(changes.length);
  }

  const userEmails = useMemo(() => new Set(users.map((u) => u.email)), [users]);

  // Every users row + every team email without one.
  const people = useMemo<PersonRow[]>(() => {
    const memberships = teamMemberships(clients);
    const byEmail = new Map(users.map((u) => [u.email, u]));
    const emails = new Set([...byEmail.keys(), ...memberships.keys()]);
    return [...emails]
      .map((email) => {
        const user = byEmail.get(email) ?? null;
        const mine = memberships.get(email) ?? new Map<string, TeamRole[]>();
        const held = new Set([...mine.values()].flat());
        return {
          email,
          displayName: user?.displayName ?? null,
          user,
          clients: mine,
          isAdmin: user?.role === "ADMIN",
          roles: TEAM_ROLES.filter((r) => held.has(r)),
          primary: (user?.role === "ADMIN" ? "ADMIN" : TEAM_ROLES.find((r) => held.has(r)) ?? null) as PrimaryRole | null,
        };
      })
      .sort((a, b) => (a.displayName ?? nameFromEmail(a.email)).localeCompare(b.displayName ?? nameFromEmail(b.email)));
  }, [users, clients]);

  // The table lists admins and people with ≥1 client; the rest only show up
  // when searched for.
  const allocated = useMemo(() => people.filter((p) => p.primary !== null), [people]);

  // One role per person (their top role), so the cards and filters add up.
  const filterCounts = useMemo(() => {
    const c = { ALL: allocated.length, ADMIN: 0, GM: 0, BL: 0, DL: 0, COLLABORATOR: 0 } as Record<Filter, number>;
    for (const p of allocated) if (p.primary) c[p.primary] += 1;
    return c;
  }, [allocated]);
  const stats = { total: allocated.length, ...filterCounts };

  const filteredPeople = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (q ? people : allocated)
      .filter((p) => filter === "ALL" || p.primary === filter)
      .filter(
        (p) =>
          !q ||
          p.email.includes(q) ||
          (p.displayName ?? nameFromEmail(p.email)).toLowerCase().includes(q)
      );
  }, [people, allocated, filter, search]);
  const hiddenCount = people.length - allocated.length;

  const filteredClients = useMemo(() => {
    const q = search.trim().toLowerCase();
    return clients.filter(
      (c) =>
        !q ||
        c.CL_Name.toLowerCase().includes(q) ||
        c.cl_id.toLowerCase().includes(q) ||
        (c.CL_Team_Emails ?? []).some((e) => e.includes(q))
    );
  }, [clients, search]);

  const person = openPerson ? people.find((p) => p.email === openPerson) ?? null : null;
  const client = openClient ? clients.find((c) => c.cl_id === openClient) ?? null : null;

  if (profileLoading || !isAdmin) return null;

  return (
    <div className="flex min-h-[calc(100vh/var(--app-zoom,1))] flex-col bg-muted">
      <PageHeader
        title="Forecast Access"
        description="Who is on which client team, and admins. Dashboard tabs are granted on Access → Dashboard Access."
        actions={
          <button
            onClick={() => setAddOpen((v) => !v)}
            className="flex items-center gap-1.5 border border-gray-900 bg-gray-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-gray-800"
          >
            <UserPlus size={14} />
            Add user
          </button>
        }
      />

      <main className="mx-auto w-full max-w-[1100px] flex-1 space-y-5 p-6 md:p-8">
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

        {error && (
          <div className="flex items-center gap-2 bg-red-500 text-white px-4 py-3 text-sm">
            <AlertCircle size={16} className="flex-shrink-0" />
            {error}
          </div>
        )}

        {exportedUrl && (
          <div className="flex items-center justify-between gap-3 bg-green-500 text-white px-4 py-3 text-sm">
            <span className="flex items-center gap-2">
              <FileSpreadsheet size={15} />
              Client teams exported to a new Google Sheet in your Drive.
            </span>
            <span className="flex items-center gap-3 flex-shrink-0">
              <a href={exportedUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 font-medium underline underline-offset-2">
                Open sheet <ExternalLink size={13} />
              </a>
              <button onClick={() => setExportedUrl(null)} title="Dismiss">
                <X size={15} />
              </button>
            </span>
          </div>
        )}
        {imported !== null && (
          <div className="flex items-center justify-between gap-3 bg-green-500 text-white px-4 py-3 text-sm">
            <span>Import applied — {imported} client team{imported !== 1 ? "s" : ""} updated.</span>
            <button onClick={() => setImported(null)} title="Dismiss">
              <X size={15} />
            </button>
          </div>
        )}

        {/* Scorecards */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard icon={Users} label="Total users" value={loading ? "—" : String(stats.total)} accent="text-gray-900" />
          <StatCard icon={Crown} label="GMs" value={loading ? "—" : String(stats.GM)} accent={ROLE_ICON.GM} />
          <StatCard icon={Briefcase} label="Business Leads" value={loading ? "—" : String(stats.BL)} accent={ROLE_ICON.BL} />
          <StatCard icon={MonitorSmartphone} label="Digital Leads" value={loading ? "—" : String(stats.DL)} accent={ROLE_ICON.DL} />
          <StatCard icon={UsersRound} label="Collaborators" value={loading ? "—" : String(stats.COLLABORATOR)} accent={ROLE_ICON.COLLABORATOR} />
        </div>

        <AccessLevelsCard />

            <section className="border border-gray-200 bg-white">
              {/* Toolbar: view, search, role filter */}
              <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 p-3">
                <Segmented
                  value={view}
                  onChange={setView}
                  options={[
                    { value: "people", label: "By person", icon: <Users size={13} /> },
                    { value: "clients", label: "By client", icon: <Briefcase size={13} /> },
                  ]}
                />
                <div className="relative w-full sm:w-auto sm:flex-1 min-w-[220px]">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder={view === "people" ? "Search by email or name..." : "Search by client, ID or email..."}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
                  />
                </div>
                <button
                  onClick={() => void exportTeams()}
                  disabled={loading || exporting}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 border border-gray-200 bg-white hover:bg-gray-50 hover:text-gray-900 disabled:opacity-50 transition-colors"
                  title="Every client team to a new Google Sheet: Client ID, Client Name, Role, Email"
                >
                  {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                  Export
                </button>
                <button
                  onClick={() => {
                    setImported(null);
                    setImportOpen(true);
                  }}
                  disabled={loading}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 border border-gray-200 bg-white hover:bg-gray-50 hover:text-gray-900 disabled:opacity-50 transition-colors"
                  title="Apply an edited team sheet (review first)"
                >
                  <Upload size={14} />
                  Import
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 px-3 py-2">
                {view === "people" && (
                  <Segmented
                    value={filter}
                    onChange={setFilter}
                    options={FILTERS.map((f) => ({
                      value: f,
                      label: (
                        <>
                          {FILTER_LABELS[f]} <span className="text-gray-400 tabular-nums">{filterCounts[f]}</span>
                        </>
                      ),
                    }))}
                  />
                )}
                <span className="ml-auto text-sm text-gray-400 hidden sm:block">
                  {view === "people"
                    ? `${filteredPeople.length} ${filteredPeople.length === 1 ? "person" : "people"}${
                        !search.trim() && hiddenCount ? ` · ${hiddenCount} with no client hidden — search to find them` : ""
                      }`
                    : `${filteredClients.length} client${filteredClients.length !== 1 ? "s" : ""}`}
                </span>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-16 gap-2 text-gray-400">
                  <Loader2 size={18} className="animate-spin" />
                  <span className="text-sm">Loading...</span>
                </div>
              ) : view === "people" ? (
                <PeopleTable
                  rows={filteredPeople}
                  selfEmail={profile?.email ?? ""}
                  onOpen={(email) => setOpenPerson(email)}
                />
              ) : (
                <ClientsTable rows={filteredClients} users={users} onOpen={(id) => setOpenClient(id)} />
              )}
            </section>
      </main>

      {person && (
        <PersonClientsDrawer
          key={person.email}
          person={person}
          clients={clients}
          isSelf={person.email === profile?.email}
          busy={updating === person.email}
          onClose={() => setOpenPerson(null)}
          onSaved={patchClients}
          onRoleChange={(role) => run(person.email, () => setUserRole(person.email, role), { role }, "update role")}
          onToggleDisabled={() =>
            run(
              person.email,
              () => setUserDisabled(person.email, !person.user?.disabled),
              { disabled: !person.user?.disabled },
              "update access"
            )
          }
          onDelete={() => run(person.email, () => deleteUserRecord(person.email), null, "delete user")}
        />
      )}

      {importOpen && (
        <TeamSheetImportModal
          clients={clients}
          userEmails={userEmails}
          onClose={() => setImportOpen(false)}
          onApplied={applyImported}
        />
      )}

      {client && (
        <ClientPeopleDrawer
          key={client.cl_id}
          client={client}
          users={users}
          onClose={() => setOpenClient(null)}
          onSaved={(c) => patchClients([c])}
        />
      )}
    </div>
  );
}

// ─── People table ─────────────────────────────────────────────────────────────

function PeopleTable({
  rows,
  selfEmail,
  onOpen,
}: {
  rows: PersonRow[];
  selfEmail: string;
  onOpen: (email: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400">
        <Users size={32} className="mb-2 opacity-40" />
        <p className="text-sm">No one found.</p>
      </div>
    );
  }
  return (
    <div className={`${TABLE_MAX_H} overflow-y-auto`}>
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 bg-white border-b border-gray-200 text-[11px] uppercase tracking-wider text-gray-400">
          <tr>
            <th className="text-left font-semibold px-4 py-2.5">Name</th>
            <th className="text-right font-semibold px-4 py-2.5 w-32">Clients</th>
            <th className="text-right font-semibold px-4 py-2.5 w-40">Role</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((p) => {
            const count = p.clients.size;
            const revoked = !!p.user?.disabled;
            return (
              <tr key={p.email} className={`h-14 ${revoked ? "bg-gray-50" : "hover:bg-gray-50"}`}>
                <td className="px-4 py-2 max-w-0">
                  <p className={`font-medium truncate ${revoked ? "text-gray-400" : "text-gray-900"}`}>
                    {p.displayName ?? nameFromEmail(p.email)}
                    {p.email === selfEmail && <span className="ml-2 text-[10px] text-gray-400 uppercase">You</span>}
                  </p>
                  <p className="text-gray-400 text-xs truncate">{p.email}</p>
                </td>
                <td className="px-4 py-2 text-right">
                  <button
                    onClick={() => onOpen(p.email)}
                    className={`inline-flex items-center justify-center min-w-[5.5rem] px-2.5 py-1 text-xs font-medium tabular-nums border transition-colors ${
                      count || p.isAdmin
                        ? "border-gray-200 bg-white text-gray-900 hover:border-yellow-400 hover:bg-yellow-400"
                        : "border-dashed border-gray-300 text-gray-400 hover:border-yellow-400 hover:bg-yellow-400 hover:text-gray-900"
                    }`}
                    title="Allocate clients"
                  >
                    {p.isAdmin && !count ? "All clients" : count ? `${count} client${count !== 1 ? "s" : ""}` : "Allocate"}
                  </button>
                </td>
                <td className="px-4 py-2">
                  <div className="flex items-center justify-end gap-1 flex-wrap">
                    {p.primary ? <RoleBadge role={p.primary} /> : <span className="text-xs text-gray-300">No client</span>}
                    {!p.user && <span className="text-[11px] text-gray-400">· not signed in</span>}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Clients table ────────────────────────────────────────────────────────────

function ClientsTable({
  rows,
  users,
  onOpen,
}: {
  rows: Client[];
  users: UserProfile[];
  onOpen: (cl_id: string) => void;
}) {
  const names = useMemo(() => new Map(users.map((u) => [u.email, u.displayName])), [users]);
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400">
        <Briefcase size={32} className="mb-2 opacity-40" />
        <p className="text-sm">No clients found.</p>
      </div>
    );
  }
  const who = (email: string | undefined) =>
    email ? names.get(normalizeEmail(email)) ?? nameFromEmail(normalizeEmail(email)) : "—";
  return (
    <div className={`${TABLE_MAX_H} overflow-y-auto`}>
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 bg-white border-b border-gray-200 text-[11px] uppercase tracking-wider text-gray-400">
          <tr>
            <th className="text-left font-semibold px-4 py-2.5">Client</th>
            <th className="text-left font-semibold px-4 py-2.5">Business Lead</th>
            <th className="text-right font-semibold px-4 py-2.5 w-32">People</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((c) => {
            const seats = teamSeats(c);
            const count = new Set(seats.map((s) => s.email)).size;
            const collabs = seats.filter((s) => s.role === "COLLABORATOR").length;
            return (
              <tr key={c.cl_id} className="h-14 hover:bg-gray-50">
                <td className="px-4 py-2 max-w-0">
                  <p className="font-medium text-gray-900 truncate">
                    {c.CL_Name}
                    {isClientHidden(c) && <span className="ml-2 text-[10px] text-gray-400 uppercase">Hidden</span>}
                  </p>
                  <p className="text-gray-400 text-xs truncate">
                    {c.cl_id} · {c.CL_Agency}
                  </p>
                </td>
                <td className="px-4 py-2 max-w-0">
                  <p className="text-sm text-gray-700 truncate">{who(c.CL_Business_Lead)}</p>
                  <p className="text-[11px] text-gray-400 truncate">
                    {collabs} collaborator{collabs !== 1 ? "s" : ""}
                  </p>
                </td>
                <td className="px-4 py-2 text-right">
                  <button
                    onClick={() => onOpen(c.cl_id)}
                    className="inline-flex items-center justify-center min-w-[5.5rem] px-2.5 py-1 text-xs font-medium tabular-nums border border-gray-200 bg-white text-gray-900 hover:border-yellow-400 hover:bg-yellow-400 transition-colors"
                    title="Edit the team"
                  >
                    {count} {count === 1 ? "person" : "people"}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
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
    <form onSubmit={submit} className="bg-white border border-gray-200 p-4">
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

// ─── Segmented control (same look as the Clients status filter) ──────────────

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: React.ReactNode; icon?: React.ReactNode }[];
}) {
  return (
    <div className="inline-flex items-center bg-gray-100 p-0.5 gap-0.5 flex-wrap">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
            value === o.value ? "bg-white text-gray-900" : "text-gray-500 hover:text-gray-700"
          }`}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ─── Role badge (same look as the client status badge) ──────────────────────

function RoleBadge({ role }: { role: "ADMIN" | TeamRole }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-medium border border-gray-200 bg-white text-gray-700">
      <span className={`w-1.5 h-1.5 mr-1.5 ${ROLE_DOT[role]}`} />
      {role === "ADMIN" ? "Admin" : TEAM_ROLE_LABELS[role]}
    </span>
  );
}
