// components/clients/lead-select.tsx
"use client";

/**
 * The client drawer's Business Lead / Digital Lead field: a dropdown of the
 * agreed people (config/business_leads or config/digital_leads,
 * lead-lists-service.ts), like the GM Pod dropdown, showing names only.
 * "Add a …" lets an admin pick any user, which also adds them to the list for
 * every client. A stored lead that isn't in the list (set before the list
 * existed) still shows, flagged, so saving never drops it.
 */

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Loader2, X } from "lucide-react";
import type { UserProfile } from "../../lib/services/user-service";
import { addToLeadList, fetchLeadList, type LeadKind } from "../../lib/services/lead-lists-service";
import { emailDomain, nameFromEmail, normalizeEmail } from "../../lib/format/email";
import { UserSearch } from "./team-member-picker";

const ADD = "__add__";
const TITLE: Record<LeadKind, string> = { business: "Business Lead", digital: "Digital Lead" };

export default function LeadSelect({
  kind,
  value,
  onChange,
  users,
  disabled,
}: {
  kind: LeadKind;
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
    fetchLeadList(kind)
      .then((emails) => !cancelled && setList(emails))
      .catch((err) => {
        console.error(`Failed to load the ${TITLE[kind]} list:`, err);
        if (!cancelled) setList([]);
      });
    return () => {
      cancelled = true;
    };
  }, [kind]);

  const current = normalizeEmail(value);
  const notInList = !!current && list !== null && !list.includes(current);

  // Names only; a name shared by two accounts gets its domain to tell them apart.
  const { options, label } = useMemo(() => {
    const names = new Map(users.map((u) => [u.email, u.displayName]));
    const emails = [...new Set([...(list ?? []), ...(current ? [current] : [])])];
    const nameOf = (e: string) => names.get(e) || nameFromEmail(e);
    // "Charlaine St-Amant" and "Charlaine St Amant" are the same person.
    const key = (e: string) =>
      nameOf(e).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");
    const counts = new Map<string, number>();
    for (const e of emails) counts.set(key(e), (counts.get(key(e)) ?? 0) + 1);
    const label = (e: string) => (counts.get(key(e))! > 1 ? `${nameOf(e)} (${emailDomain(e)})` : nameOf(e));
    const options = (list ?? []).slice().sort((a, b) => label(a).localeCompare(label(b)));
    return { options, label };
  }, [list, users, current]);

  async function pickNew(email: string) {
    const e = normalizeEmail(email);
    setSaving(true);
    setError("");
    try {
      await addToLeadList(kind, e);
      setList((prev) => [...new Set([...(prev ?? []), e])]);
      onChange(e);
      setAdding(false);
    } catch (err) {
      setError(`Couldn't add to the ${TITLE[kind]} list: ` + (err instanceof Error ? err.message : "Unknown error"));
    } finally {
      setSaving(false);
    }
  }

  if (disabled) {
    return (
      <p className="text-sm text-gray-700" title={current || undefined}>
        {current ? label(current) : <span className="text-gray-400">—</span>}
      </p>
    );
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
              placeholder={`Search users to add as a ${TITLE[kind]}…`}
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
        <p className="text-[11px] text-gray-400">They&apos;re added to the {TITLE[kind]} list for every client.</p>
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
          title={current || undefined}
          className={`w-full appearance-none px-3 py-2 pr-8 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent cursor-pointer ${
            current ? "text-gray-900" : "text-gray-400"
          }`}
        >
          <option value="" className="text-gray-900">
            {list === null ? "Loading…" : `No ${TITLE[kind]}`}
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
            + Add a {TITLE[kind]}…
          </option>
        </select>
        <ChevronDown size={13} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
