// components/forecaster/sections/labs-kpis.ts

/**
 * Pure computation of the Labs KPIs and partner rows from the scope data.
 * Ratios follow Adriana's definitions, summing partners by NAME (not by stored
 * media type) so the numerator lists match exactly. Billups is the only
 * OOH/Print partner. KPI variance is in percentage points vs the comparison.
 */

import type { ScopeForecastData } from "../../../lib/dashboard/data/use-scope-forecast-data";
import type { LabsPenetrationResult } from "../../../lib/format/labs-penetration";

// Palette for the by-partner pie (partners carry no color in the data).
export const PARTNER_PALETTE = [
  "#2E7D32", "#66BB6A", "#9CCC65", "#26A69A", "#29B6F6", "#5C6BC0",
  "#AB47BC", "#EC407A", "#FFA726", "#FFCA28", "#8D6E63", "#78909C",
];

// Adriana's PROG LABS numerator, by partner name (lower-cased for matching).
const PROG_LABS = ["miq-prog", "quantcast", "yahoo", "amazon", "aim", "stackadapt"];

type RatioKey =
  | "labsShareOfTotalMedia"
  | "billupsShareOohPrint"
  | "progLabsShareOfProg"
  | "progLabsShareOfDigital"
  | "billupsOohShareOfOoh"
  | "billupsPrintShareOfPrint";

const div = (a: number, b: number): number | null => (b > 0 ? a / b : null);

function partnerAnnualByName(labs: LabsPenetrationResult): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of labs.byType)
    for (const pt of t.partners) {
      const key = pt.name.trim().toLowerCase();
      m.set(key, (m.get(key) ?? 0) + pt.annual);
    }
  return m;
}

function ratioSet(d: ScopeForecastData): Record<RatioKey, number | null> {
  const byName = partnerAnnualByName(d.labs);
  const mediaByLabel = new Map(d.media.byChannel.map((c) => [c.label, c.annual]));
  const nameSum = (names: string[]) => names.reduce((a, n) => a + (byName.get(n) ?? 0), 0);

  const billupsOoh = byName.get("billups-ooh") ?? 0;
  const billupsPrint = byName.get("billups-print") ?? 0;
  const ooh = mediaByLabel.get("OOH") ?? 0;
  const print = mediaByLabel.get("Print") ?? 0;
  const prog = mediaByLabel.get("Programmatic") ?? 0;
  const progLabs = nameSum(PROG_LABS);

  return {
    labsShareOfTotalMedia: div(d.labs.totalLabs, d.media.totalAnnual),
    billupsShareOohPrint: div(billupsOoh + billupsPrint, ooh + print),
    progLabsShareOfProg: div(progLabs, prog),
    progLabsShareOfDigital: div(progLabs, d.media.digitalAnnual),
    billupsOohShareOfOoh: div(billupsOoh, ooh),
    billupsPrintShareOfPrint: div(billupsPrint, print),
  };
}

export interface LabsKpi {
  label: string;
  value: number | null; // a 0..1 ratio
  variancePts: number | null; // percentage-point difference vs comparison
}

export interface LabsPartnerRow {
  name: string;
  primary: number;
  variant: number;
  absolute: number;
  relative: number | null;
}

export interface LabsKpisResult {
  totalLabs: number;
  compTotalLabs: number;
  kpis: LabsKpi[];
  partners: LabsPartnerRow[];
  segments: { label: string; value: number; color: string }[];
}

export function computeLabsKpis(
  data: ScopeForecastData,
  comparisonData: ScopeForecastData
): LabsKpisResult {
  const hasComparison = comparisonData.hasContext;
  const p = ratioSet(data);
  const c = hasComparison ? ratioSet(comparisonData) : null;

  const kpi = (label: string, key: RatioKey): LabsKpi => ({
    label,
    value: p[key],
    variancePts: c && p[key] != null && c[key] != null ? (p[key]! - c[key]!) * 100 : null,
  });

  const kpis: LabsKpi[] = [
    kpi("LABS Share of Total Media", "labsShareOfTotalMedia"),
    kpi("Billups share of OOH + Print", "billupsShareOohPrint"),
    kpi("Prog LABS Share of Total Prog", "progLabsShareOfProg"),
    kpi("Prog Labs Share of Digital Media", "progLabsShareOfDigital"),
    kpi("% Billups-OOH share of OOH", "billupsOohShareOfOoh"),
    kpi("% Billups-Print share of Print", "billupsPrintShareOfPrint"),
  ];

  const flat = (labs: LabsPenetrationResult) =>
    labs.byType.flatMap((t) =>
      t.partners.map((pt) => ({ partnerId: pt.partnerId, name: pt.name, annual: pt.annual }))
    );

  const compMap = new Map(
    hasComparison ? flat(comparisonData.labs).map((pt) => [pt.partnerId, pt.annual]) : []
  );

  const partners: LabsPartnerRow[] = flat(data.labs)
    .filter((pt) => pt.annual > 0 || (compMap.get(pt.partnerId) ?? 0) > 0)
    .map((pt) => {
      const variant = compMap.get(pt.partnerId) ?? 0;
      const absolute = pt.annual - variant;
      return {
        name: pt.name,
        primary: pt.annual,
        variant,
        absolute,
        relative: variant > 0 ? (absolute / variant) * 100 : null,
      };
    })
    .sort((a, b) => b.primary - a.primary);

  const segments = partners.map((pt, i) => ({
    label: pt.name,
    value: pt.primary,
    color: PARTNER_PALETTE[i % PARTNER_PALETTE.length],
  }));

  return {
    totalLabs: data.labs.totalLabs,
    compTotalLabs: hasComparison ? comparisonData.labs.totalLabs : 0,
    kpis,
    partners,
    segments,
  };
}