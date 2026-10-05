// components/qa/data-health-panel.tsx
"use client";

/**
 * QA → Data Health: is what the dashboard shows up to date with BigQuery, and
 * does anything look off? Runs the checks in lib/qa/health-checks.ts against
 * the BigQuery snapshot captured at sync time. Layout, top to bottom:
 *   1. a yes/no verdict,
 *   2. "What to do" — one ordered to-do list merged from every failing check,
 *   3. a legend for the four statuses,
 *   4. the checks by group (problems always shown, passed checks folded away).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Info,
  Loader2,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { runDataHealthChecks, type HealthRun } from "../../lib/services/qa-health-service";
import {
  buildActionPlan,
  summarize,
  type CheckResult,
  type CheckStatus,
} from "../../lib/qa/health-checks";

const GROUPS: { id: CheckResult["group"]; question: string }[] = [
  { id: "Freshness", question: "Was every BigQuery table rebuilt from the latest MIR load?" },
  { id: "BigQuery parity", question: "Does the app hold exactly what BigQuery has?" },
  { id: "Data sanity", question: "Do the values the dashboard relies on look right?" },
  { id: "Cross-checks", question: "Do related numbers on different pages agree?" },
];

const STATUS: Record<
  CheckStatus,
  { label: string; meaning: string; chip: string; Icon: typeof CheckCircle2 }
> = {
  pass: {
    label: "Pass",
    meaning: "Matches BigQuery / looks right. Nothing to do.",
    chip: "bg-green-500 text-white",
    Icon: CheckCircle2,
  },
  warn: {
    label: "Check",
    meaning: "Differs for a known reason, explained on the card. No action unless that reason no longer applies.",
    chip: "bg-yellow-400 text-gray-900",
    Icon: AlertTriangle,
  },
  fail: {
    label: "Fail",
    meaning: "Out of date or wrong. Follow “What to do”.",
    chip: "bg-red-500 text-white",
    Icon: XCircle,
  },
  info: {
    label: "Info",
    meaning: "Context only — never a problem.",
    chip: "bg-blue-200 text-gray-900",
    Icon: Info,
  },
};

const fmtTime = (d: Date) => d.toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" });

function StatusChip({ status }: { status: CheckStatus }) {
  const s = STATUS[status];
  return (
    <span
      className={`inline-flex w-16 shrink-0 items-center justify-center gap-1 px-2 py-1 text-xs font-semibold ${s.chip}`}
    >
      <s.Icon size={13} />
      {s.label}
    </span>
  );
}

function CheckRow({ r }: { r: CheckResult }) {
  return (
    <li className="flex items-start gap-4 px-5 py-3">
      <StatusChip status={r.status} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-gray-900">{r.title}</div>
        <div className="text-sm text-gray-600">{r.detail}</div>
        {r.note && <div className="mt-1 text-xs text-gray-700">{r.note}</div>}
      </div>
    </li>
  );
}

export default function DataHealthPanel() {
  const [run, setRun] = useState<HealthRun | null>(null);
  const [running, setRunning] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());

  // Loads and runs every check; state is only set once the run settles.
  const load = useCallback(
    () =>
      runDataHealthChecks().then(
        (r) => {
          setRun(r);
          setError(null);
          setRunning(false);
        },
        (err) => {
          setError(err instanceof Error ? err.message : String(err));
          setRunning(false);
        }
      ),
    []
  );

  useEffect(() => {
    void load();
  }, [load]);

  const runAll = () => {
    setRunning(true);
    void load();
  };

  const counts = useMemo(() => (run ? summarize(run.results) : null), [run]);
  const plan = useMemo(() => (run ? buildActionPlan(run.results) : []), [run]);

  const toggleGroup = (id: string) =>
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="space-y-6">
      {/* Run bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-gray-600">
          {run
            ? `Last run ${fmtTime(run.ranAt)}`
            : "Running checks — this reads every synced table and takes about 30 seconds…"}
        </div>
        <button
          type="button"
          onClick={runAll}
          disabled={running}
          className="inline-flex items-center gap-2 bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-60"
        >
          {running ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
          {running ? "Running…" : "Run all checks"}
        </button>
      </div>

      {error && (
        <div className="bg-red-500 px-4 py-3 text-sm text-white">Couldn&apos;t run the checks: {error}</div>
      )}

      {!run && running && (
        <div className="flex h-40 items-center justify-center text-gray-400">
          <Loader2 size={20} className="animate-spin" />
        </div>
      )}

      {run && counts && (
        <>
          {/* 1. Verdict */}
          <div className={`px-6 py-5 text-white ${counts.fail ? "bg-red-500" : "bg-green-500"}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                {counts.fail ? <XCircle size={28} /> : <CheckCircle2 size={28} />}
                <div>
                  <div className="text-lg font-bold">
                    {counts.fail
                      ? `No — ${counts.fail} problem${counts.fail === 1 ? "" : "s"} found. Some numbers are out of date or wrong.`
                      : "Yes — the dashboard numbers are up to date with BigQuery."}
                  </div>
                  <div className="text-sm">
                    {counts.fail
                      ? "Follow the steps in “What to do” below."
                      : counts.warn
                      ? `Nothing to fix. ${counts.warn} known difference${counts.warn === 1 ? " is" : "s are"} explained below.`
                      : "Nothing to fix."}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 text-xs font-semibold">
                {(["pass", "warn", "fail", "info"] as const).map((s) => (
                  <span key={s} className="bg-white px-2 py-1 text-gray-900">
                    {counts[s]} {STATUS[s].label}
                  </span>
                ))}
              </div>
            </div>
            {run.fingerprintAt && (
              <p className="mt-3 border-t border-white pt-3 text-xs">
                Compared with BigQuery as of {fmtTime(new Date(run.fingerprintAt))} (taken by the last sync). If a
                BigQuery table was rebuilt after that, run{" "}
                <code className="font-semibold">node scripts/qa-fingerprint.mjs</code> first, then “Run all
                checks” — anything not yet in the app will show as Fail.
              </p>
            )}
          </div>

          {/* 2. What to do */}
          {plan.length > 0 && (
            <section className="border-2 border-red-500 bg-white">
              <header className="border-b border-gray-200 px-5 py-3">
                <h3 className="text-sm font-bold text-gray-900">What to do</h3>
                <p className="text-xs text-gray-500">One list covering every failed check, in the order to do it.</p>
              </header>
              <ol className="divide-y divide-gray-100">
                {plan.map((step, i) => (
                  <li key={step.title} className="flex gap-4 px-5 py-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center bg-gray-900 text-xs font-bold text-yellow-400">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="text-sm font-semibold text-gray-900">{step.title}</div>
                      {step.items.map((it) => (
                        <code key={it} className="block bg-gray-900 px-3 py-1.5 font-mono text-xs text-yellow-400">
                          {it}
                        </code>
                      ))}
                      {step.hint && <div className="text-xs text-gray-600">{step.hint}</div>}
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {/* 3. Legend */}
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {(["pass", "warn", "fail", "info"] as const).map((s) => (
              <div key={s} className="flex items-start gap-3 border border-gray-200 bg-white px-3 py-2">
                <StatusChip status={s} />
                <span className="text-xs text-gray-700">{STATUS[s].meaning}</span>
              </div>
            ))}
          </div>

          {/* 4. Checks by group — problems and info always shown; passes folded. */}
          {GROUPS.map((g) => {
            const rows = run.results.filter((r) => r.group === g.id);
            if (!rows.length) return null;
            const shown = rows.filter((r) => r.status !== "pass");
            const passed = rows.filter((r) => r.status === "pass");
            const c = summarize(rows);
            const open = openGroups.has(g.id);
            return (
              <section key={g.id} className="border border-gray-200 bg-white">
                <header className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-5 py-3">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">{g.id}</h3>
                    <p className="text-xs text-gray-500">{g.question}</p>
                  </div>
                  <span
                    className={`px-2 py-1 text-xs font-semibold ${
                      c.fail ? STATUS.fail.chip : c.warn ? STATUS.warn.chip : STATUS.pass.chip
                    }`}
                  >
                    {c.fail ? `${c.fail} failed` : c.warn ? `${c.warn} to check` : `All ${passed.length} passed`}
                  </span>
                </header>
                <ul className="divide-y divide-gray-100">
                  {shown.map((r) => (
                    <CheckRow key={r.id} r={r} />
                  ))}
                  {open && passed.map((r) => <CheckRow key={r.id} r={r} />)}
                </ul>
                {passed.length > 0 && (
                  <button
                    type="button"
                    onClick={() => toggleGroup(g.id)}
                    className="flex w-full items-center gap-1.5 border-t border-gray-100 px-5 py-2 text-left text-xs font-medium text-gray-600 hover:bg-gray-100"
                  >
                    {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    {open ? "Hide" : "Show"} {passed.length} passed check{passed.length === 1 ? "" : "s"}
                  </button>
                )}
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}
