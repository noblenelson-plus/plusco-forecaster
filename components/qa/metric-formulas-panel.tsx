// components/qa/metric-formulas-panel.tsx
"use client";

/**
 * QA → Metric Formulas: a quick-glance reference of how every dashboard number
 * is calculated. One page group at a time (left nav), one compact row per
 * metric (name · formula · basis); click a row for the details, source and
 * caveats. Search looks across every group. Content lives in
 * lib/qa/metric-definitions.ts — update it there whenever a calculation changes.
 */

import { useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, Search, X } from "lucide-react";
import { METRIC_GROUPS, type MetricDefinition } from "../../lib/qa/metric-definitions";

const BASIS_CHIP: Record<string, string> = {
  "MIR (booked)": "bg-blue-200 text-gray-900",
  "Forecaster (forecast)": "bg-purple-600 text-white",
  Targets: "bg-yellow-400 text-gray-900",
  Mixed: "bg-gray-200 text-gray-900",
};
const BASIS_SHORT: Record<string, string> = {
  "MIR (booked)": "MIR",
  "Forecaster (forecast)": "Forecast",
  Targets: "Targets",
  Mixed: "Mixed",
};

function BasisChip({ basis }: { basis: string }) {
  return (
    <span
      className={`inline-block whitespace-nowrap px-2 py-0.5 text-[11px] font-semibold ${
        BASIS_CHIP[basis] ?? BASIS_CHIP.Mixed
      }`}
      title={basis}
    >
      {BASIS_SHORT[basis] ?? basis}
    </span>
  );
}

function MetricRow({ m, open, onToggle }: { m: MetricDefinition; open: boolean; onToggle: () => void }) {
  return (
    <>
      <tr
        onClick={onToggle}
        className={`cursor-pointer border-t border-gray-100 align-top hover:bg-gray-100 ${open ? "bg-gray-100" : ""}`}
      >
        <td className="w-6 py-2.5 pl-4 text-gray-400">
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </td>
        <td className="py-2.5 pr-4 text-sm font-semibold text-gray-900">
          <span className="inline-flex items-center gap-1.5">
            {m.name}
            {m.notes && (
              <AlertTriangle size={13} className="shrink-0 text-yellow-500" aria-label="Has a caveat" />
            )}
          </span>
        </td>
        <td className="py-2.5 pr-4 font-mono text-xs text-gray-700">{m.formula}</td>
        <td className="py-2.5 pr-4 text-right">
          <BasisChip basis={m.basis} />
        </td>
      </tr>
      {open && (
        <tr className="bg-gray-100">
          <td />
          <td colSpan={3} className="space-y-2 pb-4 pr-4 text-sm">
            <p className="text-gray-800">{m.details}</p>
            <dl className="space-y-1 text-xs text-gray-600">
              <div>
                <dt className="inline font-semibold text-gray-800">Shown on: </dt>
                <dd className="inline">{m.where}</dd>
              </div>
              <div>
                <dt className="inline font-semibold text-gray-800">Source: </dt>
                <dd className="inline break-words">{m.source}</dd>
              </div>
            </dl>
            {m.notes && (
              <p className="flex gap-2 bg-yellow-400 px-3 py-2 text-xs text-gray-900">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                <span>{m.notes}</span>
              </p>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

export default function MetricFormulasPanel() {
  const [q, setQ] = useState("");
  const [groupId, setGroupId] = useState(METRIC_GROUPS[0]?.id ?? "");
  const [openKeys, setOpenKeys] = useState<Set<string>>(new Set());

  const needle = q.trim().toLowerCase();
  // Searching spans every group; otherwise show only the selected one.
  const groups = useMemo(() => {
    if (!needle) return METRIC_GROUPS.filter((g) => g.id === groupId);
    return METRIC_GROUPS.map((g) => ({
      ...g,
      metrics: g.metrics.filter((m) =>
        [m.name, m.where, m.formula, m.details, m.source, m.basis, m.notes ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(needle)
      ),
    })).filter((g) => g.metrics.length);
  }, [needle, groupId]);

  const toggle = (key: string) =>
    setOpenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const total = METRIC_GROUPS.reduce((a, g) => a + g.metrics.length, 0);

  return (
    <div className="space-y-4">
      {/* Search + legend */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex min-w-[260px] flex-1 items-center gap-2 border border-gray-200 bg-white px-3 py-2">
          <Search size={16} className="text-gray-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Search all ${total} metrics — a name, column or table…`}
            className="w-full bg-transparent text-sm outline-none"
          />
          {q && (
            <button type="button" onClick={() => setQ("")} aria-label="Clear search">
              <X size={14} className="text-gray-400" />
            </button>
          )}
        </label>
        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
          <BasisChip basis="MIR (booked)" /> booked in MediaOcean
          <BasisChip basis="Forecaster (forecast)" /> BL forecast
          <BasisChip basis="Targets" /> goals
          <BasisChip basis="Mixed" /> combines them
          <span className="inline-flex items-center gap-1">
            <AlertTriangle size={13} className="text-yellow-500" /> caveat — click to read
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        {/* Group nav */}
        <nav className="flex shrink-0 gap-1 overflow-x-auto lg:w-60 lg:flex-col">
          {METRIC_GROUPS.map((g) => {
            const active = !needle && g.id === groupId;
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => {
                  setGroupId(g.id);
                  setQ("");
                }}
                className={`flex shrink-0 items-center justify-between gap-3 px-3 py-2 text-left text-sm ${
                  active ? "bg-gray-900 font-semibold text-white" : "bg-white text-gray-700 hover:bg-gray-100"
                }`}
              >
                <span>{g.title}</span>
                <span className={`text-xs ${active ? "text-yellow-400" : "text-gray-400"}`}>
                  {g.metrics.length}
                </span>
              </button>
            );
          })}
        </nav>

        {/* Metrics */}
        <div className="min-w-0 flex-1 space-y-4">
          {groups.map((g) => (
            <section key={g.id} className="border border-gray-200 bg-white">
              <header className="border-b border-gray-200 px-4 py-3">
                <h3 className="text-sm font-semibold text-gray-900">{g.title}</h3>
                <p className="text-xs text-gray-500">{g.description}</p>
              </header>
              <table className="w-full table-fixed">
                <colgroup>
                  <col className="w-8" />
                  <col className="w-[28%]" />
                  <col />
                  <col className="w-24" />
                </colgroup>
                <thead>
                  <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                    <th />
                    <th className="py-2 pr-4">Metric</th>
                    <th className="py-2 pr-4">Formula</th>
                    <th className="py-2 pr-4 text-right">Basis</th>
                  </tr>
                </thead>
                <tbody>
                  {g.metrics.map((m) => {
                    const key = `${g.id}/${m.name}`;
                    return <MetricRow key={key} m={m} open={openKeys.has(key)} onToggle={() => toggle(key)} />;
                  })}
                </tbody>
              </table>
            </section>
          ))}
          {!groups.length && (
            <div className="border border-dashed border-gray-200 py-12 text-center text-sm text-gray-400">
              No metric matches &ldquo;{q}&rdquo;.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
