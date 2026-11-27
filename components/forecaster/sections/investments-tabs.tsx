// components/forecaster/sections/investments-tabs.tsx
"use client";

/**
 * Investments Team Dashboard — sub-tab container (its own top-level tab since
 * 2026-11-27; these pages used to sit under Exec KPI):
 *   Media YOY · PCC Deals (+ Deal Pacing) · Broadcast · Local Media ·
 *   Programmatic · Partner Data
 *
 * Local Media and Deal Pacing also stay on the Exec KPI Dashboard (same
 * components). Here, Deal Pacing sits under PCC Deals on one page (Noble).
 * Media YOY, PCC Deals, Broadcast and Local Media follow the Year and the
 * top-bar Months filter; Programmatic shows only to its named viewers (its data
 * is readable by them only).
 */

import { useState } from "react";
import LabsPacingPage from "./labs-pacing-page";
import LocalMediaSection from "./local-media-section";
import MediaYoySection from "./investments/media-yoy-section";
import PccDealsSection from "./investments/pcc-deals-section";
import BroadcastSection from "./investments/broadcast-section";
import ProgrammaticSubtab from "./investments/programmatic-subtab";
import PartnerDataSection from "./investments/partner-data-section";
import { useAuth } from "../../../lib/auth-context";
import { canViewProgrammaticPreview } from "../../../lib/programmatic/access";
import SubTabBar from "../sub-tab-bar";
import type { Client, Currency } from "../../../lib/types/client.types";
import {
  INVESTMENTS_SUBTABS,
  visibleSubtabs,
  type InvestmentsSubTab,
} from "../dashboard-pages.config";

const NO_HIDDEN: ReadonlySet<string> = new Set();

/** The sub-tabs that follow the top-bar Months filter. */
export const INVESTMENTS_MONTHS_SUBTABS: readonly InvestmentsSubTab[] = [
  "media-yoy",
  "pcc-deals",
  "broadcast",
  "local-media",
];

/** Visible sub-tabs: not hidden by an admin; Programmatic for its named viewers only. */
export function visibleInvestmentsSubtabs(hidden: ReadonlySet<string>, canSeeProgrammatic: boolean) {
  return visibleSubtabs("investments", INVESTMENTS_SUBTABS, hidden).filter(
    (t) => t.id !== "programmatic" || canSeeProgrammatic
  );
}

export default function InvestmentsTabs({
  clients,
  scopedClientIds,
  year,
  currencyByClient,
  usdToCad,
  hidden = NO_HIDDEN,
  sub: controlledSub,
  onSubChange,
  months,
  hasActiveFilters = false,
}: {
  clients: Client[];
  scopedClientIds: string[];
  year: number;
  currencyByClient: Record<string, Currency>;
  usdToCad?: number;
  /** Sub-tab page ids an admin hid (Admin → Dashboard Access). */
  hidden?: ReadonlySet<string>;
  /** The selected sub-tab, when the page owns it (for the top-bar Months filter). */
  sub?: InvestmentsSubTab;
  onSubChange?: (sub: InvestmentsSubTab) => void;
  /** The top-bar Months filter (1–12; empty = full year). */
  months?: readonly number[];
  /** A dashboard filter narrows the clients (non-Forecaster MIR clients are then left out). */
  hasActiveFilters?: boolean;
}) {
  const [ownSub, setOwnSub] = useState<InvestmentsSubTab>("media-yoy");
  const sub = controlledSub ?? ownSub;
  const setSub = (s: InvestmentsSubTab) => {
    setOwnSub(s);
    onSubChange?.(s);
  };
  const { user } = useAuth();
  const canSeeProgrammatic = canViewProgrammaticPreview(user?.email);
  const subtabs = visibleInvestmentsSubtabs(hidden, canSeeProgrammatic);
  // If an admin hid the chosen sub-tab, show the first visible one instead.
  const active = subtabs.some((t) => t.id === sub) ? sub : (subtabs[0]?.id ?? sub);
  const includeUnlinked = !hasActiveFilters;

  return (
    <div className="space-y-6">
      <SubTabBar tabs={subtabs} active={active} onSelect={setSub} />

      {active === "media-yoy" && (
        <MediaYoySection
          scopedClientIds={scopedClientIds}
          clients={clients}
          year={year}
          months={months}
          includeUnlinked={includeUnlinked}
        />
      )}

      {active === "pcc-deals" && (
        <div className="space-y-10">
          <PccDealsSection
            scopedClientIds={scopedClientIds}
            clients={clients}
            year={year}
            months={months}
            includeUnlinked={includeUnlinked}
          />
          {/* Deal Pacing (same page as Exec KPI → Deal Pacing), merged here under PCC Deals. */}
          <div className="space-y-4 border-t border-gray-200 pt-8">
            <h2 className="text-lg font-semibold text-gray-900">Deal Pacing</h2>
            <LabsPacingPage
              scopedClientIds={scopedClientIds}
              currencyByClient={currencyByClient}
              usdToCad={usdToCad}
              clientFiltered={hasActiveFilters}
            />
          </div>
        </div>
      )}

      {active === "broadcast" && (
        <BroadcastSection
          scopedClientIds={scopedClientIds}
          clients={clients}
          year={year}
          months={months}
          includeUnlinked={includeUnlinked}
        />
      )}

      {active === "local-media" && (
        <LocalMediaSection
          scopedClientIds={scopedClientIds}
          clients={clients}
          year={year}
          months={months}
          includeUnlinked={includeUnlinked}
        />
      )}

      {active === "programmatic" && canSeeProgrammatic && <ProgrammaticSubtab />}

      {active === "partner-data" && <PartnerDataSection />}
    </div>
  );
}
