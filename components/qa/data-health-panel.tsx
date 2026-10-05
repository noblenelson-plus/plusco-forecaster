// components/qa/data-health-panel.tsx
"use client";

/**
 * QA → Data Health: is what the dashboard shows up to date with BigQuery, and
 * does anything look off? Runs the checks in lib/qa/health-checks.ts against
 * the BigQuery fingerprint captured at sync time. "Run all checks" re-reads
 * Firestore and re-runs everything.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, Loader2, RefreshCw, XCircle } from "lucide-react";
import { runDataHealthChecks, type HealthRun } from "../../lib/services/qa-health-service";
import { summarize, type CheckResult, type CheckStatus } from "../../lib/qa/health-checks";

const GROUPS: CheckResult["group"][] = ["Freshness", "BigQuery parity", "Data sanity", "Cross-checks"];
const GROUP_HELP: Record<CheckResult["group"], string> = {
  Freshness: "Was every BigQuery table rebuilt from the latest MIR load?",
  "BigQuery parity": "Does the app hold exactly what BigQuery has (counts and $ totals)?",
  "Data sanity": "Values the dashboard relies on look right.",
  "Cross-checks": "Related numbers on different pages agree — or the known reason they differ.",
};

const STATUS_STYLE: Record<CheckStatus, { label: string; chip: string; Icon: typeof CheckCircle2 }> = {
  pass: { label: "Pass", chip: "bg-green-500 text-white", Icon: CheckCircle2 },
  warn: { label: "Check", chip: "bg-yellow-400 text-gray-900", Icon: AlertTriangle },
  fail: { label: "Fail", chip: "bg-red-500 text-white", Icon: XCircle },
  info: { label: "Info", chip: "bg-blue-200 text-gray-900", Icon: Info },
};

const fmtTime = (d: Date) =>
  d.toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" });

export default function DataHealthPanel() {
  const [run, setRun] = useState<HealthRun | null>(null);
  const [running, setRunning] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
  const verdict = !counts
    ? null
    : counts.fail
    ? { text: `${counts.fail} check${counts.fail === 1 ? "" : "s"} failed — some numbers may be out of date or wrong.`, cls: "bg-red-500 text-white" }
    : counts.warn
    ? { text: "All data matches BigQuery. A few items need a look (known differences are explained).", cls: "bg-yellow-400 text-gray-900" }
    : { text: "All data matches BigQuery — the numbers can be trusted.", cls: "bg-green-500 text-white" };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-gray-600">
          {run ? (
            <>
              Last run {fmtTime(run.ranAt)}
              {run.fingerprintAt && (
                <> · BigQuery snapshot from {fmtTime(new Date(run.fingerprintAt))}</>
              )}
            </>
          ) : (
            "Running checks — this reads every synced table and takes about 30 seconds…"
          )}
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

      {verdict && counts && (
        <div className={`flex flex-wrap items-center justify-between gap-3 px-5 py-4 ${verdict.cls}`}>
          <span className="text-base font-semibold">{verdict.text}</span>
          <span className="text-sm font-medium">
            {counts.pass} pass · {counts.warn} to check · {counts.fail} fail · {counts.info} info
          </span>
        </div>
      )}

      {!run && running && (
        <div className="flex h-40 items-center justify-center text-gray-400">
          <Loader2 size={20} className="animate-spin" />
        </div>
      )}

      {run &&
        GROUPS.map((g) => {
          const rows = run.results.filter((r) => r.group === g);
          if (!rows.length) return null;
          return (
            <section key={g} className="border border-gray-200 bg-white">
              <header className="border-b border-gray-200 px-5 py-3">
                <h3 className="text-sm font-semibold text-gray-900">{g}</h3>
                <p className="text-xs text-gray-500">{GROUP_HELP[g]}</p>
              </header>
              <ul className="divide-y divide-gray-100">
                {rows.map((r) => {
                  const s = STATUS_STYLE[r.status];
                  return (
                    <li key={r.id} className="flex items-start gap-4 px-5 py-3">
                      <span
                        className={`mt-0.5 inline-flex w-20 shrink-0 items-center justify-center gap-1 px-2 py-1 text-xs font-semibold ${s.chip}`}
                      >
                        <s.Icon size={13} />
                        {s.label}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-gray-900">{r.title}</div>
                        <div className="text-sm text-gray-600">{r.detail}</div>
                        {r.action && (
                          <div className="mt-1 text-xs font-medium text-gray-800">→ {r.action}</div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}

      <p className="text-xs text-gray-500">
        How it works: the app can&apos;t query BigQuery directly, so every <code>sync-all</code> run also
        records a fingerprint of the BigQuery tables (rebuild times, row counts and $ totals). These checks
        compare the data the dashboard reads against that fingerprint. To compare against BigQuery as it is
        right now, run <code>node scripts/qa-fingerprint.mjs</code> first, then &ldquo;Run all checks&rdquo;.
      </p>
    </div>
  );
}
