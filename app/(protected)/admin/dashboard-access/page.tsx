// app/(protected)/admin/dashboard-access/page.tsx
"use client";

/**
 * Admin → Dashboard Access — who opens each dashboard and which clients it
 * shows them. Per grantable dashboard (everything except Forecaster): a mode
 * (Global = every client, Agency = the clients of the person's agencies, from
 * their email domain) and grants (email domains and/or people). Admins always
 * see everything. The Forecaster dashboard follows client teams and is not
 * grantable. Sub-tabs can be hidden from everyone but admins (work-in-progress
 * pages). Stored in config/dashboard_access (dashboard-access-service.ts);
 * resolution logic in lib/format/access.ts, mirrored by the security rules.
 */

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Globe, Building2, Loader2, Plus, Save, Undo2, X } from "lucide-react";
import PageHeader from "../../../../components/_shared/page-header";
import { TeamMemberMultiSelect } from "../../../../components/clients/team-member-picker";
import { useUserProfile } from "../../../../lib/hooks/use-user-profile";
import {
  saveDashboardAccess,
  subscribeToDashboardAccess,
} from "../../../../lib/services/dashboard-access-service";
import { fetchUsers, type UserProfile } from "../../../../lib/services/user-service";
import { fetchAgencies, fetchCompanyDomains } from "../../../../lib/services/agency-service";
import { DASHBOARD_PAGES } from "../../../../components/forecaster/dashboard-pages.config";
import { normalizeDashboardAccess } from "../../../../lib/format/access";
import { normalizeDomain } from "../../../../lib/format/email";
import {
  GRANTABLE_DASHBOARDS,
  type DashboardAccessConfig,
  type DashboardMode,
  type GrantableDashboardId,
} from "../../../../lib/types/access.types";

const DOMAIN_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;

export default function AdminDashboardAccessPage() {
  const { isAdmin, loading: profileLoading } = useUserProfile();
  const router = useRouter();

  useEffect(() => {
    if (!profileLoading && !isAdmin) router.replace("/");
  }, [isAdmin, profileLoading, router]);

  const [config, setConfig] = useState<DashboardAccessConfig>(() => normalizeDashboardAccess(null));
  const [saved, setSaved] = useState<DashboardAccessConfig | null>(null);
  const [users, setUsers] = useState<UserProfile[]>([]);
  // domain → label ("Cossette Media", "All agencies") for suggestions and chips.
  const [knownDomains, setKnownDomains] = useState<Map<string, string>>(new Map());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  // Read by the snapshot callback, so it must be a ref (a state value captured
  // at subscribe time would always be false and remote updates would overwrite
  // unsaved edits).
  const dirtyRef = useRef(false);

  useEffect(() => {
    if (!isAdmin) return;
    const unsub = subscribeToDashboardAccess((c) => {
      setSaved(c);
      if (!dirtyRef.current) setConfig(c);
    });
    Promise.all([fetchUsers(), fetchAgencies(), fetchCompanyDomains()])
      .then(([u, agencies, company]) => {
        setUsers(u);
        const m = new Map<string, string>();
        for (const a of agencies) for (const d of a.domains ?? []) m.set(d, m.has(d) ? `${m.get(d)}, ${a.name}` : a.name);
        for (const d of company) m.set(normalizeDomain(d), "All agencies (company-wide)");
        setKnownDomains(m);
      })
      .catch((err) => console.error("Failed to load users / agencies:", err));
    return () => unsub();
  }, [isAdmin]);

  const update = (next: DashboardAccessConfig) => {
    dirtyRef.current = true;
    setDirty(true);
    setConfig(next);
  };
  const setGrant = (id: GrantableDashboardId, patch: Partial<DashboardAccessConfig["dashboards"][GrantableDashboardId]>) =>
    update({ ...config, dashboards: { ...config.dashboards, [id]: { ...config.dashboards[id], ...patch } } });
  const toggleSubtab = (pageId: string) => {
    const hidden = new Set(config.hiddenSubtabs);
    if (hidden.has(pageId)) hidden.delete(pageId);
    else hidden.add(pageId);
    update({ ...config, hiddenSubtabs: [...hidden].sort() });
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

  if (profileLoading || !isAdmin) return null;

  return (
    <div className="flex min-h-[calc(100vh/var(--app-zoom,1))] flex-col bg-muted">
      <header className="sticky top-14 lg:top-0 z-20 bg-white">
        <PageHeader
          title="Dashboard Access"
          description="Who opens each dashboard, and which clients it shows them. Admins always see everything; the Forecaster dashboard follows client teams."
          actions={
            <div className="flex items-center gap-2">
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
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Save
              </button>
            </div>
          }
        />
      </header>

      <main className="mx-auto w-full max-w-[1000px] flex-1 space-y-4 p-6 md:p-8">
        {saveError && (
          <div className="border border-red-500 bg-red-500 px-4 py-2 text-sm text-white">
            Couldn&apos;t save: {saveError}
          </div>
        )}
        {saved === null ? (
          <div className="flex h-64 items-center justify-center text-gray-400">
            <Loader2 size={20} className="animate-spin" />
          </div>
        ) : (
          DASHBOARD_PAGES.map((page) => {
            const grantable = (GRANTABLE_DASHBOARDS as readonly string[]).includes(page.id);
            const id = page.id as GrantableDashboardId;
            return (
              <section key={page.id} className="border border-gray-200 bg-white">
                <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
                  <h2 className="font-semibold text-gray-900">{page.label}</h2>
                  {grantable ? (
                    <ModeSwitch value={config.dashboards[id].mode} onChange={(mode) => setGrant(id, { mode })} />
                  ) : (
                    <span className="text-xs text-gray-500">Client-team members and admins</span>
                  )}
                </div>

                {grantable && (
                  <div className="grid gap-4 px-4 py-4 md:grid-cols-2">
                    <div>
                      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-gray-500">
                        Email domains
                      </p>
                      <DomainList
                        value={config.dashboards[id].domains}
                        onChange={(domains) => setGrant(id, { domains })}
                        known={knownDomains}
                      />
                    </div>
                    <div>
                      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-gray-500">People</p>
                      <TeamMemberMultiSelect
                        value={config.dashboards[id].users}
                        onChange={(emails) => setGrant(id, { users: emails })}
                        users={users}
                        placeholder="Add a person…"
                      />
                    </div>
                    <p className="text-xs text-gray-500 md:col-span-2">
                      {config.dashboards[id].mode === "GLOBAL"
                        ? "Global: everyone granted sees every client."
                        : "Agency: everyone granted sees the clients of their agency (from their email domain; company-wide domains see every agency)."}{" "}
                      {config.dashboards[id].domains.length === 0 && config.dashboards[id].users.length === 0 &&
                        "Nobody is granted yet — only admins see it."}
                    </p>
                  </div>
                )}

                {page.children.length > 0 && (
                  <div className="border-t border-gray-100 px-4 py-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Sub-tabs</p>
                    <ul className="grid gap-1.5 sm:grid-cols-2">
                      {page.children.map((child) => {
                        const visible = !config.hiddenSubtabs.includes(child.id);
                        return (
                          <li key={child.id} className="flex items-center justify-between gap-3 text-sm">
                            <span className={visible ? "text-gray-800" : "text-gray-400"}>{child.label}</span>
                            <button
                              type="button"
                              onClick={() => toggleSubtab(child.id)}
                              className={`px-2 py-0.5 text-[11px] font-semibold ${
                                visible ? "bg-green-500 text-white" : "bg-gray-200 text-gray-600"
                              }`}
                              title={visible ? "Hide from everyone but admins" : "Show to everyone who sees the dashboard"}
                            >
                              {visible ? "Visible" : "Admins only"}
                            </button>
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
          Granting a dashboard also lets those people read the data it shows (read-only — editing
          still requires being on the client&apos;s team). The security rules enforce the same model.
        </p>
      </main>
    </div>
  );
}

function ModeSwitch({ value, onChange }: { value: DashboardMode; onChange: (m: DashboardMode) => void }) {
  const options: { mode: DashboardMode; label: string; icon: React.ReactNode }[] = [
    { mode: "AGENCY", label: "Agency", icon: <Building2 size={13} /> },
    { mode: "GLOBAL", label: "Global", icon: <Globe size={13} /> },
  ];
  return (
    <div className="inline-flex border border-gray-200">
      {options.map((o) => (
        <button
          key={o.mode}
          type="button"
          onClick={() => onChange(o.mode)}
          className={`flex items-center gap-1.5 px-3 py-1 text-xs font-semibold ${
            value === o.mode ? "bg-gray-900 text-white" : "bg-white text-gray-600 hover:bg-gray-50"
          }`}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

function DomainList({
  value,
  onChange,
  known,
}: {
  value: string[];
  onChange: (domains: string[]) => void;
  known: Map<string, string>;
}) {
  const [input, setInput] = useState("");
  const listId = useId();
  const domain = normalizeDomain(input);
  const valid = DOMAIN_RE.test(domain) && !value.includes(domain);
  const suggestions = useMemo(
    () => [...known.keys()].filter((d) => !value.includes(d)).sort(),
    [known, value]
  );

  const add = (d: string) => {
    onChange([...value, d].sort());
    setInput("");
  };

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((d) => (
            <span key={d} className="inline-flex items-center gap-1.5 bg-gray-100 px-2 py-1 text-xs text-gray-800">
              @{d}
              {known.has(d) && <span className="text-gray-500">· {known.get(d)}</span>}
              <button
                type="button"
                onClick={() => onChange(value.filter((x) => x !== d))}
                className="text-gray-400 hover:text-gray-900"
                title="Remove"
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) add(domain);
        }}
        className="flex gap-2"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="e.g. cossettemedia.com"
          list={listId}
          className="min-w-0 flex-1 border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
        />
        <button
          type="submit"
          disabled={!valid}
          className="flex items-center gap-1 bg-yellow-400 px-3 py-1.5 text-xs font-semibold text-gray-900 hover:bg-yellow-300 disabled:opacity-40"
        >
          <Plus size={13} />
          Add
        </button>
      </form>
      <datalist id={listId}>
        {suggestions.map((d) => (
          <option key={d} value={d}>
            {known.get(d)}
          </option>
        ))}
      </datalist>
    </div>
  );
}
