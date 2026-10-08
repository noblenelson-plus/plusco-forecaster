// app/(protected)/admin/dashboard-access/page.tsx
"use client";

/**
 * Admin → Access → Dashboard Access. Per dashboard tab:
 *   - who sees it by default (client teams / every company email for its own
 *     agency / nobody) — fixed rules, see lib/format/access.ts;
 *   - whether it (and each sub-tab) is visible to non-admins at all
 *     (config/dashboard_access, saved with Save / Discard);
 *   - the people granted it, each with a scope: agencies × regions, read-only
 *     (Forecaster: optionally edit) — dashboard_grants/{email}, saved at once.
 * The Agencies & Domains tab edits the email domain ↔ agency mapping that the
 * defaults read. Admins always see every tab and client.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  Briefcase,
  Download,
  ExternalLink,
  FileSpreadsheet,
  Upload,
  X,
  Eye,
  EyeOff,
  LayoutDashboard,
  Loader2,
  Pencil,
  Save,
  Trash2,
  Undo2,
  UserPlus,
  Users,
} from "lucide-react";
import PageHeader from "../../../../components/_shared/page-header";
import AgenciesPanel from "../../../../components/agencies/agencies-panel";
import GrantEditor from "../../../../components/dashboard-access/grant-editor";
import GrantSheetImportModal, { REPORT_TABS } from "../../../../components/dashboard-access/grant-sheet-import-modal";
import { exportToNewSheetWithTabs } from "../../../../components/forecaster/table/table-export";
import { buildGrantSheet } from "../../../../lib/format/grant-sheet";
import { buildTeamSheet } from "../../../../lib/format/team-sheet";
import { buildAccessSummary, buildAllAccess, buildGrantClients } from "../../../../lib/format/access-report";
import { fetchAccessibleClients } from "../../../../lib/services/assignment-service";
import { fetchAgencies, fetchCompanyDomains } from "../../../../lib/services/agency-service";
import type { Client } from "../../../../lib/types/client.types";
import { useUserProfile } from "../../../../lib/hooks/use-user-profile";
import {
  saveDashboardAccess,
  subscribeToDashboardAccess,
} from "../../../../lib/services/dashboard-access-service";
import { fetchAllGrants, saveGrant } from "../../../../lib/services/dashboard-grants-service";
import { fetchUsers, type UserProfile } from "../../../../lib/services/user-service";
import { DASHBOARD_PAGES } from "../../../../components/forecaster/dashboard-pages.config";
import { grantScopeLabel, normalizeDashboardAccess } from "../../../../lib/format/access";
import { nameFromEmail } from "../../../../lib/format/email";
import {
  AGENCY_DEFAULT_TABS,
  type DashboardAccessConfig,
  type DashboardGrantDoc,
  type DashboardTabId,
  type GrantScope,
} from "../../../../lib/types/access.types";

/** Who sees each tab without a grant. */
function defaultAccess(tab: DashboardTabId): { icon: React.ReactNode; text: string } {
  if (tab === "forecaster") return { icon: <Briefcase size={13} />, text: "Client teams — their own clients" };
  if (AGENCY_DEFAULT_TABS.includes(tab))
    return { icon: <Building2 size={13} />, text: "Everyone — their own agency (Plus Company emails: all agencies)" };
  return { icon: <Users size={13} />, text: "Nobody — only the people below" };
}

export default function AdminDashboardAccessPage() {
  const { isAdmin, email: myEmail, loading: profileLoading } = useUserProfile();
  const router = useRouter();

  useEffect(() => {
    if (!profileLoading && !isAdmin) router.replace("/");
  }, [isAdmin, profileLoading, router]);

  const [config, setConfig] = useState<DashboardAccessConfig>(() => normalizeDashboardAccess(null));
  const [saved, setSaved] = useState<DashboardAccessConfig | null>(null);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [grants, setGrants] = useState<DashboardGrantDoc[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  // Read by the snapshot callback, so it must be a ref (a state value captured
  // at subscribe time would always be false and remote updates would overwrite
  // unsaved edits).
  const dirtyRef = useRef(false);
  // Dashboards | Agencies & Domains (the agency ↔ domain mapping).
  const [tab, setTab] = useState<"dashboards" | "agencies">("dashboards");
  const [editing, setEditing] = useState<{ tab: DashboardTabId; label: string; email?: string } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportedUrl, setExportedUrl] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // For the access report: every client and the email domain ↔ agency mapping.
  const [clients, setClients] = useState<Client[]>([]);
  const [mapping, setMapping] = useState<{ agencyDomains: Record<string, string[]>; companyDomains: string[] }>({
    agencyDomains: {},
    companyDomains: [],
  });

  useEffect(() => {
    if (!isAdmin) return;
    const unsub = subscribeToDashboardAccess((c) => {
      setSaved(c);
      if (!dirtyRef.current) setConfig(c);
    });
    Promise.all([fetchUsers(), fetchAllGrants(), fetchAccessibleClients(null, true), fetchAgencies(), fetchCompanyDomains()])
      .then(([u, g, c, agencies, companyDomains]) => {
        setUsers(u);
        setGrants(g);
        setClients(c);
        setMapping({ agencyDomains: Object.fromEntries(agencies.map((a) => [a.name, a.domains ?? []])), companyDomains });
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Failed to load grants."));
    return () => unsub();
  }, [isAdmin]);

  const names = useMemo(() => new Map(users.map((u) => [u.email, u.displayName])), [users]);
  const userEmails = useMemo(() => new Set(users.map((u) => u.email)), [users]);
  const tabLabels = useMemo(
    () => Object.fromEntries(DASHBOARD_PAGES.map((p) => [p.id, p.label])) as Record<DashboardTabId, string>,
    []
  );

  /**
   * The access report to a new Google Sheet: All access (one row per person
   * × tab × source — filter by name), Summary (one row per person —
   * what they see on each tab and why), Dashboard grants and Client access
   * (editable; Import reads them back) and Grant clients (each grant's
   * clients). Cell text gets a leading apostrophe so ids stay text.
   */
  async function exportGrants() {
    setExporting(true);
    setSaveError(null);
    setExportedUrl(null);
    try {
      const asText = (table: string[][]) => table.map((row, r) => (r === 0 ? row : row.map((v) => (v ? `'${v}` : v))));
      const input = {
        users,
        clients,
        grants: grants ?? [],
        agencyDomains: mapping.agencyDomains,
        companyDomains: mapping.companyDomains,
        dashboardAccess: config,
        tabLabels,
      };
      const url = await exportToNewSheetWithTabs({
        title: `Access report — ${new Date().toISOString().slice(0, 10)}`,
        tabs: [
          { sheetTitle: REPORT_TABS.allAccess, matrix: buildAllAccess(input) },
          { sheetTitle: REPORT_TABS.summary, matrix: buildAccessSummary(input) },
          { sheetTitle: REPORT_TABS.grants, matrix: buildGrantSheet(grants ?? [], names, tabLabels) },
          { sheetTitle: REPORT_TABS.clientAccess, matrix: asText(buildTeamSheet(clients)) },
          { sheetTitle: REPORT_TABS.grantClients, matrix: asText(buildGrantClients(input)) },
        ],
      });
      setExportedUrl(url);
    } catch (err) {
      setSaveError("Google Sheets export failed: " + (err instanceof Error ? err.message : "Unknown error"));
    } finally {
      setExporting(false);
    }
  }
  const nameOf = (e: string) => names.get(e) || nameFromEmail(e);

  /** Per tab: the people granted it. */
  const byTab = useMemo(() => {
    const m = new Map<DashboardTabId, { email: string; scope: GrantScope }[]>();
    for (const g of grants ?? []) {
      for (const [t, scope] of Object.entries(g.tabs) as [DashboardTabId, GrantScope][]) {
        if (!m.has(t)) m.set(t, []);
        m.get(t)!.push({ email: g.email, scope });
      }
    }
    for (const list of m.values()) list.sort((a, b) => nameOf(a.email).localeCompare(nameOf(b.email)));
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grants, names]);

  // ─── Visibility (Save / Discard) ────────────────────────────────────────────

  const update = (next: DashboardAccessConfig) => {
    dirtyRef.current = true;
    setDirty(true);
    setConfig(next);
  };
  const toggleIn = (key: "hiddenTabs" | "hiddenSubtabs", id: string) => {
    const hidden = new Set(config[key]);
    if (hidden.has(id)) hidden.delete(id);
    else hidden.add(id);
    update({ ...config, [key]: [...hidden].sort() });
  };

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      await saveDashboardAccess(config);
      dirtyRef.current = false;
      setDirty(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  function discard() {
    dirtyRef.current = false;
    setDirty(false);
    setConfig(saved ?? normalizeDashboardAccess(null));
  }

  // ─── Grants (saved at once) ─────────────────────────────────────────────────

  async function setGrantScope(email: string, t: DashboardTabId, scope: GrantScope | null) {
    const current = grants?.find((g) => g.email === email)?.tabs ?? {};
    const tabs = { ...current };
    if (scope) tabs[t] = scope;
    else delete tabs[t];
    await saveGrant(email, tabs, myEmail);
    setGrants((prev) => {
      const rest = (prev ?? []).filter((g) => g.email !== email);
      return Object.keys(tabs).length ? [...rest, { email, tabs }] : rest;
    });
  }

  if (profileLoading || !isAdmin) return null;

  const editingScope = editing?.email
    ? grants?.find((g) => g.email === editing.email)?.tabs[editing.tab]
    : undefined;

  return (
    <div className="flex min-h-[calc(100vh/var(--app-zoom,1))] flex-col bg-muted">
      <header className="sticky top-14 lg:top-0 z-20 bg-white">
        <PageHeader
          title="Dashboard Access"
          description="Who sees each dashboard tab, and which clients. Admins see every client; hidden tabs are hidden for admins too."
          actions={
            tab === "dashboards" && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void exportGrants()}
                  disabled={grants === null || clients.length === 0 || exporting}
                  className="flex items-center gap-1.5 border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-40"
                  title="Access report to a new Google Sheet: who sees what and why, grants, client access"
                >
                  {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                  Export
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setNotice(null);
                    setImportOpen(true);
                  }}
                  disabled={grants === null}
                  className="flex items-center gap-1.5 border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-40"
                  title="Apply an edited access report — Dashboard grants + Client access (review first)"
                >
                  <Upload size={14} />
                  Import
                </button>
                <span className="mx-1 h-5 w-px bg-gray-200" />
                <button
                  type="button"
                  onClick={discard}
                  disabled={!dirty || saving}
                  className="flex items-center gap-1.5 border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-40"
                >
                  <Undo2 size={14} />
                  Discard
                </button>
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={!dirty || saving}
                  className="flex items-center gap-1.5 border border-gray-900 bg-gray-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:opacity-40"
                  title="Saves tab / sub-tab visibility. People are saved as you add them."
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  Save
                </button>
              </div>
            )
          }
        />
      </header>

      <main className="mx-auto w-full max-w-[1000px] flex-1 space-y-4 p-6 md:p-8">
        {/* Dashboards | Agencies & Domains */}
        <div className="inline-flex items-center bg-gray-100 p-0.5 gap-0.5">
          {([
            ["dashboards", "Dashboards", <LayoutDashboard key="d" size={14} />],
            ["agencies", "Agencies & Domains", <Building2 key="a" size={14} />],
          ] as const).map(([value, label, icon]) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
                tab === value ? "bg-white text-gray-900" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>

        {tab === "agencies" ? (
          <>
            <p className="text-xs text-gray-500 max-w-xl">
              The email domain ↔ agency mapping decides which agency&apos;s data each person sees by
              default on Media Investments, Labs Pacing and Reports. Company-wide domains see every
              agency. It is read live — changes apply to everyone at once.
            </p>
            <AgenciesPanel />
          </>
        ) : (
          <>
            {exportedUrl && (
              <div className="flex items-center justify-between gap-3 bg-green-500 text-white px-4 py-3 text-sm">
                <span className="flex items-center gap-2">
                  <FileSpreadsheet size={15} />
                  Access report exported to a new Google Sheet in your Drive.
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
            {notice && (
              <div className="flex items-center justify-between gap-3 bg-green-500 text-white px-4 py-3 text-sm">
                <span>{notice}</span>
                <button onClick={() => setNotice(null)} title="Dismiss">
                  <X size={15} />
                </button>
              </div>
            )}
            {(saveError || loadError) && (
              <div className="border border-red-500 bg-red-500 px-4 py-2 text-sm text-white">
                {saveError ? `Couldn't save: ${saveError}` : loadError}
              </div>
            )}
            {saved === null || grants === null ? (
              <div className="flex h-64 items-center justify-center text-gray-400">
                <Loader2 size={20} className="animate-spin" />
              </div>
            ) : (
              DASHBOARD_PAGES.map((page) => {
                const id = page.id as DashboardTabId;
                const hiddenTab = config.hiddenTabs.includes(id);
                const def = defaultAccess(id);
                const people = byTab.get(id) ?? [];
                return (
                  <section key={id} className={`border border-gray-200 bg-white ${hiddenTab ? "opacity-70" : ""}`}>
                    <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
                      <div className="min-w-0">
                        <h2 className="font-semibold text-gray-900">{page.label}</h2>
                        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-gray-500">
                          {def.icon}
                          {def.text}
                        </p>
                      </div>
                      <VisibilityToggle hidden={hiddenTab} onToggle={() => toggleIn("hiddenTabs", id)} />
                    </div>

                    {/* Granted people */}
                    <div className="px-4 py-3">
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                          People given access{people.length ? ` (${people.length})` : ""}
                        </p>
                        <button
                          type="button"
                          onClick={() => setEditing({ tab: id, label: page.label })}
                          className="flex items-center gap-1.5 border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:border-gray-900"
                        >
                          <UserPlus size={13} />
                          Add person
                        </button>
                      </div>
                      {people.length === 0 ? (
                        <p className="text-xs text-gray-400">Nobody yet.</p>
                      ) : (
                        <ul className="divide-y divide-gray-100 border border-gray-100">
                          {people.map(({ email, scope }) => (
                            <li key={email} className="flex items-center gap-3 px-3 py-2">
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-gray-900 truncate">{nameOf(email)}</p>
                                <p className="text-[11px] text-gray-400 truncate">{email}</p>
                              </div>
                              <span className="text-xs text-gray-600 text-right">{grantScopeLabel(scope)}</span>
                              <button
                                onClick={() => setEditing({ tab: id, label: page.label, email })}
                                className="p-1 text-gray-400 hover:text-gray-900"
                                title="Change scope"
                              >
                                <Pencil size={14} />
                              </button>
                              <RemoveButton onConfirm={() => setGrantScope(email, id, null)} />
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    {/* Sub-tabs */}
                    {page.children.length > 0 && (
                      <div className="border-t border-gray-100 px-4 py-3">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Sub-tabs</p>
                        <ul className="grid gap-1.5 sm:grid-cols-2">
                          {page.children.map((child) => {
                            const visible = !config.hiddenSubtabs.includes(child.id);
                            return (
                              <li key={child.id} className="flex items-center justify-between gap-3 text-sm">
                                <span className={visible ? "text-gray-800" : "text-gray-400"}>{child.label}</span>
                                <VisibilityToggle
                                  small
                                  hidden={!visible}
                                  onToggle={() => toggleIn("hiddenSubtabs", child.id)}
                                />
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}
                  </section>
                );
              })
            )}
            <p className="text-[11px] text-gray-400">
              Hidden tabs and sub-tabs disappear from the dashboard for everyone, admins included. Access to data is enforced
              by the security rules with the same model; grants are view-only unless &ldquo;can
              edit&rdquo; is set on Forecaster.
            </p>
          </>
        )}
      </main>

      {importOpen && grants && (
        <GrantSheetImportModal
          current={grants}
          clients={clients}
          userEmails={userEmails}
          tabLabels={tabLabels}
          updatedBy={myEmail}
          onClose={() => setImportOpen(false)}
          onApplied={(changes, teamChanges) => {
            const byEmail = new Map(changes.map((c) => [c.email, c.tabs]));
            setGrants((prev) => {
              const kept = (prev ?? []).filter((g) => !byEmail.has(g.email));
              const updated = changes.filter((c) => Object.keys(c.tabs).length).map((c) => ({ email: c.email, tabs: c.tabs }));
              return [...kept, ...updated];
            });
            const byClient = new Map(teamChanges.map((c) => [c.cl_id, c]));
            setClients((prev) =>
              prev.map((c) => {
                const ch = byClient.get(c.cl_id);
                return ch
                  ? { ...c, CL_Business_Lead: ch.CL_Business_Lead, CL_Digital_Lead: ch.CL_Digital_Lead, CL_Collaborators: ch.CL_Collaborators, CL_Team_Emails: ch.CL_Team_Emails }
                  : c;
              })
            );
            setImportOpen(false);
            const parts = [
              changes.length ? `dashboard grants for ${changes.length} ${changes.length === 1 ? "person" : "people"}` : "",
              teamChanges.length ? `${teamChanges.length} client team${teamChanges.length === 1 ? "" : "s"}` : "",
            ].filter(Boolean);
            setNotice(`Import applied — updated ${parts.join(" and ")}.`);
          }}
        />
      )}

      {editing && (
        <GrantEditor
          key={`${editing.tab}-${editing.email ?? "new"}`}
          tab={editing.tab}
          tabLabel={editing.label}
          email={editing.email}
          scope={editingScope}
          users={users}
          taken={new Set((byTab.get(editing.tab) ?? []).map((p) => p.email))}
          createdBy={myEmail}
          onUserCreated={(u) => setUsers((prev) => [...prev, u])}
          onClose={() => setEditing(null)}
          onSave={async (email, scope) => {
            await setGrantScope(email, editing.tab, scope);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function VisibilityToggle({ hidden, onToggle, small }: { hidden: boolean; onToggle: () => void; small?: boolean }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={hidden ? "Show to everyone who has access" : "Hide from everyone, admins included"}
      className={`flex flex-shrink-0 items-center gap-1 font-semibold ${small ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs"} ${
        hidden ? "bg-gray-200 text-gray-600" : "bg-green-500 text-white"
      }`}
    >
      {hidden ? <EyeOff size={small ? 11 : 13} /> : <Eye size={small ? 11 : 13} />}
      {hidden ? "Hidden" : "Visible"}
    </button>
  );
}

function RemoveButton({ onConfirm }: { onConfirm: () => Promise<void> }) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  if (busy) return <Loader2 size={14} className="animate-spin text-gray-400" />;
  return armed ? (
    <button
      autoFocus
      onBlur={() => setArmed(false)}
      onClick={async () => {
        setBusy(true);
        try {
          await onConfirm();
        } finally {
          setBusy(false);
          setArmed(false);
        }
      }}
      className="px-2 py-0.5 text-[11px] font-semibold bg-red-500 text-white"
    >
      Remove?
    </button>
  ) : (
    <button onClick={() => setArmed(true)} className="p-1 text-gray-300 hover:text-red-500" title="Remove access">
      <Trash2 size={14} />
    </button>
  );
}
