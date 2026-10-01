// components/clients/team-access-modal.tsx
"use client";

/**
 * Admin modal — "Sync team access". Gives every client's team (Business Lead,
 * Digital Lead, GM) access to it, for clients whose team was set before team
 * access became automatic. Additive only: it grants and upgrades Viewers to
 * Business Lead, never removes (removal happens when a team member is
 * replaced on a client). Shows a dry-run first; nothing is written until
 * Apply.
 */

import { useEffect, useMemo, useState } from "react";
import { X, Loader2, Users, AlertTriangle } from "lucide-react";
import type { Client } from "../../lib/types/client.types";
import type { TeamAccessPlan } from "../../lib/format/client-team";
import {
  applyTeamAccessPlan,
  planTeamAccessChanges,
} from "../../lib/services/team-access-service";
import { useAuth } from "../../lib/auth-context";

interface TeamAccessModalProps {
  clients: Client[];
  onClose: () => void;
  onApplied: () => void;
}

/** Mount it only while open — each opening starts a fresh dry run. */
export default function TeamAccessModal({
  clients,
  onClose,
  onApplied,
}: TeamAccessModalProps) {
  const { user } = useAuth();
  const [plan, setPlan] = useState<TeamAccessPlan | null>(null);
  const [planning, setPlanning] = useState(true);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState("");

  const nameById = useMemo(
    () => new Map(clients.map((c) => [c.cl_id, c.CL_Name])),
    [clients]
  );

  useEffect(() => {
    let cancelled = false;
    planTeamAccessChanges(clients.map((c) => ({ after: c, before: null })))
      .then((p) => !cancelled && setPlan(p))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Preview failed."))
      .finally(() => !cancelled && setPlanning(false));
    return () => {
      cancelled = true;
    };
  }, [clients]);

  const grants = plan
    ? plan.users.reduce((n, u) => n + u.added.length, 0) +
      plan.invites.reduce((n, i) => n + i.added.length, 0)
    : 0;
  const promoted = plan ? plan.users.filter((u) => u.role).length : 0;
  const nothingToDo = plan !== null && plan.users.length === 0 && plan.invites.length === 0;
  const names = (ids: string[]) => ids.map((id) => nameById.get(id) ?? id).join(", ");

  async function apply() {
    if (!plan) return;
    setApplying(true);
    setError("");
    try {
      await applyTeamAccessPlan(plan, user?.uid);
      onApplied();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Apply failed.");
    } finally {
      setApplying(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="flex max-h-[80vh] w-full max-w-2xl flex-col bg-white shadow-2xl pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
            <div className="flex items-center gap-3">
              <Users size={16} className="text-gray-600" />
              <div>
                <h2 className="text-base font-semibold text-gray-900">Sync team access</h2>
                <p className="text-xs text-gray-500">
                  Gives each client&apos;s Business Lead, Digital Lead and GM access to it.
                </p>
              </div>
            </div>
            <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-700" title="Close">
              <X size={18} />
            </button>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4 text-sm">
            {planning && (
              <div className="flex items-center gap-2 text-gray-500">
                <Loader2 size={14} className="animate-spin" /> Checking every client&apos;s team…
              </div>
            )}
            {error && (
              <div className="flex items-start gap-2 bg-red-500 px-3 py-2 text-white">
                <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" /> {error}
              </div>
            )}
            {nothingToDo && (
              <p className="text-gray-600">Every team member already has access to their clients.</p>
            )}
            {plan && !nothingToDo && (
              <>
                <p className="text-gray-700">
                  <strong>{grants}</strong> client grant{grants === 1 ? "" : "s"} for{" "}
                  <strong>{plan.users.length + plan.invites.length}</strong> people
                  {promoted > 0 && (
                    <>
                      {" "}· <strong>{promoted}</strong> Viewer{promoted === 1 ? "" : "s"} → Business Lead
                    </>
                  )}
                  {plan.invites.length > 0 && (
                    <>
                      {" "}· <strong>{plan.invites.length}</strong> not signed in yet (applied on first
                      sign-in)
                    </>
                  )}
                  . Nothing is removed.
                </p>
                <table className="w-full border border-gray-200 text-xs">
                  <thead className="bg-gray-900 text-left text-white">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Person</th>
                      <th className="px-3 py-2 font-semibold">Gets access to</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.users.map((u) => (
                      <tr key={u.uid} className="border-t border-gray-100 align-top">
                        <td className="px-3 py-2 text-gray-900">
                          {u.email}
                          {u.role && <span className="block text-gray-500">Viewer → Business Lead</span>}
                        </td>
                        <td className="px-3 py-2 text-gray-700">{names(u.added) || "—"}</td>
                      </tr>
                    ))}
                    {plan.invites.map((i) => (
                      <tr key={i.email} className="border-t border-gray-100 align-top">
                        <td className="px-3 py-2 text-gray-900">
                          {i.email}
                          <span className="block text-gray-500">Not signed in yet — invite</span>
                        </td>
                        <td className="px-3 py-2 text-gray-700">{names(i.added) || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>

          <div className="flex justify-end gap-2 border-t border-gray-100 px-6 py-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
            >
              {nothingToDo ? "Close" : "Cancel"}
            </button>
            {!nothingToDo && (
              <button
                onClick={() => void apply()}
                disabled={!plan || applying}
                className="flex items-center gap-2 bg-yellow-400 px-4 py-2 text-sm font-medium text-gray-900 hover:bg-yellow-500 disabled:opacity-50"
              >
                {applying && <Loader2 size={14} className="animate-spin" />}
                Apply
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
