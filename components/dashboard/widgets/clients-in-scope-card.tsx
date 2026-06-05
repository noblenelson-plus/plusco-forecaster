// components/dashboard/widgets/clients-in-scope-card.tsx
"use client";

/**
 * Demo widget — proves the scope wiring end to end: it reflects the filtered
 * client count and the active Year / RFQ context, updating live as filters or
 * the context change. Replace with real ratio cards / charts.
 */

import { Users } from "lucide-react";
import type { DashboardScope } from "../../../lib/dashboard/widgets/widget.types";

export default function ClientsInScopeCard({ scope }: { scope: DashboardScope }) {
  const { clientIds, year, rfq } = scope;

  return (
    <div className="flex h-full flex-col justify-between rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-2 text-sm font-medium text-gray-500">
        <Users size={16} className="text-yellow-500" />
        Clients in scope
      </div>

      <div className="my-4">
        <span className="text-4xl font-bold tabular-nums text-gray-900">
          {clientIds.length}
        </span>
        <span className="ml-2 text-sm text-gray-400">selected</span>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <ContextChip label="Year" value={year ? String(year) : "—"} />
        <ContextChip label="Submission" value={rfq?.type ?? "—"} />
      </div>
    </div>
  );
}

function ContextChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-gray-600">
      <span className="text-gray-400">{label}</span>
      <span className="font-semibold text-gray-800">{value}</span>
    </span>
  );
}
