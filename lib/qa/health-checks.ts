// lib/qa/health-checks.ts

/**
 * QA "Data Health" checks — pure functions (no Firebase). Compare what the
 * dashboard shows (the synced Firestore collections) against the BigQuery
 * fingerprint written at sync time (scripts/qa-fingerprint.mjs →
 * dashboard_meta/qa_fingerprint), plus sanity rules on the data itself.
 *
 * Each check returns a plain-English result an admin can act on. Groups:
 *   - Freshness: is every table built from the latest MIR (NATIVE)?
 *   - BigQuery parity: does the app hold exactly what BigQuery has?
 *   - Data sanity: values the dashboard relies on (deal tags, channel names,
 *     partner splits) look right.
 *   - Cross-checks: related numbers on different pages agree (or the known
 *     reason they differ is stated).
 */

export type CheckStatus = "pass" | "warn" | "fail" | "info";

export interface CheckResult {
  id: string;
  group: "Freshness" | "BigQuery parity" | "Data sanity" | "Cross-checks";
  title: string;
  status: CheckStatus;
  /** One or two sentences: what was compared and what was found. */
  detail: string;
  /** What to do when it isn't a pass. */
  action?: string;
}

/** dashboard_meta/qa_fingerprint, as written by scripts/qa-fingerprint.mjs. */
export interface QaFingerprint {
  generatedAt: string;
  tables: Record<string, { lastModified: string; rowCount: number }>;
  kpi: {
    rows: number;
    labsSpend2026: number;
    totalSpend2026: number;
    labsBookedMir2026: number;
    labsByPartner: { partner: string; net: number }[];
  };
  mix: { byYear: { year: string; rows: number; net: number }[] };
  social: { rows: number; spend2025: number; spend2026: number };
  metaSocial: { clients: number };
}

export interface HealthInput {
  fingerprint: QaFingerprint | null;
  /** dashboard_meta/last_sync synced_at (full sync-all run), if any. */
  lastFullSyncAt: string | null;
  kpiRows: {
    id: string;
    labs_spend_2026?: unknown;
    total_spend_2026?: unknown;
    labs_booked_mir_2026?: unknown;
    labs_by_partner_2026?: unknown;
  }[];
  mixRows: {
    PLUSCO_YEAR?: unknown;
    NET_ORDERED_CAD?: unknown;
    PLUSCO_2026_DEALS?: unknown;
    PLUSCO_MEDIA_CHANNEL?: unknown;
  }[];
  socialRows: { spend_2025?: unknown; spend_2026?: unknown }[];
  metaSocialDocs: number;
  /** Ids of the Forecaster's clients (any status). */
  forecasterClientIds: ReadonlySet<string>;
  /** Configured Labs partner families for the KPI year, upper-case (e.g. BILLUPS). */
  labsFamilies: readonly string[];
  /** 2026 Deals values the dashboard expects (deal split relies on them). */
  allowedDealValues: readonly string[];
  now?: Date;
}

/** Tables built from NATIVE that the dashboard depends on. */
export const DERIVED_TABLES = [
  "KPI_BY_CLIENT_2025_vs_2026",
  "MEDIAOCEAN_INVESTMENT_MIX",
  "SOCIAL_PARTNER_MIX_2025_vs_2026",
  "CHANNEL_MIX_2025_vs_2026",
  "META_SOCIAL_OUTPUT_2025_vs_2026",
];
const NATIVE = "PCC_Dashboard_NATIVE";

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};
const money = (v: number) =>
  `${v < 0 ? "−" : ""}$${Math.round(Math.abs(v)).toLocaleString("en-CA")}`;
const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" });
/** Dollar totals match when within $1 (rounding across thousands of rows). */
const sameMoney = (a: number, b: number) => Math.abs(a - b) <= 1;

export function runHealthChecks(input: HealthInput): CheckResult[] {
  const out: CheckResult[] = [];
  const now = input.now ?? new Date();
  const fp = input.fingerprint;

  // ── Freshness ─────────────────────────────────────────────────────────────
  if (!fp) {
    out.push({
      id: "fp-missing",
      group: "Freshness",
      title: "BigQuery fingerprint",
      status: "fail",
      detail: "No BigQuery fingerprint found, so the app can't be compared with BigQuery.",
      action: "Run  node scripts/sync-all.mjs  (or  node scripts/qa-fingerprint.mjs).",
    });
  } else {
    const ageDays = (now.getTime() - new Date(fp.generatedAt).getTime()) / 86_400_000;
    out.push({
      id: "fp-age",
      group: "Freshness",
      title: "BigQuery fingerprint",
      status: ageDays > 35 ? "warn" : "pass",
      detail: `BigQuery was last checked on ${day(fp.generatedAt)} (${Math.floor(ageDays)} day${
        Math.floor(ageDays) === 1 ? "" : "s"
      } ago). The checks below compare the app with that snapshot.`,
      action:
        ageDays > 35
          ? "Over a month old — run the monthly rebuild + sync-all to refresh it."
          : undefined,
    });

    const native = fp.tables[NATIVE];
    if (!native) {
      out.push({
        id: "native-missing",
        group: "Freshness",
        title: "MIR source table (NATIVE)",
        status: "fail",
        detail: "PCC_Dashboard_NATIVE wasn't found in the fingerprint.",
      });
    } else {
      out.push({
        id: "native",
        group: "Freshness",
        title: "Latest MIR load (NATIVE)",
        status: "info",
        detail: `PCC_Dashboard_NATIVE was rebuilt on ${day(native.lastModified)} (${native.rowCount.toLocaleString(
          "en-CA"
        )} rows). Every table below must be rebuilt after it.`,
      });
      for (const t of DERIVED_TABLES) {
        const info = fp.tables[t];
        if (!info) {
          out.push({
            id: `fresh-${t}`,
            group: "Freshness",
            title: t,
            status: "warn",
            detail: `${t} wasn't found in BigQuery.`,
          });
          continue;
        }
        const stale = new Date(info.lastModified) < new Date(native.lastModified);
        out.push({
          id: `fresh-${t}`,
          group: "Freshness",
          title: t,
          status: stale ? "fail" : "pass",
          detail: stale
            ? `Rebuilt ${day(info.lastModified)} — BEFORE the latest MIR load (${day(
                native.lastModified
              )}), so its pages still show the older MIR.`
            : `Rebuilt ${day(info.lastModified)}, after the latest MIR load.`,
          action: stale
            ? `Rebuild ${t} (bq/ — see bq/README.md for the order), then run sync-all.`
            : undefined,
        });
      }
    }

    out.push({
      id: "full-sync",
      group: "Freshness",
      title: "Last full sync (sync-all)",
      status: "info",
      detail: input.lastFullSyncAt
        ? `The last complete sync-all run was on ${day(input.lastFullSyncAt)}. Single-table syncs don't update this date — the parity checks below are what confirm the app matches BigQuery.`
        : "No full sync-all run is recorded.",
    });
  }

  // ── BigQuery parity ───────────────────────────────────────────────────────
  if (fp) {
    // KPI_BY_CLIENT → mo_kpi_by_client (one doc per client).
    const kpi = input.kpiRows;
    out.push({
      id: "kpi-count",
      group: "BigQuery parity",
      title: "KPIs by client — clients",
      status: kpi.length === fp.kpi.rows ? "pass" : "fail",
      detail: `App: ${kpi.length} clients · BigQuery: ${fp.kpi.rows}.`,
      action: kpi.length === fp.kpi.rows ? undefined : "Run  node scripts/sync-kpi-by-client.mjs.",
    });
    const sums: [string, string, (r: HealthInput["kpiRows"][number]) => unknown, number][] = [
      ["kpi-labs", "Total LABS Spend 2026", (r) => r.labs_spend_2026, fp.kpi.labsSpend2026],
      ["kpi-total", "Total media spend 2026", (r) => r.total_spend_2026, fp.kpi.totalSpend2026],
      ["kpi-booked", "Labs booked (pacing) 2026", (r) => r.labs_booked_mir_2026, fp.kpi.labsBookedMir2026],
    ];
    for (const [id, title, pick, expected] of sums) {
      const actual = kpi.reduce((a, r) => a + num(pick(r)), 0);
      const ok = sameMoney(actual, expected);
      out.push({
        id,
        group: "BigQuery parity",
        title: `KPIs — ${title}`,
        status: ok ? "pass" : "fail",
        detail: `App: ${money(actual)} · BigQuery: ${money(expected)}${ok ? "" : ` (off by ${money(actual - expected)})`}.`,
        action: ok ? undefined : "Run  node scripts/sync-kpi-by-client.mjs.",
      });
    }
    const appPartners = labsByPartner(kpi);
    const partnerMismatch = fp.kpi.labsByPartner.filter(
      (p) => !sameMoney(appPartners.get(p.partner.toUpperCase()) ?? 0, p.net)
    );
    out.push({
      id: "kpi-partners",
      group: "BigQuery parity",
      title: "KPIs — Labs spend by partner",
      status: partnerMismatch.length ? "fail" : "pass",
      detail: partnerMismatch.length
        ? `Differs for ${partnerMismatch.map((p) => p.partner).join(", ")}.`
        : `All ${fp.kpi.labsByPartner.length} partners match BigQuery to the dollar.`,
      action: partnerMismatch.length ? "Run  node scripts/sync-kpi-by-client.mjs." : undefined,
    });

    // MEDIAOCEAN_INVESTMENT_MIX → mediaocean_investment_mix ($ by year).
    const mixByYear = new Map<string, { rows: number; net: number }>();
    for (const r of input.mixRows) {
      const y = String(r.PLUSCO_YEAR ?? "");
      const cur = mixByYear.get(y) ?? { rows: 0, net: 0 };
      cur.rows += 1;
      cur.net += num(r.NET_ORDERED_CAD);
      mixByYear.set(y, cur);
    }
    for (const y of fp.mix.byYear) {
      const app = mixByYear.get(y.year) ?? { rows: 0, net: 0 };
      const ok = sameMoney(app.net, y.net);
      out.push({
        id: `mix-${y.year}`,
        group: "BigQuery parity",
        title: `Media Investments — ${y.year} net ordered`,
        status: ok ? "pass" : "fail",
        detail: `App: ${money(app.net)} (${app.rows.toLocaleString("en-CA")} records) · BigQuery: ${money(
          y.net
        )} (${y.rows.toLocaleString("en-CA")} rows).${ok ? "" : ` Off by ${money(app.net - y.net)}.`}`,
        action: ok ? undefined : "Run  node scripts/sync-mediaocean-investment-mix.mjs.",
      });
    }

    // SOCIAL_PARTNER_MIX → social_partner_mix.
    const s25 = input.socialRows.reduce((a, r) => a + num(r.spend_2025), 0);
    const s26 = input.socialRows.reduce((a, r) => a + num(r.spend_2026), 0);
    const socialOk = sameMoney(s25, fp.social.spend2025) && sameMoney(s26, fp.social.spend2026);
    out.push({
      id: "social",
      group: "BigQuery parity",
      title: "Social partners — spend 2025 / 2026",
      status: socialOk ? "pass" : "fail",
      detail: `App: ${money(s25)} / ${money(s26)} · BigQuery: ${money(fp.social.spend2025)} / ${money(
        fp.social.spend2026
      )}.`,
      action: socialOk ? undefined : "Run  node scripts/sync-social-partner-mix.mjs.",
    });

    // META_SOCIAL_OUTPUT → meta_social_output (one doc per client).
    out.push({
      id: "meta-social",
      group: "BigQuery parity",
      title: "Meta social output — clients",
      status: input.metaSocialDocs === fp.metaSocial.clients ? "pass" : "fail",
      detail: `App: ${input.metaSocialDocs} clients · BigQuery: ${fp.metaSocial.clients}.`,
      action:
        input.metaSocialDocs === fp.metaSocial.clients
          ? undefined
          : "Run  node scripts/sync-meta-social-output.mjs.",
    });
  }

  // ── Data sanity ───────────────────────────────────────────────────────────
  const allowed = new Set(input.allowedDealValues);
  const dealCounts = new Map<string, number>();
  for (const r of input.mixRows) {
    if (String(r.PLUSCO_YEAR) !== "2026") continue;
    const v = String(r.PLUSCO_2026_DEALS ?? "").trim();
    dealCounts.set(v, (dealCounts.get(v) ?? 0) + 1);
  }
  const unexpected = [...dealCounts.entries()].filter(([v]) => !allowed.has(v));
  out.push({
    id: "deal-values",
    group: "Data sanity",
    title: "2026 Deals tags (Media Investments)",
    status: unexpected.length ? "fail" : "pass",
    detail: unexpected.length
      ? `Unexpected values: ${unexpected.map(([v, n]) => `"${v || "(blank)"}" × ${n}`).join(", ")}. The Deal / Non-Deal split only counts "Partner Deal".`
      : `Only ${input.allowedDealValues.map((v) => `"${v}"`).join(" and ")} — as expected.`,
    action: unexpected.length
      ? "Fix the tags in the MIR / Key Deals sheet, rebuild NATIVE and MEDIAOCEAN_INVESTMENT_MIX, then sync."
      : undefined,
  });

  const byLower = new Map<string, Set<string>>();
  for (const r of input.mixRows) {
    const raw = String(r.PLUSCO_MEDIA_CHANNEL ?? "");
    const key = raw.trim().toLowerCase();
    if (!key) continue;
    if (!byLower.has(key)) byLower.set(key, new Set());
    byLower.get(key)!.add(raw);
  }
  const dupes = [...byLower.values()].filter((s) => s.size > 1);
  out.push({
    id: "channel-dupes",
    group: "Data sanity",
    title: "Media channel names",
    status: dupes.length ? "fail" : "pass",
    detail: dupes.length
      ? `Same channel spelled differently: ${dupes.map((s) => [...s].map((v) => `"${v}"`).join(" / ")).join("; ")} — shows twice in filters.`
      : `${byLower.size} channels, each spelled one way.`,
    action: dupes.length ? "Fix the spelling in the MIR source, rebuild, then sync." : undefined,
  });

  const splitOff = input.kpiRows.filter((r) => {
    const parts = parsePartnerJson(r.labs_by_partner_2026).reduce((a, p) => a + p.v, 0);
    return !sameMoney(parts, num(r.labs_spend_2026));
  });
  out.push({
    id: "partner-split",
    group: "Data sanity",
    title: "Labs partner split adds up",
    status: splitOff.length ? "fail" : "pass",
    detail: splitOff.length
      ? `${splitOff.length} client(s) whose per-partner Labs split doesn't sum to their Labs spend.`
      : `For all ${input.kpiRows.length} clients, the partner breakdown sums to Total LABS Spend.`,
  });

  const families = new Set(input.labsFamilies);
  const unknownPartners = [...labsByPartner(input.kpiRows).keys()].filter((p) => !families.has(p));
  out.push({
    id: "partner-config",
    group: "Data sanity",
    title: "Labs partners match Admin → LABS",
    status: unknownPartners.length ? "warn" : "pass",
    detail: unknownPartners.length
      ? `In the data but not configured in Admin → LABS: ${unknownPartners.join(", ")}.`
      : `Every partner in Labs spend is configured in Admin → LABS (${input.labsFamilies.join(", ")}).`,
  });

  const unmatched = input.kpiRows.filter((r) => !input.forecasterClientIds.has(r.id));
  const unmatchedSpend = unmatched.reduce((a, r) => a + num(r.total_spend_2026), 0);
  out.push({
    id: "client-match",
    group: "Data sanity",
    title: "MIR clients matched to Forecaster clients",
    status: unmatched.length ? "info" : "pass",
    detail: unmatched.length
      ? `${unmatched.length} MIR client(s) aren't Forecaster clients (${money(unmatchedSpend)} of 2026 media); dashboards that filter by client leave them out.`
      : "Every MIR client is a Forecaster client.",
  });

  // ── Cross-checks ──────────────────────────────────────────────────────────
  const labs = input.kpiRows.reduce((a, r) => a + num(r.labs_spend_2026), 0);
  const booked = input.kpiRows.reduce((a, r) => a + num(r.labs_booked_mir_2026), 0);
  out.push({
    id: "labs-vs-booked",
    group: "Cross-checks",
    title: "Total LABS Spend vs Labs booked (pacing)",
    status: sameMoney(labs, booked) ? "pass" : "warn",
    detail: sameMoney(labs, booked)
      ? `Both ${money(labs)}.`
      : `Total LABS Spend ${money(labs)} vs Labs booked ${money(booked)} — a ${money(
          labs - booked
        )} gap. Known causes: the pacing views count MIQ only for buy types Display / Video / Social (MIQ Audio / Search are left out of "booked"), and they don't filter on deal type. See Metric Formulas → Labs Booked to Date.`,
    action: sameMoney(labs, booked)
      ? undefined
      : "Expected until the MIQ buy-type rule is decided (pending with the media team).",
  });

  const mix2026 = mixByYearNet(input.mixRows, "2026");
  const kpiTotal = input.kpiRows.reduce((a, r) => a + num(r.total_spend_2026), 0);
  out.push({
    id: "mix-vs-kpi",
    group: "Cross-checks",
    title: "Total media 2026: Media Investments vs KPIs",
    status: sameMoney(mix2026, kpiTotal) ? "pass" : "warn",
    detail: `Media Investments ${money(mix2026)} · KPIs ${money(kpiTotal)}${
      sameMoney(mix2026, kpiTotal) ? " — they agree." : ` — differ by ${money(mix2026 - kpiTotal)}.`
    }`,
    action: sameMoney(mix2026, kpiTotal)
      ? undefined
      : "Both come from NATIVE; a gap usually means one table wasn't rebuilt or synced.",
  });

  return out;
}

function parsePartnerJson(v: unknown): { p: string; v: number }[] {
  if (typeof v !== "string" || !v) return [];
  try {
    return (JSON.parse(v) as { p: string; v: number }[]).map((x) => ({
      p: String(x.p).toUpperCase(),
      v: num(x.v),
    }));
  } catch {
    return [];
  }
}

function labsByPartner(rows: HealthInput["kpiRows"]): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows) {
    for (const { p, v } of parsePartnerJson(r.labs_by_partner_2026)) out.set(p, (out.get(p) ?? 0) + v);
  }
  return out;
}

function mixByYearNet(rows: HealthInput["mixRows"], year: string): number {
  return rows
    .filter((r) => String(r.PLUSCO_YEAR) === year)
    .reduce((a, r) => a + num(r.NET_ORDERED_CAD), 0);
}

/** Counts by status, for the summary bar. */
export function summarize(results: CheckResult[]): Record<CheckStatus, number> {
  const out: Record<CheckStatus, number> = { pass: 0, warn: 0, fail: 0, info: 0 };
  for (const r of results) out[r.status] += 1;
  return out;
}
