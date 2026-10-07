// components/clients/team-member-picker.tsx
"use client";

/**
 * Pickers for a client's team (Business Lead, Digital Lead, collaborators),
 * choosing from the USERS list so team emails always match a person's row —
 * and so the security rules, which compare the normalized sign-in email
 * against CL_Team_Emails, see the same value. A stored value that is not a
 * user (an old free-text email, a legacy uid) still shows, flagged, so
 * opening and saving the drawer never silently drops it.
 */

import { useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import type { UserProfile } from "../../lib/services/user-service";
import { normalizeEmail } from "../../lib/format/email";

const MAX_RESULTS = 8;

function label(u: UserProfile): string {
  return u.displayName ? `${u.displayName} · ${u.email}` : u.email;
}

/** Search box listing matching users; picking one calls `onPick(email)`. */
export function UserSearch({
  users,
  exclude,
  onPick,
  placeholder,
  disabled,
}: {
  users: UserProfile[];
  exclude: ReadonlySet<string>;
  onPick: (email: string) => void;
  placeholder: string;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users
      .filter((u) => !u.disabled && !exclude.has(u.email))
      .filter((u) => !q || u.email.includes(q) || (u.displayName ?? "").toLowerCase().includes(q))
      .slice(0, MAX_RESULTS);
  }, [users, exclude, query]);

  if (disabled) return null;

  return (
    <div className="relative">
      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
      <input
        ref={inputRef}
        type="text"
        value={query}
        placeholder={placeholder}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        // Delay so a click on a result lands before the list closes.
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
      />
      {open && (
        <ul className="absolute z-20 mt-1 w-full max-h-64 overflow-auto bg-white border border-gray-200 shadow-lg">
          {results.length === 0 ? (
            <li className="px-3 py-2 text-xs text-gray-400">
              No matching user. Add them on Admin → Access first.
            </li>
          ) : (
            results.map((u) => (
              <li key={u.email}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onPick(u.email);
                    setQuery("");
                    setOpen(false);
                    inputRef.current?.blur();
                  }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100"
                >
                  <span className="block text-gray-900 truncate">{u.displayName ?? u.email}</span>
                  {u.displayName && <span className="block text-xs text-gray-500 truncate">{u.email}</span>}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

/** One picked member: name + email, flagged when the value is not a user. */
function MemberChip({
  value,
  user,
  onRemove,
}: {
  value: string;
  user: UserProfile | undefined;
  onRemove?: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 max-w-full px-2 py-1 text-xs bg-gray-100 text-gray-800">
      <span className="truncate">{user ? label(user) : value}</span>
      {!user && (
        <span className="flex-shrink-0 px-1 text-[10px] font-semibold bg-yellow-400 text-gray-900" title="Not in the users list — re-pick to fix">
          not a user
        </span>
      )}
      {onRemove && (
        <button type="button" onClick={onRemove} className="flex-shrink-0 text-gray-400 hover:text-gray-900" title="Remove">
          <X size={12} />
        </button>
      )}
    </span>
  );
}

function useUsersByEmail(users: UserProfile[]) {
  return useMemo(() => new Map(users.map((u) => [u.email, u])), [users]);
}

/** A single team slot (Business Lead, Digital Lead). Empty value = nobody. */
export function TeamMemberSelect({
  value,
  onChange,
  users,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (email: string) => void;
  users: UserProfile[];
  placeholder: string;
  disabled?: boolean;
}) {
  const byEmail = useUsersByEmail(users);
  const current = value.trim();
  if (current) {
    return (
      <div className="flex">
        <MemberChip
          value={current}
          user={byEmail.get(normalizeEmail(current))}
          onRemove={disabled ? undefined : () => onChange("")}
        />
      </div>
    );
  }
  if (disabled) return <p className="text-sm text-gray-400">—</p>;
  return <UserSearch users={users} exclude={new Set()} onPick={onChange} placeholder={placeholder} />;
}

/** Collaborators: any number of users. */
export function TeamMemberMultiSelect({
  value,
  onChange,
  users,
  placeholder,
  disabled,
}: {
  value: string[];
  onChange: (emails: string[]) => void;
  users: UserProfile[];
  placeholder: string;
  disabled?: boolean;
}) {
  const byEmail = useUsersByEmail(users);
  const picked = useMemo(() => new Set(value.map(normalizeEmail)), [value]);
  return (
    <div className="space-y-2">
      {value.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {value.map((v) => (
            <MemberChip
              key={v}
              value={v}
              user={byEmail.get(normalizeEmail(v))}
              onRemove={disabled ? undefined : () => onChange(value.filter((x) => x !== v))}
            />
          ))}
        </div>
      ) : (
        disabled && <p className="text-sm text-gray-400">—</p>
      )}
      <UserSearch
        users={users}
        exclude={picked}
        onPick={(email) => onChange([...value, email])}
        placeholder={placeholder}
        disabled={disabled}
      />
    </div>
  );
}
