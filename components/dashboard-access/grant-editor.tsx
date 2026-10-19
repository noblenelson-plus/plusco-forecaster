// components/dashboard-access/grant-editor.tsx
"use client";

/**
 * Admin → Dashboard Access: add or change one person's grant on one tab —
 * read-only (on Forecaster, optionally edit too), as one of two kinds:
 *   - Agency & region: the clients of chosen agencies × regions ("All"
 *     includes clients added later). The region list follows the chosen
 *     agencies: only regions that have clients under them are offered.
 *   - Specific clients (CLIENT_GRANT_TABS only): a hand-picked client list.
 */

import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import { createUserManually, type UserProfile } from "../../lib/services/user-service";
import { fetchSignInDomains } from "../../lib/services/agency-service";
import {
  CLIENT_GRANT_TABS,
  type DashboardTabId,
  type GrantScope,
} from "../../lib/types/access.types";
import type { Client } from "../../lib/types/client.types";
import { CLIENT_AGENCIES, CLIENT_REGIONS } from "../../lib/constants/client.constants";
import { isClientGrant } from "../../lib/format/access";
import { isClientHidden } from "../../lib/format/client";
import { nameFromEmail } from "../../lib/format/email";
import { UserSearch } from "../clients/team-member-picker";

type GrantKind = "rule" | "clients";

export default function GrantEditor({
  tab,
  tabLabel,
  email: initialEmail,
  scope: initialScope,
  users,
  clients,
  taken,
  createdBy,
  onClose,
  onSave,
  onUserCreated,
}: {
  tab: DashboardTabId;
  tabLabel: string;
  /** Editing an existing grant (fixed person) — else pick one. */
  email?: string;
  scope?: GrantScope;
  users: UserProfile[];
  /** Every client (admin read) — feeds the region list and the client picker. */
  clients: Client[];
  /** Emails already granted this tab (excluded from the picker). */
  taken: ReadonlySet<string>;
  /** The admin's email, recorded on a user row created here. */
  createdBy: string;
  onClose: () => void;
  /** Persists the grant; rejects with a message on failure. */
  onSave: (email: string, scope: GrantScope) => Promise<void>;
  /** A company email that wasn't a user yet got its user row (before the grant). */
  onUserCreated?: (user: UserProfile) => void;
}) {
  const clientsAllowed = CLIENT_GRANT_TABS.includes(tab);
  const [email, setEmail] = useState(initialEmail ?? "");
  const [kind, setKind] = useState<GrantKind>(
    clientsAllowed && isClientGrant(initialScope) ? "clients" : "rule"
  );
  const [allAgencies, setAllAgencies] = useState(
    isClientGrant(initialScope) ? true : initialScope?.allAgencies ?? true
  );
  const [agencies, setAgencies] = useState<string[]>(initialScope?.agencies ?? []);
  const [allRegions, setAllRegions] = useState(
    isClientGrant(initialScope) ? true : initialScope?.allRegions ?? true
  );
  const [regions, setRegions] = useState<string[]>(initialScope?.regions ?? []);
  const [pickedClients, setPickedClients] = useState<string[]>(initialScope?.clients ?? []);
  const [edit, setEdit] = useState(!!initialScope?.edit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // Company domains: a typed email on one of them can be added as a new user.
  const [companyDomains, setCompanyDomains] = useState<string[] | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    fetchSignInDomains()
      .then((d) => !cancelled && setCompanyDomains(d))
      .catch((err) => console.error("Could not load the company domains:", err));
    return () => {
      cancelled = true;
    };
  }, []);

  // Regions offered: every region under "All agencies"; otherwise only the
  // regions that have clients in the chosen agencies. Regions already on the
  // grant stay listed (flagged) so an admin can see and remove them.
  const regionOptions = useMemo(() => {
    const present = new Set<string>(
      clients
        .filter((c) => allAgencies || agencies.includes(c.CL_Agency))
        .map((c) => c.CL_Business_Unit_Region)
    );
    return CLIENT_REGIONS.filter(
      (r) => allAgencies || present.has(r.value) || regions.includes(r.value)
    ).map((r) => ({
      value: r.value,
      label: r.label,
      stale: !allAgencies && !present.has(r.value),
    }));
  }, [clients, allAgencies, agencies, regions]);

  // Picking agencies drops chosen regions none of them has clients in.
  const setAgenciesAndPrune = (next: string[]) => {
    setAgencies(next);
    const present = new Set<string>(
      clients.filter((c) => next.includes(c.CL_Agency)).map((c) => c.CL_Business_Unit_Region)
    );
    setRegions((prev) => prev.filter((r) => present.has(r)));
  };

  const user = users.find((u) => u.email === email);
  const isNewUser = !!email && !user;
  const valid =
    !!email &&
    (kind === "clients"
      ? pickedClients.length > 0
      : (allAgencies || agencies.length > 0) && (allRegions || regions.length > 0));

  const toggle = (list: string[], set: (v: string[]) => void, v: string) =>
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v].sort());

  async function save() {
    setSaving(true);
    setError("");
    try {
      // A company email that isn't a user yet: create its row first (role
      // User). Their first Google sign-in links it.
      if (isNewUser) onUserCreated?.(await createUserManually(email, "USER", createdBy));
      const editFlag = tab === "forecaster" && edit ? { edit: true } : {};
      await onSave(
        email,
        kind === "clients"
          ? {
              allAgencies: false,
              agencies: [],
              allRegions: false,
              regions: [],
              clients: [...pickedClients].sort(),
              ...editFlag,
            }
          : {
              allAgencies,
              agencies: allAgencies ? [] : agencies,
              allRegions,
              regions: allRegions ? [] : regions,
              ...editFlag,
            }
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
      setSaving(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="w-full max-w-lg bg-white shadow-2xl flex flex-col max-h-[85vh] pointer-events-auto">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <div>
              <h2 className="text-base font-semibold text-gray-900">
                {initialEmail ? "Change access" : "Give access"} — {tabLabel}
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {tab === "forecaster" && edit ? "View and edit" : "View only"}.
                {kind === "rule" && <> &ldquo;All&rdquo; includes clients added later.</>}
              </p>
            </div>
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
              <X size={18} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            {/* Person */}
            <section>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-gray-500">Person</p>
              {email ? (
                <div className="flex items-center justify-between border border-gray-200 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {user?.displayName || nameFromEmail(email)}
                      {isNewUser && (
                        <span className="ml-2 border border-gray-200 px-1.5 py-0.5 text-[10px] font-semibold text-gray-600">New user</span>
                      )}
                    </p>
                    <p className="text-[11px] text-gray-400 truncate">{email}</p>
                    {isNewUser && (
                      <p className="text-[11px] text-gray-500">Saving adds them as a user (role User) and gives this access.</p>
                    )}
                  </div>
                  {!initialEmail && (
                    <button onClick={() => setEmail("")} className="p-1 text-gray-400 hover:text-gray-900" title="Pick someone else">
                      <X size={14} />
                    </button>
                  )}
                </div>
              ) : (
                <UserSearch
                  users={users}
                  exclude={taken}
                  onPick={setEmail}
                  placeholder="Search people, or type a company email…"
                  newUserDomains={companyDomains}
                />
              )}
            </section>

            {/* Kind of grant */}
            {clientsAllowed ? (
              <section>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-gray-500">Give access by</p>
                <div className="inline-flex items-center bg-gray-100 p-0.5 gap-0.5">
                  {(
                    [
                      ["rule", "Agency & region"],
                      ["clients", "Specific clients"],
                    ] as const
                  ).map(([k, label]) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setKind(k)}
                      className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                        kind === k ? "bg-white text-gray-900" : "text-gray-500 hover:text-gray-700"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </section>
            ) : (
              <p className="text-[11px] text-gray-400">
                This tab&apos;s data is split by agency, so access is given by agency &amp; region (not by client).
              </p>
            )}

            {kind === "rule" ? (
              <>
                {/* Agencies */}
                <ScopePicker
                  title="Agencies"
                  all={allAgencies}
                  onAll={setAllAgencies}
                  allLabel="All agencies"
                  options={CLIENT_AGENCIES.map((a) => ({ value: a.value, label: a.label }))}
                  selected={agencies}
                  onToggle={(v) => setAgenciesAndPrune(agencies.includes(v) ? agencies.filter((x) => x !== v) : [...agencies, v].sort())}
                />

                {/* Regions — limited to the chosen agencies' regions */}
                <ScopePicker
                  title="Regions"
                  hint={
                    allAgencies
                      ? undefined
                      : agencies.length === 0
                        ? "Pick an agency first — its regions show here."
                        : `Regions with clients in ${agencies.join(", ")}.`
                  }
                  all={allRegions}
                  onAll={setAllRegions}
                  allLabel={allAgencies ? "All regions" : "All their regions"}
                  options={regionOptions}
                  selected={regions}
                  onToggle={(v) => toggle(regions, setRegions, v)}
                  emptyText={
                    !allAgencies && agencies.length > 0
                      ? "These agencies have no clients yet — use “All their regions”."
                      : undefined
                  }
                />
                {(tab === "mediaocean" || tab === "reports") && (
                  <p className="-mt-3 text-[11px] text-gray-400">
                    This tab&apos;s data is split by agency only — the region limits its client list, not its agency figures.
                  </p>
                )}
              </>
            ) : (
              <ClientPicker clients={clients} selected={pickedClients} onChange={setPickedClients} />
            )}

            {tab === "forecaster" && (
              <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" checked={edit} onChange={(e) => setEdit(e.target.checked)} className="mt-0.5" />
                <span>
                  Can also edit these clients in Forecast
                  <span className="block text-[11px] text-gray-400">
                    Like being on their client team (forecast, flags, milestones). Leave off for view-only.
                  </span>
                </span>
              </label>
            )}

            {error && <div className="bg-red-500 text-white px-3 py-2 text-sm">{error}</div>}
          </div>

          <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3">
            <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 hover:bg-gray-50">
              Cancel
            </button>
            <button
              onClick={() => void save()}
              disabled={!valid || saving}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-gray-900 hover:bg-gray-800 disabled:opacity-40"
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

function ScopePicker({
  title,
  hint,
  all,
  onAll,
  allLabel,
  options,
  selected,
  onToggle,
  emptyText,
}: {
  title: string;
  hint?: string;
  all: boolean;
  onAll: (v: boolean) => void;
  allLabel: string;
  /** `stale`: kept because it's on the grant, though no longer offered. */
  options: { value: string; label: string; stale?: boolean }[];
  selected: string[];
  onToggle: (v: string) => void;
  /** Shown instead of the choices when there are none to offer. */
  emptyText?: string;
}) {
  return (
    <section>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-gray-500">{title}</p>
      {hint && <p className="-mt-1 mb-1.5 text-[11px] text-gray-400">{hint}</p>}
      <div className="inline-flex items-center bg-gray-100 p-0.5 gap-0.5 mb-2">
        {[true, false].map((v) => (
          <button
            key={String(v)}
            type="button"
            onClick={() => onAll(v)}
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${
              all === v ? "bg-white text-gray-900" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {v ? allLabel : "Choose…"}
          </button>
        ))}
      </div>
      {!all &&
        (options.length === 0 && emptyText ? (
          <p className="text-[11px] text-gray-500">{emptyText}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {options.map((o) => (
              <label
                key={o.value}
                title={o.stale ? "No clients of the chosen agencies are in this region — untick to remove it." : undefined}
                className={`flex items-center gap-1.5 px-2.5 py-1 text-xs border cursor-pointer ${
                  selected.includes(o.value) ? "border-gray-900 bg-white text-gray-900" : "border-gray-200 text-gray-600"
                } ${o.stale ? "line-through" : ""}`}
              >
                <input type="checkbox" checked={selected.includes(o.value)} onChange={() => onToggle(o.value)} />
                {o.label}
              </label>
            ))}
            {selected.length === 0 && <span className="text-[11px] text-red-600 self-center">Pick at least one.</span>}
          </div>
        ))}
    </section>
  );
}

/** Searchable multi-select of clients (name, with agency · region). */
function ClientPicker({
  clients,
  selected,
  onChange,
}: {
  clients: Client[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [q, setQ] = useState("");
  const byId = useMemo(() => new Map(clients.map((c) => [c.cl_id, c])), [clients]);
  const needle = q.trim().toLowerCase();
  const shown = useMemo(
    () =>
      [...clients]
        .sort((a, b) => a.CL_Name.localeCompare(b.CL_Name))
        .filter(
          (c) =>
            !needle ||
            c.CL_Name.toLowerCase().includes(needle) ||
            c.cl_id.toLowerCase().includes(needle) ||
            (c.CL_Agency ?? "").toLowerCase().includes(needle)
        ),
    [clients, needle]
  );
  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  return (
    <section>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-gray-500">
        Clients{selected.length > 0 && <span className="ml-1 text-gray-900">· {selected.length} selected</span>}
      </p>

      {/* Chosen clients */}
      {selected.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {selected.map((id) => (
            <span key={id} className="flex items-center gap-1 border border-gray-900 px-2 py-0.5 text-xs text-gray-900">
              {byId.get(id)?.CL_Name ?? id}
              <button type="button" onClick={() => toggle(id)} className="text-gray-400 hover:text-gray-900" aria-label="Remove">
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 border border-gray-200 px-2.5 py-1.5 focus-within:ring-2 focus-within:ring-yellow-400">
        <Search size={13} className="text-gray-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search clients by name, ID or agency…"
          className="flex-1 text-sm outline-none"
        />
      </div>
      <div className="mt-1 max-h-56 overflow-y-auto border border-gray-100 divide-y divide-gray-50">
        {shown.length === 0 ? (
          <p className="px-3 py-2 text-xs text-gray-400">No clients match.</p>
        ) : (
          shown.map((c) => (
            <label key={c.cl_id} className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50">
              <input type="checkbox" checked={selected.includes(c.cl_id)} onChange={() => toggle(c.cl_id)} />
              <span className="min-w-0 flex-1 truncate text-gray-900">{c.CL_Name}</span>
              {isClientHidden(c) && (
                <span className="border border-gray-200 px-1 text-[10px] text-gray-500">Hidden</span>
              )}
              <span className="flex-shrink-0 text-[11px] text-gray-400">
                {c.CL_Agency} · {c.CL_Business_Unit_Region}
              </span>
            </label>
          ))
        )}
      </div>
      {selected.length === 0 && <p className="mt-1 text-[11px] text-red-600">Pick at least one client.</p>}
      <p className="mt-1 text-[11px] text-gray-400">
        Only these clients — new clients aren&apos;t added automatically.
      </p>
    </section>
  );
}
