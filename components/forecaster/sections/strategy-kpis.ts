// components/forecaster/sections/strategy-kpis.ts

/**
 * Investment Strategy KPIs (top band of the Looker Media & Labs report),
 * grouped into Shift to Programmatic / Meta Derisking / Labs Growth. Ratio
 * tiles carry a percentage-point delta vs the comparison; the one dollar tile
 * (MIQ-Social) carries a dollar delta. All values read from data.media /
 * data.labs — nothing new is fetched.
 */

import type { ScopeForecastData } from "../../../lib/dashboard/data/use-scope-forecast-data";

const div = (a: number, b: number): number | null => (b > 0 ? a / b : null);

function channelAnnual(data: ScopeForecastData, label: string): number {
  return data.media.byChannel.find((c) => c.label === label)?.annual ?? 0;
}

// Sum a Labs partner's scope spend by name (case-insensitive).
function partnerAnnual(data: ScopeForecastData, nameLower: string): number {
  let total = 0;
  for (const t of data.labs.byType)
    for (const p of t.partners)
      if (p.name.trim().toLowerCase() === nameLower) total += p.annual;
  return total;
}

// The Labs-Growth ratios (same definitions as the Labs section).
const PROG_LABS = ["miq-prog", "quantcast", "yahoo", "amazon", "aim", "stackadapt"];
function progLabsAnnual(data: ScopeForecastData): number {
  return PROG_LABS.reduce((a, n) => a + partnerAnnual(data, n), 0);
}

export interface StrategyTile {
  label: string;
  kind: "ratio" | "money";
  value: number | null; // ratio (0..1) or dollar amount
  delta: number | null; // ratio → percentage points; money → dollars
}

export interface StrategyGroup {
  title: string;
  tiles: StrategyTile[];
}

function ratioTiles(d: ScopeForecastData) {
  return {
    digitalDirectShareOfDigital: div(channelAnnual(d, "Digital Direct"), d.media.digitalAnnual),
    progShareOfDigital: div(channelAnnual(d, "Programmatic"), d.media.digitalAnnual),
    labsShareOfTotalMedia: div(d.labs.totalLabs, d.media.totalAnnual),
    progLabsShareOfProg: div(progLabsAnnual(d), channelAnnual(d, "Programmatic")),
    billupsOohShareOfOoh: div(partnerAnnual(d, "billups-ooh"), channelAnnual(d, "OOH")),
    billupsPrintShareOfPrint: div(partnerAnnual(d, "billups-print"), channelAnnual(d, "Print")),
  };
}

export function computeStrategyKpis(
  data: ScopeForecastData,
  comparisonData: ScopeForecastData
): StrategyGroup[] {
  const hasComparison = comparisonData.hasContext;
  const p = ratioTiles(data);
  const c = hasComparison ? ratioTiles(comparisonData) : null;

  const rTile = (label: string, key: keyof ReturnType<typeof ratioTiles>): StrategyTile => ({
    label,
    kind: "ratio",
    value: p[key],
    delta: c && p[key] != null && c[key] != null ? (p[key]! - c[key]!) * 100 : null,
  });

  const miqSocial = partnerAnnual(data, "miq-social");
  const miqSocialComp = hasComparison ? partnerAnnual(comparisonData, "miq-social") : 0;

  return [
    {
      title: "Shift to Programmatic",
      tiles: [
        rTile("Digital Direct share of Digital", "digitalDirectShareOfDigital"),
        rTile("Prog share of Digital", "progShareOfDigital"),
      ],
    },
    {
      title: "Meta Derisking",
      tiles: [
        {
          label: "MIQ-Social",
          kind: "money",
          value: miqSocial,
          delta: hasComparison ? miqSocial - miqSocialComp : null,
        },
      ],
    },
    {
      title: "Labs Growth",
      tiles: [
        rTile("LABS share of Total Media", "labsShareOfTotalMedia"),
        rTile("Prog Labs share of Prog", "progLabsShareOfProg"),
        rTile("Billups-OOH share of OOH", "billupsOohShareOfOoh"),
        rTile("Billups-Print share of Print", "billupsPrintShareOfPrint"),
      ],
    },
  ];
}