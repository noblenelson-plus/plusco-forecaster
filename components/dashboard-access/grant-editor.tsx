// components/dashboard-access/grant-editor.tsx
"use client";

/**
 * Admin → Dashboard Access: add or change one person's grant on one tab —
 * the clients of chosen agencies × regions ("All" includes clients added
 * later), read-only; on Forecaster, optionally edit too.
 */

import { useState } from "react";
import { Loader2, X } from "lucide-react";
import type { UserProfile } from "../../lib/services/user-service";
import type { DashboardTabId, GrantScope } from "../../lib/types/access.types";
import { CLIENT_AGENCIES, CLIENT_REGIONS } from "../../lib/constants/client.constants";
import { nameFromEmail } from "../../lib/format/email";
import { UserSearch } from "../clients/team-member-picker";

export default function GrantEditor({
  tab,
  tabLabel,
  email: initialEmail,
  scope: initialScope,
  users,
  taken,
  onClose,
  onSave,
}: {
  tab: DashboardTabId;
  tabLabel: string;
  /** Editing an existing grant (fixed person) — else pick one. */
  email?: string;
  scope?: GrantScope;
  users: UserProfile[];
  /** Emails already granted this tab (excluded from the picker). */
  taken: ReadonlySet<string>;
  onClose: () => void;
  /** Persists the grant; rejects with a message on failure. */
  onSave: (email: string, scope: GrantScope) => Promise<void>;
}) {
  const [email, setEmail] = useState(initialEmail ?? "");
  const [allAgencies, setAllAgencies] = useState(initialScope?.allAgencies ?? true);
  const [agencies, setAgencies] = useState<string[]>(initialScope?.agencies ?? []);
  const [allRegions, setAllRegions] = useState(initialScope?.allRegions ?? true);
  const [regions, setRegions] = useState<string[]>(initialScope?.regions ?? []);
  const [edit, setEdit] = useState(!!initialScope?.edit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const user = users.find((u) => u.email === email);
  const valid = !!email && (allAgencies || agencies.length > 0) && (allRegions || regions.length > 0);

  const toggle = (list: string[], set: (v: string[]) => void, v: string) =>
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v].sort());

  async function save() {
    setSaving(true);
    setError("");
    try {
      await onSave(email, {
        allAgencies,
        agencies: allAgencies ? [] : agencies,
        allRegions,
        regions: allRegions ? [] : regions,
        ...(tab === "forecaster" && edit ? { edit: true } : {}),
      });
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
                {tab === "forecaster" && edit ? "View and edit" : "View only"}. &ldquo;All&rdquo; includes clients added later.
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
                    <p className="text-sm font-medium text-gray-900 truncate">{user?.displayName || nameFromEmail(email)}</p>
                    <p className="text-[11px] text-gray-400 truncate">{email}</p>
                  </div>
                  {!initialEmail && (
                    <button onClick={() => setEmail("")} className="p-1 text-gray-400 hover:text-gray-900" title="Pick someone else">
                      <X size={14} />
                    </button>
                  )}
                </div>
              ) : (
                <UserSearch users={users} exclude={taken} onPick={setEmail} placeholder="Search people by name or email…" />
              )}
            </section>

            {/* Agencies */}
            <ScopePicker
              title="Agencies"
              all={allAgencies}
              onAll={setAllAgencies}
              allLabel="All agencies"
              options={CLIENT_AGENCIES.map((a) => ({ value: a.value, label: a.label }))}
              selected={agencies}
              onToggle={(v) => toggle(agencies, setAgencies, v)}
            />

            {/* Regions */}
            <ScopePicker
              title="Regions"
              all={allRegions}
              onAll={setAllRegions}
              allLabel="All regions"
              options={CLIENT_REGIONS.map((r) => ({ value: r.value, label: r.label }))}
              selected={regions}
              onToggle={(v) => toggle(regions, setRegions, v)}
            />
            {tab !== "forecaster" && (tab === "mediaocean" || tab === "reports") && (
              <p className="-mt-3 text-[11px] text-gray-400">
                This tab&apos;s data is split by agency only — the region limits its client list, not its agency figures.
              </p>
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
  all,
  onAll,
  allLabel,
  options,
  selected,
  onToggle,
}: {
  title: string;
  all: boolean;
  onAll: (v: boolean) => void;
  allLabel: string;
  options: { value: string; label: string }[];
  selected: string[];
  onToggle: (v: string) => void;
}) {
  return (
    <section>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-gray-500">{title}</p>
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
      {!all && (
        <div className="flex flex-wrap gap-2">
          {options.map((o) => (
            <label
              key={o.value}
              className={`flex items-center gap-1.5 px-2.5 py-1 text-xs border cursor-pointer ${
                selected.includes(o.value) ? "border-gray-900 bg-white text-gray-900" : "border-gray-200 text-gray-600"
              }`}
            >
              <input type="checkbox" checked={selected.includes(o.value)} onChange={() => onToggle(o.value)} />
              {o.label}
            </label>
          ))}
          {selected.length === 0 && <span className="text-[11px] text-red-600 self-center">Pick at least one.</span>}
        </div>
      )}
    </section>
  );
}
