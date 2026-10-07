// components/users/team-sheet-import-modal.tsx
"use client";

/**
 * Admin → Forecast Access → Import: paste the link of an edited team export,
 * review every change (dry run, planTeamSheetImport), then apply. Errors block
 * the import; warnings are shown. Nothing is written before "Apply".
 */

import { useMemo, useState } from "react";
import { X, AlertTriangle, Loader2, FileSpreadsheet, Check, Info } from "lucide-react";
import type { Client } from "../../lib/types/client.types";
import {
  planTeamSheetImport,
  TeamSheetStructureError,
  type TeamSheetChange,
  type TeamSheetPlan,
} from "../../lib/format/team-sheet";
import { describeSheetError, readLinkedSheet } from "../../lib/services/linked-sheet";
import { applyTeamSheetChanges } from "../../lib/services/team-access-service";

export default function TeamSheetImportModal({
  clients,
  userEmails,
  onClose,
  onApplied,
}: {
  clients: Client[];
  userEmails: ReadonlySet<string>;
  onClose: () => void;
  onApplied: (changes: TeamSheetChange[]) => void;
}) {
  const [link, setLink] = useState("");
  const [checking, setChecking] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [source, setSource] = useState("");
  const [plan, setPlan] = useState<TeamSheetPlan | null>(null);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState("");

  async function check() {
    setChecking(true);
    setProblems([]);
    try {
      // The first Google call opens the consent popup when there's no live token.
      const { name, table } = await readLinkedSheet(link.trim());
      setPlan(planTeamSheetImport(table, clients, userEmails));
      setSource(name);
    } catch (err) {
      setProblems(err instanceof TeamSheetStructureError ? err.problems : [describeSheetError(err)]);
    } finally {
      setChecking(false);
    }
  }

  async function apply() {
    if (!plan) return;
    setApplying(true);
    setApplyError("");
    try {
      await applyTeamSheetChanges(plan.changes);
      onApplied(plan.changes);
    } catch (err) {
      setApplyError("Import failed: " + (err instanceof Error ? err.message : "Unknown error"));
      setApplying(false);
    }
  }

  const totals = useMemo(() => {
    if (!plan) return null;
    let added = 0, removed = 0, leads = 0;
    for (const c of plan.changes) {
      added += c.added.length;
      removed += c.removed.length;
      leads += Number(!!c.bl) + Number(!!c.dl);
    }
    return { added, removed, leads };
  }, [plan]);

  const blocked = !plan || plan.errors.length > 0 || plan.changes.length === 0;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="w-full max-w-2xl bg-white shadow-2xl flex flex-col max-h-[85vh] pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-green-500 flex items-center justify-center">
                <FileSpreadsheet size={16} className="text-white" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-gray-900">Import client teams</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  {plan ? source : "Nothing is saved until you apply the review."}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
              <X size={18} />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            {!plan ? (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Google Sheet link</label>
                <input
                  type="url"
                  autoFocus
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && link.trim() && !checking) void check();
                  }}
                  placeholder="https://docs.google.com/spreadsheets/d/…"
                  className="w-full px-3 py-2 text-sm border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
                />
                <ul className="text-xs text-gray-500 mt-2 space-y-1 list-disc pl-4">
                  <li>
                    Start from <strong>Export</strong> and keep the headers on row 1 (Client ID, Client
                    Name, Role, Email). One row per person per client.
                  </li>
                  <li>
                    For every client in the sheet, its Business Lead, Digital Lead and collaborators become
                    exactly the sheet&apos;s rows — delete a row to remove that person, add one to give access.
                  </li>
                  <li>Clients with no row in the sheet are left unchanged.</li>
                  <li>GM rows are read-only: the GM comes from the client&apos;s GM Pod.</li>
                </ul>
                {problems.length > 0 && (
                  <div className="mt-4 bg-red-500 px-3 py-2.5 space-y-1.5">
                    <p className="flex items-center gap-2 text-sm font-medium text-white">
                      <AlertTriangle size={14} />
                      This sheet can&apos;t be imported
                    </p>
                    {problems.map((p, i) => (
                      <p key={i} className="text-xs text-white leading-relaxed">
                        {p}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <>
                {/* Summary */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <Summary label="Clients changed" value={plan.changes.length} />
                  <Summary label="People added" value={totals!.added} />
                  <Summary label="People removed" value={totals!.removed} />
                  <Summary label="BL / DL changes" value={totals!.leads} />
                </div>
                <p className="text-xs text-gray-500">
                  {plan.clientsInSheet} client{plan.clientsInSheet !== 1 ? "s" : ""} in the sheet;{" "}
                  {plan.clientsNotInSheet} not in it (left unchanged).
                </p>

                {plan.errors.length > 0 && (
                  <IssueList
                    tone="error"
                    title={`${plan.errors.length} problem${plan.errors.length !== 1 ? "s" : ""} — fix the sheet and check again`}
                    issues={plan.errors}
                  />
                )}
                {plan.warnings.length > 0 && (
                  <IssueList tone="warning" title="Worth a look" issues={plan.warnings} />
                )}

                {plan.changes.length === 0 && plan.errors.length === 0 ? (
                  <p className="flex items-center gap-2 text-sm text-gray-600">
                    <Check size={15} className="text-green-500" /> Nothing to change — the sheet matches the current teams.
                  </p>
                ) : (
                  <ul className="divide-y divide-gray-100 border border-gray-200">
                    {plan.changes.map((c) => (
                      <li key={c.cl_id} className="px-3 py-2 text-xs">
                        <p className="text-sm font-medium text-gray-900">
                          {c.name} <span className="text-[11px] font-normal text-gray-400">{c.cl_id}</span>
                        </p>
                        <div className="mt-1 space-y-0.5">
                          {c.bl && <LeadLine label="Business Lead" {...c.bl} />}
                          {c.dl && <LeadLine label="Digital Lead" {...c.dl} />}
                          {c.added.map((e) => (
                            <p key={"+" + e} className="text-green-700">+ {e} (collaborator)</p>
                          ))}
                          {c.removed.map((e) => (
                            <p key={"-" + e} className="text-red-600">− {e} (collaborator)</p>
                          ))}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {applyError && <div className="bg-red-500 text-white px-3 py-2 text-sm">{applyError}</div>}
              </>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-3">
            {plan ? (
              <button
                onClick={() => {
                  setPlan(null);
                  setApplyError("");
                }}
                disabled={applying}
                className="text-xs text-gray-500 hover:text-gray-800"
              >
                ← Use another sheet
              </button>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 hover:bg-gray-50"
              >
                Cancel
              </button>
              {plan ? (
                <button
                  onClick={() => void apply()}
                  disabled={blocked || applying}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-gray-900 hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {applying && <Loader2 size={14} className="animate-spin" />}
                  Apply {plan.changes.length} change{plan.changes.length !== 1 ? "s" : ""}
                </button>
              ) : (
                <button
                  onClick={() => void check()}
                  disabled={checking || !link.trim()}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-900 bg-yellow-400 hover:bg-yellow-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {checking && <Loader2 size={14} className="animate-spin" />}
                  {checking ? "Checking..." : "Check sheet"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function Summary({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-gray-200 px-3 py-2">
      <p className="text-[11px] text-gray-500">{label}</p>
      <p className="text-lg font-bold tabular-nums text-gray-900">{value}</p>
    </div>
  );
}

function LeadLine({ label, before, after }: { label: string; before: string; after: string }) {
  return (
    <p className="text-gray-700">
      {label}: <span className="text-gray-400 line-through">{before || "none"}</span> →{" "}
      <span className="font-medium">{after || "none"}</span>
    </p>
  );
}

function IssueList({
  tone,
  title,
  issues,
}: {
  tone: "error" | "warning";
  title: string;
  issues: { row: number | null; message: string }[];
}) {
  const box = tone === "error" ? "bg-red-500 text-white" : "bg-yellow-400 text-gray-900";
  return (
    <div className={`${box} px-3 py-2.5`}>
      <p className="flex items-center gap-2 text-sm font-medium">
        {tone === "error" ? <AlertTriangle size={14} /> : <Info size={14} />}
        {title}
      </p>
      <ul className="mt-1.5 max-h-40 overflow-y-auto space-y-0.5">
        {issues.map((i, k) => (
          <li key={k} className="text-xs leading-relaxed">
            {i.row !== null && <span className="font-semibold">Row {i.row}: </span>}
            {i.message}
          </li>
        ))}
      </ul>
    </div>
  );
}
