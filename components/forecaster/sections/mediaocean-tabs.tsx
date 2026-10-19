// components/forecaster/sections/mediaocean-tabs.tsx
"use client";

/**
 * Media Investments Report (Mediaocean) — sub-tab container. Two sub-pages:
 *   KPIs Media and Labs · Media Investments
 *
 * "KPIs Media and Labs" is the same Investment Strategy KPIs page shown under
 * Executive KPIs — it is driven by the dashboard's global client filter, so it
 * takes `scopedClientIds`. "Media Investments" (Total Media Investment, Top
 * Partners, Social) is now also driven by the global filter + Time & Context, so
 * those sections take scopedClientIds / clients / year / selMonths (Social omits
 * year — it intrinsically compares 2025 vs 2026). Total Media Investment and
 * Top Partners follow the MIR From → To period (MirContextBar); the KPI
 * sections are a 2026 full-year snapshot.
 *
 * At the bottom of Media Investments, the Investment KPIs section repeats the
 * Exec KPI Dashboard's booked (MIR) scorecards + KPIs by Client table.
 *
 * Media Investments has a data switch: Mediaocean (booked, the sections above)
 * or MediaBox (planned budgets — MediaboxPlannerTab: the same charts over the
 * MediaBox finance table, plus a by-status view). Same period, client filter
 * and access; the KPIs sub-tab stays Mediaocean-only.
 *
 * The active sub-tab and data source are controlled by the parent (page.tsx)
 * so the parent can show the global filter bar on both sub-pages and the
 * matching "as of" stamp on the period bar.
 */

import InvestmentKpisSection from "./investment-kpis-section";
import MediaoceanInvestmentSection from "./mediaocean-investment-section";
import MediaoceanTopPartnersSection from "./mediaocean-top-partners-section";
import MediaoceanSocialSection from "./mediaocean-social-section";
import InvestmentKpisBookedSection from "./investment-kpis-booked-section";
import MediaboxPlannerTab from "./mediabox-planner-tab";
import SubTabBar from "../sub-tab-bar";
import { monthsWithinOneYear, type MonthPeriod } from "../../../lib/format/period";
import type { Client } from "../../../lib/types/client.types";
import {
  MEDIAOCEAN_SUBTABS,
  visibleSubtabs,
  type MediaOceanSubTab,
} from "../dashboard-pages.config";

export type { MediaOceanSubTab };

/** Whose data Media Investments shows: Mediaocean (booked) or MediaBox (planned). */
export type MediaOceanSource = "mediaocean" | "mediabox";

const SOURCES: { id: MediaOceanSource; label: string; hint: string }[] = [
  { id: "mediaocean", label: "Mediaocean", hint: "Booked (MIR) spend" },
  { id: "mediabox", label: "MediaBox Planner", hint: "Planned net budgets from MediaBox" },
];

const NO_HIDDEN: ReadonlySet<string> = new Set();

/** The Mediaocean | MediaBox Planner switch (styled like the CAD / USD toggle). */
function SourceSwitch({
  value,
  onChange,
}: {
  value: MediaOceanSource;
  onChange: (s: MediaOceanSource) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Data</span>
      <div className="inline-flex overflow-hidden rounded-lg border border-border text-xs font-semibold" role="group">
        {SOURCES.map((s) => (
          <button
            key={s.id}
            type="button"
            title={s.hint}
            aria-pressed={value === s.id}
            onClick={() => onChange(s.id)}
            className={`px-3 py-1.5 transition-colors ${
              value === s.id ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * The year the KPI sections cover. KPI_BY_CLIENT is built per year in BigQuery
 * (its columns are *_2026), so these sections are a full-year snapshot and
 * don't follow the MIR period picker. Bump with the KPI table's year.
 */
const KPI_DATA_YEAR = 2026;

export default function MediaOceanTabs({
  sub,
  onSubChange,
  source,
  onSourceChange,
  scopedClientIds,
  clients,
  period,
  hidden = NO_HIDDEN,
}: {
  sub: MediaOceanSubTab;
  onSubChange: (s: MediaOceanSubTab) => void;
  /** Media Investments' data: Mediaocean (booked) or MediaBox (planned). */
  source: MediaOceanSource;
  onSourceChange: (s: MediaOceanSource) => void;
  scopedClientIds: string[];
  clients: Client[];
  /** The MIR From → To period (MIR context bar). */
  period: MonthPeriod;
  /** Sub-tab page ids an admin hid (Admin → Dashboard Access). */
  hidden?: ReadonlySet<string>;
}) {
  const subtabs = visibleSubtabs("mediaocean", MEDIAOCEAN_SUBTABS, hidden);
  // If an admin hid the chosen sub-tab, show the first visible one instead.
  const active = subtabs.some((t) => t.id === sub) ? sub : (subtabs[0]?.id ?? sub);

  return (
    <div className="space-y-6">
      <SubTabBar tabs={subtabs} active={active} onSelect={onSubChange} />

      {/* Active sub-page */}
      {active === "kpis" && (
        <InvestmentKpisSection scopedClientIds={scopedClientIds} />
      )}

      {active === "investments" && <SourceSwitch value={source} onChange={onSourceChange} />}

      {active === "investments" && source === "mediabox" && (
        <MediaboxPlannerTab scopedClientIds={scopedClientIds} period={period} />
      )}

      {active === "investments" && source === "mediaocean" && (
        <div className="space-y-10">
          <MediaoceanInvestmentSection
            scopedClientIds={scopedClientIds}
            clients={clients}
            period={period}
          />
          <MediaoceanTopPartnersSection
            scopedClientIds={scopedClientIds}
            clients={clients}
            period={period}
          />
          {/* Fixed 2025 vs 2026 view: only the period's months apply, when
              the period sits inside one year (else the full years). */}
          <MediaoceanSocialSection
            scopedClientIds={scopedClientIds}
            clients={clients}
            selMonths={monthsWithinOneYear(period)}
          />
          {/* Booked (MIR) Exec KPIs: scorecards + by-client table (full year). */}
          <InvestmentKpisBookedSection
            scopedClientIds={scopedClientIds}
            year={KPI_DATA_YEAR}
            fullYearLabel
          />
        </div>
      )}
    </div>
  );
}
