// components/dashboard-access/grant-sheet-import-modal.tsx
"use client";

/**
 * Admin → Dashboard Access → Import: paste the link of an edited grants
 * export, review every change (dry run, planGrantSheetImport), then apply.
 * The sheet is the full list — people without rows lose their grants, which
 * the review spells out. Errors block the import; nothing is written before
 * "Apply".
 */

import { useMemo, useState } from "react";
import { X, AlertTriangle, Loader2, FileSpreadsheet, Check, Info } from "lucide-react";
import type { DashboardGrantDoc, DashboardTabId } from "../../lib/types/access.types";
import {
  planGrantSheetImport,
  GrantSheetStructureError,
  type GrantSheetChange,
  type GrantSheetPlan,
} from "../../lib/format/grant-sheet";
import { describeSheetError, readLinkedSheet } from "../../lib/services/linked-sheet";
import { saveGrantsBatch } from "../../lib/services/dashboard-grants-service";

export default function GrantSheetImportModal({
  current,
  userEmails,
  tabLabels,
  updatedBy,
  onClose,
  onApplied,
}: {
  current: DashboardGrantDoc[];
  userEmails: ReadonlySet<string>;
  tabLabels: Record<DashboardTabId, string>;
  updatedBy: string;
  onClose: () => void;
  onApplied: (changes: GrantSheetChange[]) => void;
}) {
  const [link, setLink] = useState("");
  const [checking, setChecking] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [source, setSource] = useState("");
  const [plan, setPlan] = useState<GrantSheetPlan | null>(null);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState("");

  async function check() {
    setChecking(true);
    setProblems([]);
    try {
      // The first Google call opens the consent popup when there's no live token.
      const { name, table } = await readLinkedSheet(link.trim());
      setPlan(planGrantSheetImport(table, current, userEmails, tabLabels));
      setSource(name);
    } catch (err) {
      setProblems(err instanceof GrantSheetStructureError ? err.problems : [describeSheetError(err)]);
    } finally {
      setChecking(false);
    }
  }

  async function apply() {
    if (!plan) return;
    setApplying(true);
    setApplyError("");
    try {
      await saveGrantsBatch(plan.changes.map((c) => ({ email: c.email, tabs: c.tabs })), updatedBy);
      onApplied(plan.changes);
    } catch (err) {
      setApplyError("Import failed: " + (err instanceof Error ? err.message : "Unknown error"));
      setApplying(false);
    }
  }

  const totals = useMemo(() => {
    const t = { add: 0, change: 0, remove: 0, losesAll: 0 };
    for (const c of plan?.changes ?? []) {
      for (const l of c.lines) t[l.kind]++;
      if (Object.keys(c.tabs).length === 0) t.losesAll++;
    }
    return t;
  }, [plan]);

  const blocked = !plan || plan.errors.length > 0 || plan.changes.length === 0;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="w-full max-w-2xl bg-white shadow-2xl flex flex-col max-h-[85vh] pointer-events-auto" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-green-500 flex items-center justify-center">
                <FileSpreadsheet size={16} className="text-white" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-gray-900">Import dashboard access</h2>
                <p className="text-xs text-gray-400 mt-0.5">{plan ? source : "Nothing is saved until you apply the review."}</p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
              <X size={18} />
            </button>
          </div>

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
                    Start from <strong>Export</strong> and keep the headers on row 1 (Email, Name, Tab, Agencies,
                    Regions, Can edit). One row per person per tab.
                  </li>
                  <li>
                    Agencies / Regions: <strong>All</strong> (includes clients added later) or a comma-separated list.
                    &ldquo;Can edit&rdquo; (Yes / No) only applies to Forecaster.
                  </li>
                  <li>
                    <strong>The sheet is the full list:</strong> anyone without a row loses their access. Delete a row to
                    remove a tab, add one to give access.
                  </li>
                  <li>Client teams and email-domain defaults aren&apos;t grants — they don&apos;t appear in the sheet.</li>
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
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <Summary label="People changed" value={plan.changes.length} />
                  <Summary label="Tabs given" value={totals.add} />
                  <Summary label="Scopes changed" value={totals.change} />
                  <Summary label="Tabs removed" value={totals.remove} warn={totals.remove > 0} />
                </div>
                <p className="text-xs text-gray-500">
                  {plan.rows} row{plan.rows !== 1 ? "s" : ""} for {plan.people} {plan.people === 1 ? "person" : "people"}.
                  {totals.losesAll > 0 && (
                    <strong className="text-red-600"> {totals.losesAll} {totals.losesAll === 1 ? "person loses" : "people lose"} all their access.</strong>
                  )}
                </p>

                {plan.errors.length > 0 && (
                  <IssueList
                    tone="error"
                    title={`${plan.errors.length} problem${plan.errors.length !== 1 ? "s" : ""} — fix the sheet and check again`}
                    issues={plan.errors}
                  />
                )}
                {plan.warnings.length > 0 && <IssueList tone="warning" title="Worth a look" issues={plan.warnings} />}

                {plan.changes.length === 0 && plan.errors.length === 0 ? (
                  <p className="flex items-center gap-2 text-sm text-gray-600">
                    <Check size={15} className="text-green-500" /> Nothing to change — the sheet matches the current access.
                  </p>
                ) : (
                  <ul className="divide-y divide-gray-100 border border-gray-200">
                    {plan.changes.map((c) => (
                      <li key={c.email} className="px-3 py-2 text-xs">
                        <p className="text-sm font-medium text-gray-900">
                          {c.email}
                          {Object.keys(c.tabs).length === 0 && <span className="ml-2 text-[11px] font-semibold text-red-600">loses all access</span>}
                        </p>
                        <div className="mt-1 space-y-0.5">
                          {c.lines.map((l, i) => (
                            <p
                              key={i}
                              className={l.kind === "add" ? "text-green-700" : l.kind === "remove" ? "text-red-600" : "text-gray-700"}
                            >
                              {l.kind === "add" ? "+ " : l.kind === "remove" ? "− " : "~ "}
                              {l.text}
                            </p>
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
              <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 hover:bg-gray-50">
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

function Summary({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className="border border-gray-200 px-3 py-2">
      <p className="text-[11px] text-gray-500">{label}</p>
      <p className={`text-lg font-bold tabular-nums ${warn ? "text-red-600" : "text-gray-900"}`}>{value}</p>
    </div>
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
