// filepath: data-prep/build-staffing-data.mjs

/**
 * Finance Toolkit — Staffing data prep.
 *
 *   node data-prep/build-staffing-data.mjs
 *
 * Reads media investment (MediaOcean) and campaign complexity (MediaBox) per
 * Forecaster client from the BigQuery table functions
 * Finance_Toolkit.staffing_investment / staffing_complexity, for the last 12
 * months of the hours data (so spend and hours cover the same months), and
 * writes lib/server/staffing-data.ts. Only client-level aggregates are written:
 * no people, no rows.
 *
 * Auth: Application Default Credentials (`gcloud auth application-default login`).
 * Run build-finance-toolkit-data.mjs first when the hours change: the window is
 * read from its output.
 */

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const HOURS_TS = join(HERE, "..", "lib", "server", "finance-toolkit-data.ts");
const OUT_TS = join(HERE, "..", "lib", "server", "staffing-data.ts");
const BILLING_PROJECT = "pluscoops";
const LOCATION = "northamerica-northeast1";
const FT = "`plusco-media-invest-solutions.Finance_Toolkit`";

// ─── Window: the last 12 months of the hours data ────────────────────────────

const hoursSrc = readFileSync(HOURS_TS, "utf8");
const monthsLine = hoursSrc.match(/^\s*months: (\[.*?\]),$/m);
if (!monthsLine) throw new Error("Could not read `months` from " + HOURS_TS);
const months = JSON.parse(monthsLine[1]);
const to = months[months.length - 1];
const from = months[Math.max(0, months.length - 12)];
console.log(`Staffing window: ${from} – ${to} (last 12 months of the hours data)`);

// ─── BigQuery (REST, ADC token) ──────────────────────────────────────────────

const token = execSync("gcloud auth application-default print-access-token", { encoding: "utf8" }).trim();

async function bq(query) {
  const base = `https://bigquery.googleapis.com/bigquery/v2/projects/${BILLING_PROJECT}`;
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  let res = await fetch(`${base}/queries`, {
    method: "POST",
    headers,
    body: JSON.stringify({ query, useLegacySql: false, location: LOCATION, timeoutMs: 60000, maxResults: 10000 }),
  }).then((r) => r.json());
  if (res.error) throw new Error(res.error.message);
  const jobId = res.jobReference.jobId;
  const rows = [];
  let page = res;
  for (;;) {
    if (!page.jobComplete) {
      await new Promise((r) => setTimeout(r, 1500));
    } else {
      rows.push(...(page.rows ?? []));
      if (!page.pageToken) break;
    }
    const qs = new URLSearchParams({ location: LOCATION, timeoutMs: "60000", maxResults: "10000" });
    if (page.pageToken) qs.set("pageToken", page.pageToken);
    page = await fetch(`${base}/queries/${jobId}?${qs}`, { headers }).then((r) => r.json());
    if (page.error) throw new Error(page.error.message);
  }
  const fields = (res.schema ?? page.schema).fields.map((f) => f.name);
  return rows.map((r) => Object.fromEntries(r.f.map((c, i) => [fields[i], c.v])));
}

const num = (v) => (v === null || v === undefined ? 0 : Number(v));
const numOrNull = (v) => (v === null || v === undefined ? null : Number(v));

// ─── Queries ─────────────────────────────────────────────────────────────────

const inv = await bq(`SELECT * FROM ${FT}.staffing_investment('${from}', '${to}')`);
const cx = await bq(`SELECT * FROM ${FT}.staffing_complexity('${from}', '${to}') WHERE channel = 'All channels'`);
const gaiaRows = await bq(`
  SELECT client_id, ARRAY_TO_STRING(ARRAY_AGG(DISTINCT n), ',') AS gaia
  FROM \`pluscoops.forecaster_1.clients\`, UNNEST(REGEXP_EXTRACT_ALL(CAST(gaia_number AS STRING), r'\\d{5,}')) AS n
  GROUP BY client_id`);

const gaiaById = new Map(gaiaRows.map((r) => [r.client_id, r.gaia ? r.gaia.split(",") : []]));
const cxById = new Map(cx.map((r) => [r.client_id, r]));
const channelsById = new Map();
for (const r of inv) {
  if (r.channel === "All channels") continue;
  if (!channelsById.has(r.client_id)) channelsById.set(r.client_id, []);
  channelsById.get(r.client_id).push([r.channel, Math.round(num(r.spend_cad)), num(r.pct_spend_in_mediabox)]);
}

let spendNotInForecaster = 0;
const clients = [];
for (const r of inv) {
  if (r.channel !== "All channels") continue;
  if (r.in_forecaster !== "true") {
    spendNotInForecaster += num(r.spend_cad);
    continue;
  }
  const c = cxById.get(r.client_id);
  clients.push({
    id: r.client_id,
    name: r.client_name ?? r.client_id,
    agency: r.agency ?? "",
    region: r.bu_region ?? "",
    gmPod: r.gm_pod ?? "",
    gaia: gaiaById.get(r.client_id) ?? [],
    spend: Math.round(num(r.spend_cad)),
    digitalSpend: Math.round(num(r.digital_spend_cad)),
    annualizedSpend: Math.round(num(r.annualized_spend_cad)),
    isNew: r.is_new_client === "true",
    firstMonth: r.first_active_month ?? null,
    channels: (channelsById.get(r.client_id) ?? []).sort((a, b) => b[1] - a[1]),
    mcpeCount: num(r.mcpe_count),
    estimateCount: num(r.estimate_count),
    vendorCount: num(r.vendor_count),
    mediaboxShare: num(r.pct_spend_in_mediabox),
    complexity: c
      ? {
          campaigns: num(c.mb_campaigns),
          tactics: num(c.mb_tactics),
          publishers: num(c.publishers),
          audiences: num(c.audiences),
          markets: num(c.markets),
          languages: num(c.languages),
          linesOfBusiness: num(c.lines_of_business),
          funnelStages: num(c.funnel_stages),
          brandKpiShare: numOrNull(c.pct_tactics_brand_kpi),
        }
      : null,
  });
}
clients.sort((a, b) => b.spend - a.spend);

// ─── Checks ──────────────────────────────────────────────────────────────────

const totalAll = inv.filter((r) => r.channel === "All channels").reduce((a, r) => a + num(r.spend_cad), 0);
const totalChannels = inv.filter((r) => r.channel !== "All channels").reduce((a, r) => a + num(r.spend_cad), 0);
if (Math.abs(totalAll - totalChannels) > 1) throw new Error(`Channel rows (${totalChannels}) do not add up to client rows (${totalAll})`);
const kept = clients.reduce((a, c) => a + c.spend, 0);
console.log(
  `Spend ${(totalAll / 1e6).toFixed(1)}M across ${clients.length} Forecaster clients (${(kept / 1e6).toFixed(1)}M); ` +
    `${(spendNotInForecaster / 1e6).toFixed(2)}M on clients not in the Forecaster; ${cx.length} clients with MediaBox complexity; ` +
    `${clients.filter((c) => c.gaia.length === 0).length} clients without a GAIA number`,
);

// ─── Write ───────────────────────────────────────────────────────────────────

const generatedAt = new Date().toISOString();
const data = { generatedAt, from, to, clients, spendNotInForecaster: Math.round(spendNotInForecaster) };
const ts = `// filepath: lib/server/staffing-data.ts
/* eslint-disable */
// GENERATED by data-prep/build-staffing-data.mjs — do not edit by hand.
// Server-only: merged into the Finance Toolkit dataset by app/api/finance-toolkit-data/route.ts.
// Source: BigQuery Finance_Toolkit.staffing_investment / staffing_complexity (MediaOcean MIR + MediaBox), ${from} – ${to}.
// Generated ${generatedAt}.

import type { FtStaffingData } from "../finance-toolkit/finance-toolkit.types";

export const STAFFING_DATA: FtStaffingData = ${JSON.stringify(data)};
`;
writeFileSync(OUT_TS, ts);
console.log(`Wrote ${OUT_TS} (${(Buffer.byteLength(ts) / 1024).toFixed(0)} KB)`);
