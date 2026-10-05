// components/qa/metric-formulas-panel.tsx
"use client";

/**
 * QA → Metric Formulas: a reference of how every dashboard number is
 * calculated, grouped by page. Content lives in lib/qa/metric-definitions.ts —
 * update it there whenever a calculation changes.
 */

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { METRIC_GROUPS } from "../../lib/qa/metric-definitions";

export default function MetricFormulasPanel() {
  const [q, setQ] = useState("");
  const [groupId, setGroupId] = useState<string>("all");

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return METRIC_GROUPS.filter((g) => groupId === "all" || g.id === groupId)
      .map((g) => ({
        ...g,
        metrics: needle
          ? g.metrics.filter((m) =>
              [m.name, m.where, m.formula, m.details, m.source, m.basis, m.notes ?? ""]
                .join(" ")
                .toLowerCase()
                .includes(needle)
            )
          : g.metrics,
      }))
      .filter((g) => g.metrics.length);
  }, [q, groupId]);

  const total = groups.reduce((a, g) => a + g.metrics.length, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex min-w-[260px] flex-1 items-center gap-2 border border-gray-200 bg-white px-3 py-2">
          <Search size={16} className="text-gray-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search a metric, column or table…"
            className="w-full bg-transparent text-sm outline-none"
          />
        </label>
        <select
          value={groupId}
          onChange={(e) => setGroupId(e.target.value)}
          className="border border-gray-200 bg-white px-3 py-2 text-sm"
        >
          <option value="all">All pages</option>
          {METRIC_GROUPS.map((g) => (
            <option key={g.id} value={g.id}>
              {g.title}
            </option>
          ))}
        </select>
        <span className="text-sm text-gray-500">{total} metrics</span>
      </div>

      {groups.map((g) => (
        <section key={g.id} className="border border-gray-200 bg-white">
          <header className="border-b border-gray-200 px-5 py-3">
            <h3 className="text-sm font-semibold text-gray-900">{g.title}</h3>
            <p className="text-xs text-gray-500">{g.description}</p>
          </header>
          <div className="divide-y divide-gray-100">
            {g.metrics.map((m) => (
              <article key={`${g.id}-${m.name}`} className="space-y-2 px-5 py-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h4 className="text-sm font-semibold text-gray-900">{m.name}</h4>
                  <span className="text-xs text-gray-500">{m.where}</span>
                </div>
                <code className="block whitespace-pre-wrap bg-gray-900 px-3 py-2 font-mono text-xs text-yellow-400">
                  {m.formula}
                </code>
                <p className="text-sm text-gray-700">{m.details}</p>
                <dl className="grid gap-x-6 gap-y-1 text-xs text-gray-600 sm:grid-cols-2">
                  <div>
                    <dt className="inline font-semibold text-gray-800">Source: </dt>
                    <dd className="inline">{m.source}</dd>
                  </div>
                  <div>
                    <dt className="inline font-semibold text-gray-800">Basis: </dt>
                    <dd className="inline">{m.basis}</dd>
                  </div>
                </dl>
                {m.notes && (
                  <p className="bg-yellow-400 px-3 py-2 text-xs text-gray-900">{m.notes}</p>
                )}
              </article>
            ))}
          </div>
        </section>
      ))}

      {!groups.length && (
        <div className="border border-dashed border-gray-200 py-12 text-center text-sm text-gray-400">
          No metric matches &ldquo;{q}&rdquo;.
        </div>
      )}
    </div>
  );
}
