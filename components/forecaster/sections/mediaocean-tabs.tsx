// components/forecaster/sections/mediaocean-tabs.tsx
"use client";

/**
 * MediaOcean — sub-tab container. Splits the MediaOcean tab into two sub-pages:
 *   KPIs Media and Labs · Media Investments
 *
 * "KPIs Media and Labs" is the same Investment Strategy KPIs page shown under
 * Executive KPIs — it is driven by the dashboard's global client filter, so it
 * takes `scopedClientIds`. "Media Investments" (Total Media Investment, Top
 * Partners, Social) is now also driven by the global filter + Time & Context, so
 * those sections take scopedClientIds / clients / year / selMonths (Social omits
 * year — it intrinsically compares 2025 vs 2026).
 *
 * The active sub-tab is controlled by the parent (page.tsx) so the parent can
 * show the global filter bar on both sub-pages.
 */

import InvestmentKpisSection from "./investment-kpis-section";
import MediaoceanInvestmentSection from "./mediaocean-investment-section";
import MediaoceanTopPartnersSection from "./mediaocean-top-partners-section";
import MediaoceanSocialSection from "./mediaocean-social-section";
import type { Client } from "../../../lib/types/client.types";
import {
  MEDIAOCEAN_SUBTABS,
  visibleSubtabs,
  type MediaOceanSubTab,
} from "../dashboard-pages.config";

export type { MediaOceanSubTab };

const NO_HIDDEN: ReadonlySet<string> = new Set();

export default function MediaOceanTabs({
  sub,
  onSubChange,
  scopedClientIds,
  clients,
  year,
  selMonths,
  hidden = NO_HIDDEN,
}: {
  sub: MediaOceanSubTab;
  onSubChange: (s: MediaOceanSubTab) => void;
  scopedClientIds: string[];
  clients: Client[];
  year: number;
  selMonths: number[];
  /** Page ids hidden by an admin (Admin → Dashboard Pages). */
  hidden?: ReadonlySet<string>;
}) {
  const subtabs = visibleSubtabs("mediaocean", MEDIAOCEAN_SUBTABS, hidden);
  // If an admin hid the chosen sub-tab, show the first visible one instead.
  const active = subtabs.some((t) => t.id === sub) ? sub : (subtabs[0]?.id ?? sub);

  return (
    <div className="space-y-6">
      {/* Sub-tab bar — matches the Executive KPIs sub-tab strip. */}
      <div className="flex items-center gap-1 border-b border-gray-200 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {subtabs.map((t) => {
          const isActive = active === t.id;
          return (
            <button
              key={t.id}
              onClick={() => onSubChange(t.id)}
              className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? "border-primary text-gray-900"
                  : "border-transparent text-gray-500 hover:text-gray-800"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Active sub-page */}
      {active === "kpis" && (
        <InvestmentKpisSection scopedClientIds={scopedClientIds} />
      )}

      {active === "investments" && (
        <div className="space-y-10">
          <MediaoceanInvestmentSection
            scopedClientIds={scopedClientIds}
            clients={clients}
            year={year}
            selMonths={selMonths}
          />
          <MediaoceanTopPartnersSection
            scopedClientIds={scopedClientIds}
            clients={clients}
            year={year}
            selMonths={selMonths}
          />
          <MediaoceanSocialSection
            scopedClientIds={scopedClientIds}
            clients={clients}
            selMonths={selMonths}
          />
        </div>
      )}
    </div>
  );
}
