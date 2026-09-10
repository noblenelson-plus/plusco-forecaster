// components/forecaster/sections/labs-target-vs-booked-section.tsx
"use client";

/**
 * Labs "Target vs Booked by Partner" section for the Exec-KPI tab — the
 * senior-leadership deck view. Assembles the pieces from steps 1–3:
 *   - useLabsTargetVsBooked (hook) → rows / totals / tiles
 *   - three StatCard tiles: Total Media (I), Labs Share (J), Forecaster-only (K)
 *   - the LabsTargetVsBookedTable (cols A–H)
 *   - deal-type + partner filters
 *
 * Booked (F) and Total Media (I) are ANNUAL (full-year MIR) — not month-scoped —
 * matching how the deck figure is defined. The number reflects the latest MIR
 * sync, stamped in the header via useLastSync; Adriana's deck is one earlier
 * vintage of that same annual metric, which is why a live pull reads higher.
 *
 * Scope: year/RFQ from the forecast selection, GM pod from accessible clients.
 * scopedClientIds / currencyByClient / usdToCad come from the tab, same as the
 * sibling section. The deal-type filter flows through the hook (keeps tiles +
 * totals consistent); the partner filter is applied client-side.
 */

import { useMemo, useState } from "react";
import { DollarSign, PieChart, Percent } from "lucide-react";
import MultiSelectDropdown from "../../_shared/multi-select-dropdown";
import StatCard from "../../dashboard/charts/stat-card";
import { useForecastSelection } from "../../../lib/stores/forecast-selection.store";
import { useAccessibleClients } from "../../../lib/hooks/use-accessible-clients";
import { useLastSync } from "../../../lib/dashboard/data/use-last-sync";
import { useLabsTargetVsBooked } from "./use-labs-target-vs-booked";
import LabsTargetVsBookedTable from "./labs-target-vs-booked-table";
import { pacingMoney } from "./labs-pacing-data";
import {
  DECK_DEAL_TYPES,
  type LabsTargetVsBookedRow,
  type LabsTargetVsBookedTotals,
} from "./labs-target-vs-booked-data";
import {
  DEAL_TYPES,
  type DealType,
} from "../../../lib/types/partner-targets.types";
import type { Currency } from "../../../lib/types/client.types";

type Row = LabsTargetVsBookedRow;
type Totals = LabsTargetVsBookedTotals;

/** Shown when the last-sync doc isn't available yet. */
const MIR_AS_OF_FALLBACK = "latest sync";

/** Whole-percent tile value from a 0..1 fraction; null → "—". */
function pctTile(frac: number | null): string {
  return frac === null ? "—" : `${Math.round(frac * 100)}%`;
}

/** Recompute the grand-total row from the client-side (partner-filtered) rows. */
function recomputeTotals(rows: Row[]): Totals {
  let pluscoTarget = 0;
  let booked = 0;
  let rfq2 = 0;
  let rfq2Present = false;
  let bookedForRfq = 0; // booked only for rows that HAVE an RFQ2 target
  for (const r of rows) {
    pluscoTarget += r.pluscoTarget;
    booked += r.booked;
    if (r.rfq2Target !== null) {
      rfq2Present = true;
      rfq2 += r.rfq2Target;
      bookedForRfq += r.booked;
    }
  }
  const rfq2Target = rfq2Present ? rfq2 : null;
  return {
    pluscoTarget,
    rfq2Target,
    booked,
    pctOfPlusco: pluscoTarget > 0 ? booked / pluscoTarget : null,
    // % of RFQ measures forecaster partners only — non-forecaster rows have
    // booked but no RFQ target, so exclude their booked from the numerator.
    pctOfRfq: rfq2Target !== null && rfq2Target > 0 ? bookedForRfq / rfq2Target : null,
  };
}

export default function LabsTargetVsBookedSection({
  scopedClientIds,
  currencyByClient,
  usdToCad,
}: {
  scopedClientIds: string[];
  currencyByClient: Record<string, Currency>;
  usdToCad?: number;
}) {
    const { selectedYear } = useForecastSelection();
  const { clients } = useAccessibleClients();
  const lastSync = useLastSync();

  const gmPodByClient = useMemo(
    () => Object.fromEntries(clients.map((c) => [c.cl_id, c.GM_Pod || "—"])),
    [clients]
  );

  // Filters (annual view — booked + total media are full-year, no month scope).
  const [dealTypes, setDealTypes] = useState<string[]>(() => [...DECK_DEAL_TYPES]);
  const [partnerSel, setPartnerSel] = useState<string[]>([]);

  const dealTypeFilter = useMemo<DealType[]>(
    () => dealTypes as DealType[],
    [dealTypes]
  );

  const { rows, tiles, loading, unmatchedTargets, rosterPartners } =
    useLabsTargetVsBooked({
      year: selectedYear,
           rfq: "RFQ2",
      selMonths: [], // annual — whole year
      scopedClientIds,
      currencyByClient,
      gmPodByClient,
      usdToCad,
      dealTypeFilter,
    });

  // Partner options from the full Labs Targets roster (future-proof).
  const partnerOptions = useMemo(
    () => rosterPartners.map((p) => ({ value: p, label: p })),
    [rosterPartners]
  );

  const visibleRows = useMemo(
    () =>
      partnerSel.length > 0
        ? rows.filter((r) => partnerSel.includes(r.partner))
        : rows,
    [rows, partnerSel]
  );

  const visibleTotals = useMemo(() => recomputeTotals(visibleRows), [visibleRows]);

  const asOf = lastSync.labelShort ?? MIR_AS_OF_FALLBACK;

  const controls = (
    <div className="flex flex-wrap items-center gap-2">
      <MultiSelectDropdown
        label="Deal Type"
        options={DEAL_TYPES.map((d) => ({ value: d, label: d }))}
        selectedValues={dealTypes}
        onChange={setDealTypes}
      />
      <MultiSelectDropdown
        label="Partner"
        options={partnerOptions}
        selectedValues={partnerSel}
        onChange={setPartnerSel}
      />
    </div>
  );

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">
            Labs — Target vs Booked by Partner
          </h2>
          <p className="text-xs text-muted-foreground">
            PLUSCO vs RFQ2 targets · annual booked (MIR as of {asOf})
          </p>
        </div>
        {controls}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          icon={DollarSign}
          label="Total Media (MIR)"
          value={pacingMoney(tiles.totalMedia)}
          sub={`All channels except N/A · as of ${asOf}`}
        />
        <StatCard
          icon={PieChart}
          label="Labs Share of Media"
          value={pctTile(tiles.labsShareAll)}
          sub="All partners booked ÷ total media"
        />
        <StatCard
          icon={Percent}
          label="Labs Share of Media (Forecaster only)"
          value={pctTile(tiles.labsShareForecaster)}
          sub="Forecaster partners ÷ total media"
        />
      </div>

      <LabsTargetVsBookedTable
        rows={visibleRows}
        totals={visibleTotals}
        loading={loading}
      />

      {unmatchedTargets.length > 0 && (
        <p className="text-xs text-muted-foreground">
          No MIR booked matched for: {unmatchedTargets.join(", ")}.
        </p>
      )}
    </section>
  );
}