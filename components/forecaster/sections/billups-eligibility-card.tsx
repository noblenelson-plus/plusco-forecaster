// filepath: components/forecaster/sections/billups-eligibility-card.tsx
"use client";

/**
 * Billups Eligibility — how many in-scope clients are eligible for Billups
 * OOH and Billups Print (Labs eligibility, set per client in the client
 * drawer; eligible unless opted out). One split bar per medium, styled like
 * the Meta Share Trend strip it sits beside on the Media & Labs KPIs page.
 *
 * Export writes the NON-eligible clients to a new Google Sheet, one tab per
 * medium, so leadership can follow up on the opt-outs.
 */

import type { BillupsEligibility } from "../../../lib/dashboard/data/use-billups-by-client";
import type { Client } from "../../../lib/types/client.types";
import SheetExportButton from "../../dashboard/sheet-export-button";
import type { CellValue } from "../table/table-export";

const MEDIA = [
  { key: "ooh", label: "OOH", tab: "Non-eligible OOH" },
  { key: "print", label: "Print", tab: "Non-eligible Print" },
] as const;

const EXPORT_HEADER = ["Client", "Client ID", "Agency", "Region", "GM Pod", "Business Lead"];

export default function BillupsEligibilityCard({
  clients,
  eligibilityById,
  missingPartners,
  year,
}: {
  /** The dashboard-scoped clients. */
  clients: Client[];
  eligibilityById: Map<string, BillupsEligibility>;
  /** Media whose Billups partner isn't set up for `year` (everyone counts as eligible). */
  missingPartners: ("ooh" | "print")[];
  year: number;
}) {
  const total = clients.length;
  const isEligible = (c: Client, key: "ooh" | "print") =>
    eligibilityById.get(c.cl_id)?.[key] ?? true;

  const rows = MEDIA.map((m) => {
    const notEligible = clients.filter((c) => !isEligible(c, m.key));
    const eligible = total - notEligible.length;
    return { ...m, eligible, notEligible };
  });

  const buildTabs = () =>
    rows.map((r) => ({
      sheetTitle: r.tab,
      matrix: [
        EXPORT_HEADER,
        ...[...r.notEligible]
          .sort((a, b) => a.CL_Name.localeCompare(b.CL_Name))
          .map((c): CellValue[] => [
            c.CL_Name,
            c.cl_id,
            c.CL_Agency ?? "",
            c.CL_Business_Unit_Region ?? "",
            c.GM_Pod ?? "",
            c.CL_Business_Lead ?? "",
          ]),
      ],
    }));

  const share = (n: number) => (total ? (n / total) * 100 : 0);

  return (
    <div className="flex flex-col rounded-lg border border-border bg-card p-4">
      <div className="mb-2 flex items-start justify-between gap-3">
        <p className="text-xs font-medium text-muted-foreground">
          Billups Eligibility · % of {total} client{total === 1 ? "" : "s"} ({year})
        </p>
        <SheetExportButton
          title={`Billups non-eligible clients — ${year}`}
          buildTabs={buildTabs}
          disabled={total === 0}
        />
      </div>

      {total === 0 ? (
        <p className="py-4 text-xs text-muted-foreground">No clients in scope.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => {
            const eligiblePct = share(r.eligible);
            return (
              <div key={r.key}>
                <div className="mb-1 flex items-baseline justify-between gap-3">
                  <span className="text-xs font-medium text-foreground">{r.label}</span>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {r.eligible} eligible ({eligiblePct.toFixed(0)}%) ·{" "}
                    {r.notEligible.length} not ({(100 - eligiblePct).toFixed(0)}%)
                  </span>
                </div>
                {/* Split bar: eligible | not eligible, together 100% of clients. */}
                <div className="flex h-2 overflow-hidden rounded bg-muted">
                  <div className="h-2 bg-green-500" style={{ width: `${eligiblePct}%` }} />
                  <div className="h-2 bg-red-500" style={{ width: `${100 - eligiblePct}%` }} />
                </div>
              </div>
            );
          })}

          <div className="flex items-center gap-4 pt-1 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 bg-green-500" /> Eligible
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 bg-red-500" /> Not eligible
            </span>
          </div>

          {missingPartners.length > 0 && (
            <p className="text-[11px] text-muted-foreground">
              No Billups-{missingPartners.map((k) => (k === "ooh" ? "OOH" : "Print")).join(" / Billups-")}{" "}
              partner set up for {year} (Admin → LABS) — every client counts as eligible.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
