// components/clients/digital-lead-select.tsx
"use client";

/**
 * The client drawer's Digital Lead field: a dropdown of the agreed Digital
 * Leads (config/digital_leads, digital-leads-service.ts), like the GM Pod
 * dropdown. "Add a Digital Lead…" lets an admin pick any user, which also adds
 * them to the list for every client. A stored DL that isn't in the list (set
 * before the list existed) still shows, flagged, so saving never drops it.
 */

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Loader2, X } from "lucide-react";
import type { UserProfile } from "../../lib/services/user-service";
import { addDigitalLead, fetchDigitalLeads } from "../../lib/services/digital-leads-service";
import { nameFromEmail, normalizeEmail } from "../../lib/format/email";
import { UserSearch } from "./team-member-picker";

const ADD = "__add__";

export default function DigitalLeadSelect({
  value,
  onChange,
  users,
  disabled,
}: {
  value: string;
  onChange: (email: string) => void;
  users: UserProfile[];
  disabled?: boolean;
}) {
  const [list, setList] = useState<string[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchDigitalLeads()
      .then((emails) => !cancelled && setList(emails))
      .catch((err) => {
        console.error("Failed to load the Digital Lead list:", err);
        if (!cancelled) setList([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const names = useMemo(() => new Map(users.map((u) => [u.email, u.displayName])), [users]);
  const label = (email: string) => `${names.get(email) ?? nameFromEmail(email)} · ${email}`;
  const current = normalizeEmail(value);
  const options = useMemo(() => {
    const emails = list ?? [];
    return [...emails].sort((a, b) => label(a).localeCompare(label(b)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, names]);
  const notInList = !!current && list !== null && !list.includes(current);

  async function pickNew(email: string) {
    const e = normalizeEmail(email);
    setSaving(true);
    setError("");
    try {
      await addDigitalLead(e);
      setList((prev) => [...new Set([...(prev ?? []), e])]);
      onChange(e);
      setAdding(false);
    } catch (err) {
      setError("Couldn't add to the Digital Lead list: " + (err instanceof Error ? err.message : "Unknown error"));
    } finally {
      setSaving(false);
    }
  }

  if (disabled) {
    return <p className="text-sm text-gray-700">{current ? label(current) : <span className="text-gray-400">—</span>}</p>;
  }

  if (adding) {
    return (
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <UserSearch
              users={users}
              exclude={new Set(list ?? [])}
              onPick={(e) => void pickNew(e)}
              placeholder="Search users to add as a Digital Lead…"
            />
          </div>
          {saving ? (
            <Loader2 size={15} className="animate-spin text-gray-400" />
          ) : (
            <button type="button" onClick={() => setAdding(false)} className="p-1 text-gray-400 hover:text-gray-900" title="Cancel">
              <X size={15} />
            </button>
          )}
        </div>
        <p className="text-[11px] text-gray-400">They&apos;re added to the Digital Lead list for every client.</p>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="relative">
        <select
          value={current}
          disabled={list === null}
          onChange={(e) => (e.target.value === ADD ? setAdding(true) : onChange(e.target.value))}
          className={`w-full appearance-none px-3 py-2 pr-8 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent cursor-pointer ${
            current ? "text-gray-900" : "text-gray-400"
          }`}
        >
          <option value="" className="text-gray-900">
            {list === null ? "Loading…" : "No Digital Lead"}
          </option>
          {notInList && (
            <option value={current} className="text-gray-900">
              {label(current)} (not in the list)
            </option>
          )}
          {options.map((e) => (
            <option key={e} value={e} className="text-gray-900">
              {label(e)}
            </option>
          ))}
          <option value={ADD} className="text-gray-900">
            + Add a Digital Lead…
          </option>
        </select>
        <ChevronDown size={13} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
