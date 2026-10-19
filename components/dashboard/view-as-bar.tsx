// components/dashboard/view-as-bar.tsx
"use client";

/**
 * Admin-only "View as" control for the dashboard: pick a person to see the
 * dashboard exactly as they do (ViewAsProvider in lib/hooks/use-access.tsx),
 * then a banner while previewing. The choice lives in the URL (`?viewAs=`),
 * so a reload or a shared link keeps it. Read-only: only the dashboard
 * changes; editing pages keep the admin's own access.
 */

import { useEffect, useState } from "react";
import { Eye, X } from "lucide-react";
import { UserSearch } from "../clients/team-member-picker";
import { fetchUsers, type UserProfile } from "../../lib/services/user-service";
import { nameFromEmail } from "../../lib/format/email";

/** The picker (not previewing): a compact "View as…" search. */
export function ViewAsPicker({ onPick }: { onPick: (email: string) => void }) {
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<UserProfile[] | null>(null);
  useEffect(() => {
    if (!open || users) return;
    fetchUsers()
      .then(setUsers)
      .catch(() => setUsers([]));
  }, [open, users]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:border-gray-900"
        title="See the dashboard exactly as someone else sees it (admins only, read-only)"
      >
        <Eye size={13} />
        View as…
      </button>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <div className="w-72">
        {users ? (
          <UserSearch users={users} exclude={new Set()} onPick={onPick} placeholder="View the dashboard as… (name or email)" />
        ) : (
          <p className="text-xs text-gray-400">Loading people…</p>
        )}
      </div>
      <button type="button" onClick={() => setOpen(false)} className="p-1 text-gray-400 hover:text-gray-900" title="Cancel">
        <X size={14} />
      </button>
    </div>
  );
}

/** The banner while previewing someone's dashboard. */
export function ViewAsBanner({ email, name, onExit }: { email: string; name?: string | null; onExit: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 bg-yellow-400 px-4 py-2 text-sm text-gray-900">
      <span className="flex min-w-0 items-center gap-2">
        <Eye size={15} className="flex-shrink-0" />
        <span className="truncate">
          Viewing the dashboard as <strong>{name || nameFromEmail(email)}</strong> ({email}) — exactly what they see.
          Read-only preview.
        </span>
      </span>
      <button
        type="button"
        onClick={onExit}
        className="flex flex-shrink-0 items-center gap-1 bg-gray-900 px-2.5 py-1 text-xs font-semibold text-white hover:bg-gray-800"
      >
        <X size={12} />
        Exit
      </button>
    </div>
  );
}
