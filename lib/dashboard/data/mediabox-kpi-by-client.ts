// lib/dashboard/data/mediabox-kpi-by-client.ts

/**
 * MediaBox Planner → Investment KPI rows. Builds, per client, the same columns
 * as the Mediaocean KPI table (`mo_kpi_by_client`, BigQuery
 * bq/KPI_BY_CLIENT_2025_vs_2026.sql) from MediaBox PLANNED budgets, so the
 * Investment KPIs scorecards and the KPIs by Client table render the MediaBox
 * Planner view with the exact same components and roll-ups.
 *
 * Spend columns follow the SQL's rules, applied to MediaBox's media type and
 * publisher (2025 and 2026 full years, CAD):
 *   - total:   every row (the view's hidden "Other" / no media type excluded);
 *   - Labs:    publisher whose name family is a configured Labs partner of the
 *              year (Admin → LABS, "Billups-OOH" → BILLUPS);
 *   - digital: Programmatic + Digital Direct + Search + Social;
 *   - deal:    a deal tag other than "#N/A" (same as the SQL);
 *   - prog Labs: Programmatic on Yahoo / Amazon / Quantcast / AIM / StackAdapt / MIQ;
 *   - Meta / MIQ-Social: that publisher family on Social;
 *   - Billups: publishers named "Billups…" on OOH / Print.
 *
 * Targets, goals and eligibility are not spend: they are taken from the
 * client's Mediaocean KPI row unchanged (Meta target, Social forecast, MIQ-Social
 * forecast, Labs target, Billups eligibility — ineligible clients' OOH / Print
 * are zeroed exactly like the SQL does). The Meta Share Trend is recomputed
 * from the MediaBox Meta / Social figures with the SQL's thresholds.
 *
 * Pure and Firebase-free.
 */

import type { KpiByClientRow } from "./use-mo-kpi-by-client";
import {
  isHiddenMediaType,
  mediaTypeOf,
  publisherOf,
  type PlannerRow,
} from "./use-mediabox-planner-mix";

/**
 * A MediaBox publisher's partner family, upper case — the counterpart of the
 * MIR partner name: "Billups - Cineplex" → BILLUPS, "Media IQ (MIQ)" → MIQ,
 * "Cossette Programmatic Yahoo DSP" → YAHOO, "All Inclusive Marketing (AIM) -
 * Affiliate" → AIM. Anything else is the publisher itself, upper case.
 */
export function publisherFamily(publisher: string): string {
  const p = publisher.trim().toLowerCase();
  if (p.startsWith("billups")) return "BILLUPS";
  if (p === "meta") return "META";
  if (/\bmiq\b/.test(p) || p.includes("media iq")) return "MIQ";
  if (p.includes("all inclusive marketing") || /\baim\b/.test(p)) return "AIM";
  for (const f of ["amazon", "yahoo", "quantcast", "reddit", "stackadapt"]) {
    if (p.includes(f)) return f.toUpperCase();
  }
  return publisher.trim().toUpperCase();
}

/** Labs partner families of the year, from the Admin → LABS partner names. */
export function labsFamilies(partnerNames: string[]): Set<string> {
  return new Set(
    partnerNames.map((n) => n.split("-")[0].trim().toUpperCase()).filter((f) => f !== "")
  );
}

const PROG_LABS_FAMILIES = new Set(["YAHOO", "AMAZON", "QUANTCAST", "AIM", "STACKADAPT", "MIQ"]);
const DIGITAL = new Set(["PROGRAMMATIC", "DIGITAL DIRECT", "SEARCH", "SOCIAL"]);

/** Spend columns accumulated per client. */
const SPEND_KEYS = [
  "total_spend_2026",
  "total_spend_2025",
  "labs_spend_2026",
  "digital_spend_2026",
  "digital_spend_2025",
  "digital_direct_spend_2026",
  "digital_direct_spend_2025",
  "dd_deal_spend_2026",
  "dd_nondeal_spend_2026",
  "prog_spend_2026",
  "prog_spend_2025",
  "prog_labs_spend_2026",
  "prog_deal_spend_2026",
  "prog_nondeal_spend_2026",
  "social_spend_2026",
  "social_spend_2025",
  "meta_spend_2026",
  "meta_spend_2025",
  "miq_social_spend_2026",
  "ooh_spend_2026",
  "billups_ooh_spend_2026",
  "print_spend_2026",
  "billups_print_spend_2026",
] as const;
type SpendKey = (typeof SPEND_KEYS)[number];

/** Target / forecast / eligibility columns copied from the Mediaocean row. */
const CARRIED_KEYS = [
  "target_meta_spend_2026",
  "social_forecast_rfq1",
  "miq_social_forecast_2026",
  "labs_target_rfq2_2026",
  "labs_booked_mir_2026",
  "eligible_billups_ooh",
  "eligible_billups_print",
  "scenario_meta_mapping",
] as const;

/** Per-client status column names the Mediaocean sync may carry. */
const STATUS_KEYS = ["CLIENT_STATUS_IN_2026", "CLIENT_STATUS", "client_status_2026", "Client_Status_2026"];

const yes = (v: unknown) => {
  const s = (v ?? "Yes").toString().trim().toLowerCase();
  return !(s === "n/a" || s === "no" || s === "not eligible");
};

/** The SQL's meta_share_trend, from one client's Meta / Social figures. */
function metaShareTrend(name: string, s: Record<SpendKey, number>): string | null {
  if (name.trim().toUpperCase() === "BRP") return null;
  const m25 = s.meta_spend_2025;
  const m26 = s.meta_spend_2026;
  if (m26 === 0) return "Divested Meta Share";
  if (m25 === 0) return "Increasing Meta Share";
  if (s.social_spend_2026 === 0 || s.social_spend_2025 === 0) return "Flat Meta Share";
  const delta = m26 / s.social_spend_2026 - m25 / s.social_spend_2025;
  if (delta <= -0.01) return "Divested Meta Share";
  if (delta >= 0.01) return "Increasing Meta Share";
  return "Flat Meta Share";
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * One KPI row per client with MediaBox planned spend (2025/2026) or a
 * Mediaocean KPI row, keyed and named like `mo_kpi_by_client`.
 */
export function mediaboxKpiRows(
  planner: PlannerRow[],
  moRows: KpiByClientRow[],
  labs: Set<string>
): KpiByClientRow[] {
  const moById = new Map(moRows.map((r) => [r.PLUSCO_CLIENT_ID, r]));
  const spend = new Map<string, Record<SpendKey, number>>();
  const labsByPartner = new Map<string, Map<string, number>>();
  const dims = new Map<string, { name: string; agency: string }>();

  const blank = () => Object.fromEntries(SPEND_KEYS.map((k) => [k, 0])) as Record<SpendKey, number>;

  for (const r of planner) {
    const id = r.PLUSCO_CLIENT_ID;
    if (!id || isHiddenMediaType(r)) continue;
    const year = String(r.PLUSCO_YEAR);
    if (year !== "2025" && year !== "2026") continue;
    const v = typeof r.PLANNED_CAD === "number" && Number.isFinite(r.PLANNED_CAD) ? r.PLANNED_CAD : 0;
    if (v === 0) continue;

    let s = spend.get(id);
    if (!s) {
      s = blank();
      spend.set(id, s);
      dims.set(id, { name: r.PLUSCO_CLIENT_NAME, agency: r.AGENCY });
    }
    const y = year === "2026" ? "2026" : "2025";
    const add = (key: string) => {
      if (key in s!) s![key as SpendKey] += v;
    };

    const type = mediaTypeOf(r).toUpperCase();
    const family = publisherFamily(publisherOf(r));
    const deals = r.PLUSCO_2026_DEALS;
    const isDeal = !!deals && deals !== "#N/A";

    add(`total_spend_${y}`);
    if (DIGITAL.has(type)) add(`digital_spend_${y}`);
    if (type === "DIGITAL DIRECT") {
      add(`digital_direct_spend_${y}`);
      if (y === "2026") add(isDeal ? "dd_deal_spend_2026" : "dd_nondeal_spend_2026");
    }
    if (type === "PROGRAMMATIC") {
      add(`prog_spend_${y}`);
      if (y === "2026") {
        add(isDeal ? "prog_deal_spend_2026" : "prog_nondeal_spend_2026");
        if (PROG_LABS_FAMILIES.has(family)) add("prog_labs_spend_2026");
      }
    }
    if (type === "SOCIAL") {
      add(`social_spend_${y}`);
      if (family === "META") add(`meta_spend_${y}`);
      if (family === "MIQ" && y === "2026") add("miq_social_spend_2026");
    }
    if (y === "2026") {
      if (type === "OOH") {
        add("ooh_spend_2026");
        if (family === "BILLUPS") add("billups_ooh_spend_2026");
      }
      if (type === "PRINT") {
        add("print_spend_2026");
        if (family === "BILLUPS") add("billups_print_spend_2026");
      }
      if (labs.has(family)) {
        add("labs_spend_2026");
        let byPartner = labsByPartner.get(id);
        if (!byPartner) labsByPartner.set(id, (byPartner = new Map()));
        byPartner.set(family, (byPartner.get(family) ?? 0) + v);
      }
    }
  }

  const ids = new Set([...spend.keys(), ...moById.keys()]);
  const out: KpiByClientRow[] = [];
  for (const id of ids) {
    const mo = moById.get(id);
    const s = spend.get(id) ?? blank();
    const d = dims.get(id);
    const name = (mo?.CLIENT_NAME as string | undefined) ?? d?.name ?? id;

    // Billups eligibility gates OOH / Print exactly like the SQL.
    if (!yes(mo?.eligible_billups_ooh)) {
      s.ooh_spend_2026 = 0;
      s.billups_ooh_spend_2026 = 0;
    }
    if (!yes(mo?.eligible_billups_print)) {
      s.print_spend_2026 = 0;
      s.billups_print_spend_2026 = 0;
    }

    const parts = [...(labsByPartner.get(id) ?? new Map<string, number>())]
      .sort((a, b) => b[1] - a[1])
      .map(([p, v]) => ({ p, v: round2(v) }));

    out.push({
      // Client status columns (Billups reads them) — never the Mediaocean spend.
      ...Object.fromEntries(STATUS_KEYS.filter((k) => mo?.[k] != null).map((k) => [k, mo![k]])),
      PLUSCO_CLIENT_ID: id,
      CLIENT_NAME: name,
      AGENCY: (mo?.AGENCY as string | undefined) ?? d?.agency ?? "",
      BU_REGION: (mo?.BU_REGION as string | undefined) ?? "",
      BUSINESS_LEAD: (mo?.BUSINESS_LEAD as string | undefined) ?? "",
      GM_POD: (mo?.GM_POD as string | undefined) ?? "",
      ...Object.fromEntries(CARRIED_KEYS.map((k) => [k, mo?.[k] ?? (k.startsWith("eligible") ? "Yes" : 0)])),
      ...Object.fromEntries(SPEND_KEYS.map((k) => [k, round2(s[k])])),
      other_platforms_spend_2026: round2(s.social_spend_2026 - s.meta_spend_2026),
      other_platforms_spend_2025: round2(s.social_spend_2025 - s.meta_spend_2025),
      labs_by_partner_2026: parts.length ? JSON.stringify(parts) : null,
      meta_share_trend: metaShareTrend(name, s),
    } as KpiByClientRow);
  }
  return out;
}
