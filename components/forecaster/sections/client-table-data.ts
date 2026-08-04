// components/forecaster/sections/client-table-data.ts

/**
 * Builds one row per client for the Media/Labs detail table. Media metrics come
 * from data.mediaByClient, Labs from data.labsDetail, dimensions from the Client
 * record; variances join the same client in comparisonData. Digital/traditional
 * classification reuses data.media.byChannel so it matches the sections.
 * All ratios are per-client (that client's own numerator ÷ denominator).
 */

import type { ScopeForecastData } from "../../../lib/dashboard/data/use-scope-forecast-data";
import type { Client } from "../../../lib/types/client.types";
import type { MonthlyMap } from "../../../lib/types/common.types";

// Column order for the per-channel media metrics (matches the Looker table).
export const CHANNEL_ORDER = [
  "TV", "Radio", "OOH", "Print", "Digital Direct", "Programmatic", "Social", "SEM",
];

// Labs partner columns, in order. Billups combines its OOH + Print rows.
export const PARTNER_COLS: { key: string; label: string; names: string[] }[] = [
  { key: "billups", label: "Billups", names: ["billups-ooh", "billups-print"] },
  { key: "miqProg", label: "MIQ-Prog", names: ["miq-prog"] },
  { key: "miqSocial", label: "MIQ-Social", names: ["miq-social"] },
  { key: "amazon", label: "Amazon", names: ["amazon"] },
  { key: "yahoo", label: "Yahoo", names: ["yahoo"] },
  { key: "quantcast", label: "Quantcast", names: ["quantcast"] },
  { key: "reddit", label: "Reddit", names: ["reddit"] },
  { key: "stackadapt", label: "StackAdapt", names: ["stackadapt"] },
  { key: "aim", label: "AIM", names: ["aim"] },
];

const sumM = (m?: MonthlyMap) =>
  Object.values(m ?? {}).reduce((a, b) => a + (Number(b) || 0), 0);
const ratio = (a: number, b: number): number | null => (b > 0 ? a / b : null);

export interface ChannelCell { label: string; value: number }
export interface PartnerCell { label: string; primary: number; variance: number }

export interface ClientTableRow {
  clientId: string;
  name: string;
  tier: string;
  businessLead: string;
  agency: string;
  region: string;
  status: string;
  notes: string;
  // Forecasting-type toggles, surfaced as a hover on a $0 Media/Labs total.
  mediaForecast: boolean;
  labsForecast: boolean;
  // Media
  totalMedia: number;
  totalMediaVar: number;
  digitalMedia: number;
  digitalMediaVar: number;
  traditionalMedia: number;
  traditionalMediaVar: number;
  digitalShare: number | null;
  channels: ChannelCell[];
  // Labs
  totalLabs: number;
  labsVar: number;
  labsShareTotalMedia: number | null;
  billupsShareOfPrint: number | null;
  billupsShareOfOoh: number | null;
  partners: PartnerCell[];
  // Raw pieces needed to recompute weighted ratios in the summary row.
  billupsOohSpend: number;
  billupsPrintSpend: number;
  oohMedia: number;
  printMedia: number;
}

type ChannelMeta = { mediaType: string; label: string; digital: boolean }[];

interface MediaAgg {
  total: number;
  digital: number;
  traditional: number;
  byLabel: Map<string, number>;
}

function mediaAgg(byType: Record<string, MonthlyMap> | undefined, meta: ChannelMeta): MediaAgg {
  let total = 0, digital = 0, traditional = 0;
  const byLabel = new Map<string, number>();
  for (const m of meta) {
    const v = sumM(byType?.[m.mediaType]);
    byLabel.set(m.label, v);
    total += v;
    if (m.digital) digital += v;
    else traditional += v;
  }
  return { total, digital, traditional, byLabel };
}

// clientId → (partnerNameLower → annual total)
function labsByClient(details: ScopeForecastData["labsDetail"]): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  for (const d of details) {
    const inner = out.get(d.clientId) ?? new Map<string, number>();
    const key = d.partnerName.trim().toLowerCase();
    inner.set(key, (inner.get(key) ?? 0) + d.total);
    out.set(d.clientId, inner);
  }
  return out;
}

const partnerSum = (m: Map<string, number> | undefined, names: string[]) =>
  names.reduce((a, n) => a + (m?.get(n) ?? 0), 0);

export function computeClientTable(
  data: ScopeForecastData,
  comparisonData: ScopeForecastData,
  clients: Client[],
  usersMap: Map<string, string>,
  year: number,
  scopedClientIds: string[]
): ClientTableRow[] {
  const meta = data.media.byChannel.map((c) => ({
    mediaType: c.mediaType as unknown as string,
    label: c.label,
    digital: c.digital,
  }));
  const clientById = new Map(clients.map((c) => [c.cl_id, c]));

  const media = new Map(data.mediaByClient.map((mb) => [mb.clientId, mediaAgg(mb.byType, meta)]));
  const compMedia = new Map(comparisonData.mediaByClient.map((mb) => [mb.clientId, mediaAgg(mb.byType, meta)]));
  const labs = labsByClient(data.labsDetail);
  const compLabs = labsByClient(comparisonData.labsDetail);

  // Every in-scope client gets a row — including those with no spend ($0),
  // so the roster is complete (Adriana's "entire picture").
  const ids = scopedClientIds;

  const rows: ClientTableRow[] = [];
  for (const id of ids) {
    const client = clientById.get(id);
    const m = media.get(id) ?? { total: 0, digital: 0, traditional: 0, byLabel: new Map<string, number>() };
    const cm = compMedia.get(id);
    const lp = labs.get(id);
    const clp = compLabs.get(id);

    const totalLabs = lp ? [...lp.values()].reduce((a, b) => a + b, 0) : 0;
    const compTotalLabs = clp ? [...clp.values()].reduce((a, b) => a + b, 0) : 0;

    const billupsOoh = lp?.get("billups-ooh") ?? 0;
    const billupsPrint = lp?.get("billups-print") ?? 0;
    const oohMedia = m.byLabel.get("OOH") ?? 0;
    const printMedia = m.byLabel.get("Print") ?? 0;

    rows.push({
      clientId: id,
      name: client?.CL_Name ?? id,
      tier: client?.CL_Tier ?? "",
      businessLead: client?.CL_Business_Lead ? usersMap.get(client.CL_Business_Lead) ?? client.CL_Business_Lead : "",
      agency: client?.CL_Agency ?? "",
      region: client?.CL_Business_Unit_Region ?? "",
      status: client?.Client_Status_By_Year?.[year] ?? client?.Client_Status_2026 ?? "",
      notes: client?.Client_Notes ?? "",
      mediaForecast: client?.Forecasting_Type?.mediaSpend ?? false,
      labsForecast: client?.Forecasting_Type?.labs ?? false,

      totalMedia: m.total,
      totalMediaVar: m.total - (cm?.total ?? 0),
      digitalMedia: m.digital,
      digitalMediaVar: m.digital - (cm?.digital ?? 0),
      traditionalMedia: m.traditional,
      traditionalMediaVar: m.traditional - (cm?.traditional ?? 0),
      digitalShare: ratio(m.digital, m.total),
      channels: CHANNEL_ORDER.map((label) => ({ label, value: m.byLabel.get(label) ?? 0 })),

      totalLabs,
      labsVar: totalLabs - compTotalLabs,
      labsShareTotalMedia: ratio(totalLabs, m.total),
      billupsShareOfPrint: ratio(billupsPrint, printMedia),
      billupsShareOfOoh: ratio(billupsOoh, oohMedia),
      partners: PARTNER_COLS.map((p) => ({
        label: p.label,
        primary: partnerSum(lp, p.names),
        variance: partnerSum(lp, p.names) - partnerSum(clp, p.names),
      })),

      billupsOohSpend: billupsOoh,
      billupsPrintSpend: billupsPrint,
      oohMedia,
      printMedia,
    });
  }

  return rows.sort((a, b) => b.totalMedia - a.totalMedia);
}