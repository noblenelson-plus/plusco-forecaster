// components/clients/team-access-modal.tsx
"use client";

/**
 * Admin modal — "Team access". Recomputes every client's CL_Team_Emails (the
 * array the security rules and "my clients" read) from its Business Lead,
 * Digital Lead, GM Pod and collaborators. Client saves keep it current; this
 * repairs older clients or applies a GM_POD_EMAILS change. Shows a dry run
 * first; nothing is written until Apply. Also lists team emails that have no
 * user row and team values that are not emails, for the admin to fix.
 */

import { useEffect, useState } from "react";
import { X, Loader2, Users, AlertTriangle } from "lucide-react";
import type { Client } from "../../lib/types/client.types";
import type { TeamEmailsPlan } from "../../lib/format/client-team";
import {
  applyTeamEmailsChanges,
  planTeamEmailsChanges,
} from "../../lib/services/team-access-service";

interface TeamAccessModalProps {
  clients: Client[];
  onClose: () => void;
  onApplied: () => void;
}

/** Mount it only while open — each opening starts a fresh dry run. */
export default function TeamAccessModal({ clients, onClose, onApplied }: TeamAccessModalProps) {
  const [plan, setPlan] = useState<TeamEmailsPlan | null>(null);
  const [planning, setPlanning] = useState(true);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    planTeamEmailsChanges(clients)
      .then((p) => !cancelled && setPlan(p))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Preview failed."))
      .finally(() => !cancelled && setPlanning(false));
    return () => {
      cancelled = true;
    };
  }, [clients]);

  const nothingToDo = plan !== null && plan.changes.length === 0;

  async function apply() {
    if (!plan) return;
    setApplying(true);
    setError("");
    try {
      await applyTeamEmailsChanges(plan.changes);
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
                <h2 className="text-base font-semibold text-gray-900">Team access</h2>
                <p className="text-xs text-gray-500">
                  Recomputes who can work on each client from its leads, GM Pod and collaborators.
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
            {nothingToDo && <p className="text-gray-600">Every client&apos;s team access is up to date.</p>}
            {plan && !nothingToDo && (
              <>
                <p className="text-gray-700">
                  <strong>{plan.changes.length}</strong> client{plan.changes.length === 1 ? "" : "s"} to update.
                </p>
                <table className="w-full border border-gray-200 text-xs">
                  <thead className="bg-gray-900 text-left text-white">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Client</th>
                      <th className="px-3 py-2 font-semibold">Gains access</th>
                      <th className="px-3 py-2 font-semibold">Loses access</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.changes.map((c) => (
                      <tr key={c.cl_id} className="border-t border-gray-100 align-top">
                        <td className="px-3 py-2 text-gray-900">{c.name}</td>
                        <td className="px-3 py-2 text-gray-700">{c.added.join(", ") || "—"}</td>
                        <td className="px-3 py-2 text-gray-700">{c.removed.join(", ") || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
            {plan && plan.notUsers.length > 0 && (
              <div className="bg-yellow-400 px-3 py-2 text-gray-900">
                <p className="font-semibold">
                  {plan.notUsers.length} team email{plan.notUsers.length === 1 ? " has" : "s have"} no user row
                </p>
                <p className="text-xs mt-1">
                  They keep access, but can&apos;t be picked in the client drawer until added on Admin → Access:{" "}
                  {plan.notUsers.join(", ")}
                </p>
              </div>
            )}
            {plan && plan.invalid.length > 0 && (
              <div className="bg-red-500 px-3 py-2 text-white">
                <p className="font-semibold">Team values that are not emails (ignored)</p>
                <ul className="text-xs mt-1 space-y-0.5">
                  {plan.invalid.map((i) => (
                    <li key={i.cl_id}>
                      {i.name}: {i.values.join(", ")}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 border-t border-gray-100 px-6 py-3">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">
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
