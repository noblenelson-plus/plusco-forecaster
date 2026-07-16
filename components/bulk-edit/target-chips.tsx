// components/bulk-edit/target-chips.tsx
"use client";

/**
 * Grouped preview of bulk-operation targets. A flat chip per
 * client × submission × axis × section doesn't scale (imports easily touch
 * hundreds of targets), so targets are rolled up into one row per
 * submission × axis × section — "RFQ0-2026 · Media BL · 132 clients" — each
 * expandable to list its clients. Section colors match the grid's sources:
 * BL Input yellow, Revenue GAIA purple, Media/Labs MediaOcean orange.
 */

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Users } from "lucide-react";
import type { AxisId } from "../../lib/types/forecaster.types";
import { RFQ_TYPE_ORDER } from "../../lib/types/rfq.types";
import type { BulkTarget } from "../../lib/services/bulk-import-service";

const AXIS_LABELS: Record<AxisId, string> = {
  media: "Media",
  labs: "Labs",
  revenue: "Revenue",
};

const AXIS_RANK: Record<AxisId, number> = { media: 0, labs: 1, revenue: 2 };

interface TargetGroup {
  key: string;
  year: number;
  rfq: BulkTarget["rfq"];
  axisId: AxisId;
  section: BulkTarget["section"];
  clientNames: string[];
}

function badgeClasses(g: TargetGroup): string {
  if (g.section === "BL")
    return "bg-yellow-100 text-yellow-900 border-yellow-200";
  return g.axisId === "revenue"
    ? "bg-purple-100 text-purple-800 border-purple-200"
    : "bg-orange-100 text-orange-800 border-orange-200";
}

function sectionLabel(g: TargetGroup): string {
  if (g.section === "BL") return "BL Input";
  return g.axisId === "revenue" ? "GAIA" : "MediaOcean";
}

export default function TargetChips({ targets }: { targets: BulkTarget[] }) {
  const groups = useMemo<TargetGroup[]>(() => {
    const map = new Map<string, TargetGroup>();
    for (const t of targets) {
      const key = `${t.year}|${t.rfq ?? "annual"}|${t.axisId}|${t.section}`;
      let g = map.get(key);
      if (!g) {
        g = {
          key,
          year: t.year,
          rfq: t.rfq,
          axisId: t.axisId,
          section: t.section,
          clientNames: [],
        };
        map.set(key, g);
      }
      g.clientNames.push(t.clientName);
    }
    const list = [...map.values()];
    for (const g of list) g.clientNames.sort((a, b) => a.localeCompare(b));
    return list.sort(
      (a, b) =>
        a.year - b.year ||
        (a.rfq ? RFQ_TYPE_ORDER[a.rfq] : -1) - (b.rfq ? RFQ_TYPE_ORDER[b.rfq] : -1) ||
        AXIS_RANK[a.axisId] - AXIS_RANK[b.axisId] ||
        (a.section === "BL" ? 0 : 1) - (b.section === "BL" ? 0 : 1)
    );
  }, [targets]);

  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  if (groups.length === 0) return null;

  return (
    <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
      {groups.map((g) => {
        const open = expanded.has(g.key);
        return (
          <div key={g.key}>
            <button
              type="button"
              onClick={() => toggle(g.key)}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-gray-50"
            >
              {open ? (
                <ChevronDown size={14} className="flex-shrink-0 text-gray-400" />
              ) : (
                <ChevronRight size={14} className="flex-shrink-0 text-gray-400" />
              )}
              <span className="w-28 flex-shrink-0 text-sm font-semibold tabular-nums text-gray-900">
                {g.rfq ? `${g.rfq}-${g.year}` : `${g.year} · annual`}
              </span>
              <span
                className={`inline-flex flex-shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${badgeClasses(g)}`}
              >
                {AXIS_LABELS[g.axisId]} · {sectionLabel(g)}
              </span>
              <span className="ml-auto flex flex-shrink-0 items-center gap-1.5 text-xs text-gray-500 tabular-nums">
                <Users size={12} />
                {g.clientNames.length} client{g.clientNames.length !== 1 ? "s" : ""}
              </span>
            </button>
            {open && (
              <div className="mx-9 mb-2.5 max-h-48 overflow-y-auto rounded-lg border border-gray-100 bg-gray-50/60">
                <ul className="divide-y divide-gray-100">
                  {g.clientNames.map((name, i) => (
                    <li
                      key={`${name}-${i}`}
                      className="px-3 py-1.5 text-xs text-gray-700"
                    >
                      {name}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
