// components/users/client-people-drawer.tsx
"use client";

/**
 * Admin → Forecast Access, one client → many people (the reverse of
 * PersonClientsDrawer). Lists the client's GM / BL / DL seats (locked — they
 * come from the client's GM Pod, Business Lead and Digital Lead fields) and
 * edits its collaborators.
 */

import { useMemo, useState } from "react";
import { X, Loader2, Lock } from "lucide-react";
import type { Client } from "../../lib/types/client.types";
import type { UserProfile } from "../../lib/services/user-service";
import { normalizeEmailList } from "../../lib/format/email";
import { collaboratorsUpdate, teamSeats, TEAM_ROLE_LABELS } from "../../lib/format/client-team";
import { applyCollaboratorsUpdates } from "../../lib/services/team-access-service";
import { TeamMemberMultiSelect } from "../clients/team-member-picker";

export default function ClientPeopleDrawer({
  client,
  users,
  onClose,
  onSaved,
}: {
  client: Client;
  users: UserProfile[];
  onClose: () => void;
  onSaved: (updated: Client) => void;
}) {
  const initial = useMemo(() => normalizeEmailList(client.CL_Collaborators ?? []), [client]);
  const [collaborators, setCollaborators] = useState<string[]>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const names = useMemo(() => new Map(users.map((u) => [u.email, u.displayName])), [users]);
  const lockedSeats = teamSeats(client).filter((s) => s.role !== "COLLABORATOR");
  const next = normalizeEmailList(collaborators);
  const hasChanges = next.join("|") !== initial.join("|");

  async function save() {
    setSaving(true);
    setError("");
    try {
      const update = collaboratorsUpdate(client, next);
      await applyCollaboratorsUpdates([update]);
      onSaved({ ...client, ...update });
    } catch (err) {
      setError("Failed to save: " + (err instanceof Error ? err.message : "Unknown error"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div className="fixed top-0 right-0 z-50 h-[calc(100vh/var(--app-zoom,1))] w-full max-w-xl bg-white shadow-2xl flex flex-col">
        <div className="bg-gray-900 px-6 py-5 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-white truncate">{client.CL_Name}</h2>
            <p className="text-xs text-gray-400 truncate">
              {client.cl_id} · {client.CL_Agency} · {(client.CL_Team_Emails ?? []).length} people
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:bg-gray-800 hover:text-white transition-colors flex-shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Team from the client</h3>
            {lockedSeats.length === 0 ? (
              <p className="text-sm text-gray-400">No GM, Business Lead or Digital Lead set.</p>
            ) : (
              <ul className="divide-y divide-gray-100 border border-gray-200">
                {lockedSeats.map((s) => (
                  <li key={`${s.role}-${s.email}`} className="flex items-center gap-3 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">{names.get(s.email) ?? s.email}</p>
                      <p className="text-[11px] text-gray-400 truncate">{s.email}</p>
                    </div>
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium border border-gray-200 bg-gray-100 text-gray-700">
                      <Lock size={9} />
                      {TEAM_ROLE_LABELS[s.role]}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-[11px] text-gray-400">
              GM comes from the GM Pod; Business Lead and Digital Lead are edited in the client drawer (Clients page).
            </p>
          </section>

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Collaborators</h3>
            <TeamMemberMultiSelect
              value={collaborators}
              onChange={setCollaborators}
              users={users}
              placeholder="Add people by name or email..."
            />
            <p className="mt-2 text-[11px] text-gray-400">
              Collaborators edit this client like the Business Lead and see it on the Forecaster dashboard.
            </p>
          </section>
        </div>

        {error && <div className="mx-6 mb-3 bg-red-500 text-white px-3 py-2 text-sm">{error}</div>}

        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={!hasChanges || saving}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-40"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            Save
          </button>
        </div>
      </div>
    </>
  );
}
