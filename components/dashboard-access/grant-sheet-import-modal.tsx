// components/dashboard-access/grant-sheet-import-modal.tsx
"use client";

/**
 * Admin → Dashboard Access → Import: paste the link of an edited access
 * report (Export), review every change, then apply. Two tabs are editable:
 *   - "Dashboard grants" (planGrantSheetImport): the sheet is the full list —
 *     people without rows lose their grants;
 *   - "Client access" (planTeamSheetImport): for every client in it, its BL /
 *     DL / collaborators become exactly its rows; clients without rows are
 *     left unchanged.
 * A single-tab grants sheet (older exports) still works. Errors in either tab
 * block the import; nothing is written before "Apply".
 */

import { useMemo, useState } from "react";
import { X, AlertTriangle, Loader2, FileSpreadsheet, Check, Info } from "lucide-react";
import type { Client } from "../../lib/types/client.types";
import type { DashboardGrantDoc, DashboardTabId } from "../../lib/types/access.types";
import {
  GrantSheetStructureError,
  planGrantSheetImport,
  type GrantSheetChange,
  type GrantSheetPlan,
} from "../../lib/format/grant-sheet";
import {
  TeamSheetStructureError,
  planTeamSheetImport,
  type TeamSheetChange,
  type TeamSheetPlan,
} from "../../lib/format/team-sheet";
import { describeSheetError, readLinkedWorkbook } from "../../lib/services/linked-sheet";
import { saveGrantsBatch } from "../../lib/services/dashboard-grants-service";
import { applyTeamSheetChanges } from "../../lib/services/team-access-service";

/** Tab names of the access report (Export) — keep in sync with the page. */
export const REPORT_TABS = {
  allAccess: "All access",
  summary: "Summary",
  grants: "Dashboard grants",
  clientAccess: "Client access",
  grantClients: "Grant clients",
} as const;

interface Plans {
  source: string;
  grants: GrantSheetPlan | null;
  team: TeamSheetPlan | null;
}

export default function GrantSheetImportModal({
  current,
  clients,
  userEmails,
  tabLabels,
  updatedBy,
  onClose,
  onApplied,
}: {
  current: DashboardGrantDoc[];
  clients: Client[];
  userEmails: ReadonlySet<string>;
  tabLabels: Record<DashboardTabId, string>;
  updatedBy: string;
  onClose: () => void;
  onApplied: (grantChanges: GrantSheetChange[], teamChanges: TeamSheetChange[]) => void;
}) {
  const [link, setLink] = useState("");
  const [checking, setChecking] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [plans, setPlans] = useState<Plans | null>(null);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState("");

  async function check() {
    setChecking(true);
    setProblems([]);
    try {
      // The first Google call opens the consent popup when there's no live token.
      const wb = await readLinkedWorkbook(link.trim(), [REPORT_TABS.grants, REPORT_TABS.clientAccess]);
      const grantsTable = wb.tabs[REPORT_TABS.grants];
      const teamTable = wb.tabs[REPORT_TABS.clientAccess];
      if (!grantsTable && !teamTable) {
        // An older single-tab grants export: the linked tab is the grants list.
        setPlans({
          source: `${wb.fileName} › ${wb.linked.title}`,
          grants: planGrantSheetImport(wb.linked.table, current, userEmails, tabLabels),
          team: null,
        });
      } else {
        setPlans({
          source: wb.fileName,
          grants: grantsTable ? planGrantSheetImport(grantsTable, current, userEmails, tabLabels) : null,
          team: teamTable ? planTeamSheetImport(teamTable, clients, userEmails) : null,
        });
      }
    } catch (err) {
      setProblems(
        err instanceof GrantSheetStructureError || err instanceof TeamSheetStructureError
          ? err.problems
          : [describeSheetError(err)]
      );
    } finally {
      setChecking(false);
    }
  }

  async function apply() {
    if (!plans) return;
    setApplying(true);
    setApplyError("");
    try {
      const g = plans.grants?.changes ?? [];
      const t = plans.team?.changes ?? [];
      if (g.length) await saveGrantsBatch(g.map((c) => ({ email: c.email, tabs: c.tabs })), updatedBy);
      if (t.length) await applyTeamSheetChanges(t);
      onApplied(g, t);
    } catch (err) {
      setApplyError("Import failed: " + (err instanceof Error ? err.message : "Unknown error"));
      setApplying(false);
    }
  }

  const g = plans?.grants;
  const tm = plans?.team;
  const totals = useMemo(() => {
    const t = { add: 0, change: 0, remove: 0, losesAll: 0, seatsAdded: 0, seatsRemoved: 0, leads: 0 };
    for (const c of g?.changes ?? []) {
      for (const l of c.lines) t[l.kind]++;
      if (Object.keys(c.tabs).length === 0) t.losesAll++;
    }
    for (const c of tm?.changes ?? []) {
      t.seatsAdded += c.added.length;
      t.seatsRemoved += c.removed.length;
      t.leads += Number(!!c.bl) + Number(!!c.dl);
    }
    return t;
  }, [g, tm]);

  const errorCount = (g?.errors.length ?? 0) + (tm?.errors.length ?? 0);
  const changeCount = (g?.changes.length ?? 0) + (tm?.changes.length ?? 0);
  const blocked = !plans || errorCount > 0 || changeCount === 0;

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
                <h2 className="text-base font-semibold text-gray-900">Import access</h2>
                <p className="text-xs text-gray-400 mt-0.5">{plans ? plans.source : "Nothing is saved until you apply the review."}</p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
              <X size={18} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            {!plans ? (
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
                    Start from <strong>Export</strong>. Two tabs are imported; the others (All access, Summary, Grant
                    clients) are a read-only report.
                  </li>
                  <li>
                    <strong>{REPORT_TABS.grants}</strong> — one row per person per tab; Agencies / Regions are{" "}
                    <strong>All</strong> (includes clients added later) or a list. It&apos;s the full list: anyone without
                    a row loses their grants.
                  </li>
                  <li>
                    <strong>{REPORT_TABS.clientAccess}</strong> — one row per person per client (Client ID, Role, Email).
                    For each client in it, its Business Lead, Digital Lead and collaborators become exactly its rows; GM
                    rows are read-only. Add a row with a Client ID to give someone that client.
                  </li>
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
                  <Summary label="Tabs given" value={totals.add} />
                  <Summary label="Tabs changed / removed" value={totals.change + totals.remove} warn={totals.remove > 0} />
                  <Summary label="Client seats + / −" value={`${totals.seatsAdded} / ${totals.seatsRemoved}`} warn={totals.seatsRemoved > 0} />
                  <Summary label="BL / DL changes" value={totals.leads} />
                </div>
                {totals.losesAll > 0 && (
                  <p className="text-xs font-semibold text-red-600">
                    {totals.losesAll} {totals.losesAll === 1 ? "person loses" : "people lose"} all their dashboard grants.
                  </p>
                )}

                {g && <PlanSection title={REPORT_TABS.grants} errors={g.errors} warnings={g.warnings} />}
                {tm && <PlanSection title={REPORT_TABS.clientAccess} errors={tm.errors} warnings={tm.warnings} />}

                {changeCount === 0 && errorCount === 0 ? (
                  <p className="flex items-center gap-2 text-sm text-gray-600">
                    <Check size={15} className="text-green-500" /> Nothing to change — the sheet matches the current access.
                  </p>
                ) : (
                  <ul className="divide-y divide-gray-100 border border-gray-200">
                    {(g?.changes ?? []).map((c) => (
                      <li key={"g" + c.email} className="px-3 py-2 text-xs">
                        <p className="text-sm font-medium text-gray-900">
                          {c.email} <span className="text-[11px] font-normal text-gray-400">dashboard grants</span>
                          {Object.keys(c.tabs).length === 0 && <span className="ml-2 text-[11px] font-semibold text-red-600">loses all grants</span>}
                        </p>
                        <div className="mt-1 space-y-0.5">
                          {c.lines.map((l, i) => (
                            <p key={i} className={l.kind === "add" ? "text-green-700" : l.kind === "remove" ? "text-red-600" : "text-gray-700"}>
                              {l.kind === "add" ? "+ " : l.kind === "remove" ? "− " : "~ "}
                              {l.text}
                            </p>
                          ))}
                        </div>
                      </li>
                    ))}
                    {(tm?.changes ?? []).map((c) => (
                      <li key={"t" + c.cl_id} className="px-3 py-2 text-xs">
                        <p className="text-sm font-medium text-gray-900">
                          {c.name} <span className="text-[11px] font-normal text-gray-400">{c.cl_id} · client team</span>
                        </p>
                        <div className="mt-1 space-y-0.5">
                          {c.bl && <p className="text-gray-700">Business Lead: {c.bl.before || "none"} → {c.bl.after || "none"}</p>}
                          {c.dl && <p className="text-gray-700">Digital Lead: {c.dl.before || "none"} → {c.dl.after || "none"}</p>}
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

          <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-3">
            {plans ? (
              <button
                onClick={() => {
                  setPlans(null);
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
              {plans ? (
                <button
                  onClick={() => void apply()}
                  disabled={blocked || applying}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-gray-900 hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {applying && <Loader2 size={14} className="animate-spin" />}
                  Apply {changeCount} change{changeCount !== 1 ? "s" : ""}
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

function PlanSection({
  title,
  errors,
  warnings,
}: {
  title: string;
  errors: { row: number | null; message: string }[];
  warnings: { row: number | null; message: string }[];
}) {
  return (
    <>
      {errors.length > 0 && (
        <IssueList tone="error" title={`${title}: ${errors.length} problem${errors.length !== 1 ? "s" : ""} — fix the sheet and check again`} issues={errors} />
      )}
      {warnings.length > 0 && <IssueList tone="warning" title={`${title}: worth a look`} issues={warnings} />}
    </>
  );
}

function Summary({ label, value, warn }: { label: string; value: number | string; warn?: boolean }) {
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
