// lib/services/report-service.ts

/**
 * Report Center — builders that push read-only Google Sheet reports.
 *
 * Unlike Bulk Edit (whose sheets round-trip back into the app), reports are
 * one-way snapshots shaped for analysis.
 *
 * "General Forecast Data (Extended)" — the selected axes flattened into ONE tab:
 *   • `Year` and `RFQ` columns, plus a `Submission` marker column: on Revenue
 *     every line feeding BL Submission gets "RFQ2-2026-BL" and the independent
 *     Official Revenue line gets "RFQ2-2026-OF"; on Media/Labs every BL Input
 *     row gets "RFQ2-2026-BL" and admin rows stay empty;
 *   • one row per BL line (project × type) and per Admin line; an Admin row
 *     carrying detail lines is EXPLODED into them (the roll-up parent is not
 *     emitted, so figures are never double-counted). GAIA rows ride with their
 *     submission; annual MediaOcean rows (Media/Labs) appear ONCE per
 *     client × year with RFQ = "ANNUAL", since they are shared by every RFQ;
 *   • on Revenue, every cell is masked to the months it is "counted" in BL
 *     Submission (the grid's mauve source-of-truth priority: GAIA detail
 *     figures win a month when any carries a value, otherwise the BL Input),
 *     so summing a month column across the section equals the BL Submission
 *     total — no separate summary row. Official Revenue is independent and
 *     kept unmasked;
 *   • a vertical `Total` column (Jan..Dec summed) on every row;
 *   • a `Product Name` column — the catalog name of a Revenue "Product Fees"
 *     line's (or GAIA detail's) `productId` (blank on every other row);
 *   • the per-client columns (see CLIENT_COLUMN_HEADERS) appended before the
 *     final `Last checked status` column — the furthest-along BL Forecast
 *     Validation milestone ticked for the row's client × year.
 */

import { MONTHS, type MediaType, type MonthlyMap } from "../types/common.types";
import {
  REVENUE_GAIA_FORECAST_TYPE,
  emptyMonthly,
  type AxisData,
  type AxisId,
  type ForecastRow,
} from "../types/forecaster.types";
import { type RFQType, RFQ_TYPE_ORDER } from "../types/rfq.types";
import type { Client } from "../types/client.types";
import {
  blSubmissionLevelByMonth,
  type BlSubmissionLevel,
} from "../format/revenue-commission";
import { resolveClientStatus } from "../format/client";
import { ANNUAL_RFQ_SENTINEL } from "../format/bulk-forecast";
import { lastCheckedStepLabel } from "../constants/confirmation-steps";
import {
  type FlagCategory,
  type FlagRuleId,
  type StoredFlag,
  type StoredFlagMap,
  flagContextLabel,
} from "../types/forecast-flags.types";
import { computeBlAlerts, type BlAlert } from "../flags/bl-alerts";
import { fetchAxisData, fetchDataEntry } from "./data-entry-service";
import {
  fetchAnnualActuals,
  fetchAnnualActualsEntry,
} from "./annual-actuals-service";
import { fetchForecastValidation } from "./forecast-validation-service";
import { fetchCurrencyRateForYear } from "./currency-service";
import { fetchLabsPartners } from "./labs-partner-service";
import type { BulkReference } from "./bulk-import-service";
import * as sheets from "./google-sheets-service";

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export interface GeneralReportScope {
  clientIds: string[];
  years: number[];
  rfqs: RFQType[];
  axes: AxisId[];
}

export interface ReportResult {
  spreadsheetId: string;
  url: string;
  rowCount: number;
}

const EXTENDED_TAB_TITLE = "General Forecast Data (Extended)";

/** Final column of the report — the per-client+year BL Forecast Validation. */
const LAST_CHECKED_HEADER = "Last checked status";

/**
 * Leading columns of the report. `Product Name` is resolved from a Revenue
 * "Product Fees" line's `productId` via the catalog (blank on every other row);
 * `Project` keeps its meaning (the BL bucket name, or a GAIA detail line's
 * joined level text).
 */
const BASE_COLS = [
  "ClientId",
  "Client",
  "Year",
  "RFQ",
  "Submission", // Revenue: RFQ2-2026-BL on every BL-Submission line, RFQ2-2026-OF on Official Revenue; Media/Labs: RFQ2-2026-BL on BL Input rows
  "Axis",
  "Section",
  "Project",
  "Type",
  "Product Name",
  ...MONTH_LABELS,
  "Total",
];

/**
 * Extra per-client columns appended (after `Total`).
 * `FO_Value_CAD` is the row's Total converted to CAD (see `clientColumns`).
 */
const CLIENT_COLUMN_HEADERS = [
  "Agency",
  "CL_Tier",
  "FO_Currency",
  "CL_Fee_Structure",
  "CL_GAIA_Number",
  "CL_Business_Lead",
  "CL_Digital_Lead",
  "CL_Business_Unit_Region",
  "CL_Office",
  "GM_Pod",
  "FO_Value_CAD",
  "Client_Status_2026",
  "Notes",
];

// Full header: base + per-client columns, with "Last checked status" last.
const EXTENDED_HEADER = [...BASE_COLS, ...CLIENT_COLUMN_HEADERS, LAST_CHECKED_HEADER];

const AXES: { axisId: AxisId; label: string; adminLabel: string }[] = [
  { axisId: "media", label: "Media", adminLabel: "MediaOcean (Admin)" },
  { axisId: "labs", label: "Labs", adminLabel: "MediaOcean (Admin)" },
  { axisId: "revenue", label: "Revenue", adminLabel: "GAIA (Admin)" },
];

type ReportRow = (string | number)[];

/**
 * Builds the extra per-client cells for one row of the extended report, given
 * the row's Total (for `FO_Value_CAD`). USD clients are converted with the
 * year's USD→CAD rate (falling back to the raw total when no rate is set);
 * CAD clients pass through unchanged.
 */
type ExtraFn = ((total: number) => (string | number)[]) | null;

function clientColumns(
  client: Client,
  year: number,
  usdToCad: number | undefined
): (total: number) => (string | number)[] {
  return (total: number) => {
    const foValueCad =
      client.CL_Currency === "USD" ? total * (usdToCad ?? 1) : total;
    return [
      client.CL_Agency,
      client.CL_Tier,
      client.CL_Currency, // FO_Currency
      client.Client_Fee_Structure,
      (client.CL_GAIA_Number ?? []).join(", "),
      client.CL_Business_Lead ?? "",
      client.CL_Digital_Lead ?? "",
      client.CL_Business_Unit_Region,
      client.CL_Office,
      client.GM_Pod,
      foValueCad,
      // The column is named for 2026 (matching the CSV convention); resolve
      // the 2026 status regardless of the row's own year.
      resolveClientStatus(client, 2026),
      client.Client_Notes ?? "",
    ];
  };
}

/** Appends the extended report's client columns to a row (no-op when null). */
function appendExtra(row: ReportRow, extra: ExtraFn): ReportRow {
  if (!extra) return row;
  return [...row, ...extra(row[row.length - 1] as number)];
}

/** The 12 month cells + the vertical total, from a MonthlyMap. */
function monthCells(map: MonthlyMap): number[] {
  const values = MONTHS.map((m) => map[m] ?? 0);
  return [...values, values.reduce((a, b) => a + b, 0)];
}

/**
 * A single admin (ADMIN_INPUT) line to emit in the report. An admin row is
 * exploded into its detail lines when it has any — the roll-up parent is then
 * NOT emitted, so the detail figures are never double-counted; a row without
 * details emits once as itself. `project` carries the detail's joined level
 * text (row identity), "" for a roll-up row.
 */
interface AdminLeaf {
  months: MonthlyMap;
  project: string;
  productId?: string;
}

function adminLeaves(row: ForecastRow): AdminLeaf[] {
  const details = row.details ?? [];
  if (details.length === 0)
    return [{ months: row.months, project: "", productId: row.productId }];
  return details.map((d) => ({
    months: d.months,
    project: d.levels.filter((l) => (l ?? "").trim() !== "").join(" / "),
    productId: d.productId,
  }));
}

/**
 * Rows of one axis of one submission: BL lines then Admin lines. Year and RFQ
 * live in their own columns.
 *
 * On Revenue (`blLevelByMonth` given) the report reproduces the grid's BL
 * Submission source-of-truth: every cell is masked to the months it is
 * "counted" — a BL Input cell survives only where the BL Input wins the month,
 * a GAIA detail cell only where the GAIA lines win — so summing any month
 * column across the section equals the BL Submission total (no separate summary
 * row). Every line feeding the submission (BL Input rows + GAIA detail lines)
 * gets the "RFQ2-2026-BL" Submission marker; the independent Official Revenue
 * line keeps its real (unmasked) values and the "RFQ2-2026-OF" marker.
 *
 * On Media/Labs (`blLevelByMonth` null) nothing is masked and BL rows simply
 * get the "-BL" marker (admin rows are emitted separately as annual actuals).
 */
function axisRows(
  baseCells: (string | number)[], // ClientId, Client, Year, RFQ
  submission: string, // "RFQ2-2026"
  axisLabel: string,
  adminSectionLabel: string,
  data: AxisData,
  adminRows: ForecastRow[],
  productNameById: Map<string, string>,
  lastChecked: string,
  blLevelByMonth: Record<number, BlSubmissionLevel> | null,
  extra: ExtraFn = null
): ReportRow[] {
  const rows: ReportRow[] = [];

  // A product name resolved from its productId (Revenue "Product Fees" lines
  // only). Falls back to the raw id for a since-deleted product; "" when none.
  const productName = (productId?: string): string =>
    productId ? productNameById.get(productId) ?? productId : "";

  // Mask a row's months to the ones whose winning level matches `level` — the
  // "counted" cells. A no-op when `blLevelByMonth` is null (Media/Labs).
  const maskToLevel = (
    map: MonthlyMap,
    level: "BL" | "DETAIL"
  ): MonthlyMap => {
    if (!blLevelByMonth) return map;
    const out = emptyMonthly();
    for (const m of MONTHS)
      out[m] = blLevelByMonth[m] === level ? map[m] ?? 0 : 0;
    return out;
  };

  // Finalize a row: append the extended report's per-client cells (no-op for
  // the plain report), then the per-client+year "Last checked status" as the
  // final column. `appendExtra` still sees Total as the last cell, so its
  // FO_Value_CAD conversion stays correct.
  const finish = (cells: ReportRow): ReportRow => [
    ...appendExtra(cells, extra),
    lastChecked,
  ];

  for (const bucket of data.buckets) {
    for (const row of bucket.rows) {
      rows.push(finish([
        ...baseCells,
        `${submission}-BL`,
        axisLabel, "BL Input", bucket.name, row.label, productName(row.productId),
        ...monthCells(maskToLevel(row.months, "BL")),
      ]));
    }
  }
  for (const row of adminRows) {
    // Official Revenue is independent of BL Submission — kept as-is (unmasked)
    // with the "-OF" marker; it is never exploded into detail lines here.
    if (row.rowType === REVENUE_GAIA_FORECAST_TYPE) {
      rows.push(finish([
        ...baseCells,
        `${submission}-OF`,
        axisLabel, adminSectionLabel, "", row.label, productName(row.productId),
        ...monthCells(row.months),
      ]));
      continue;
    }
    // Every GAIA line feeding the submission — one row per detail line (no
    // roll-up parent) — masked to its counted months and marked "-BL".
    for (const leaf of adminLeaves(row)) {
      rows.push(finish([
        ...baseCells,
        `${submission}-BL`,
        axisLabel, adminSectionLabel, leaf.project, row.label,
        productName(leaf.productId),
        ...monthCells(maskToLevel(leaf.months, "DETAIL")),
      ]));
    }
  }

  return rows;
}

/**
 * Row builder for the report. Every row gets the per-client columns appended
 * (see `CLIENT_COLUMN_HEADERS`); the USD→CAD rate is fetched once per year for
 * the `FO_Value_CAD` conversion.
 */
async function buildReportRows(
  scope: GeneralReportScope,
  ref: BulkReference
): Promise<ReportRow[]> {
  const clients = ref.clients.filter((c) => scope.clientIds.includes(c.cl_id));
  const years = [...scope.years].sort((a, b) => a - b);
  const rfqs = [...scope.rfqs].sort(
    (a, b) => RFQ_TYPE_ORDER[a] - RFQ_TYPE_ORDER[b]
  );
  // Keep the canonical Media → Labs → Revenue order regardless of the
  // selection order in the UI.
  const axes = AXES.filter((a) => scope.axes.includes(a.axisId));
  const annualAxes = axes.filter((a) => a.axisId !== "revenue");

  // USD→CAD rate per selected year — fetched once for the FO_Value_CAD column.
  const rateByYear = new Map<number, number | undefined>();
  await Promise.all(
    years.map(async (y) => rateByYear.set(y, await fetchCurrencyRateForYear(y)))
  );

  const rows: ReportRow[] = [];

  for (const client of clients) {
    for (const year of years) {
      // The per-client columns appended to every row of this client × year.
      const extra: ExtraFn = clientColumns(client, year, rateByYear.get(year));

      // Annual MediaOcean actuals (Media/Labs) are per client+year, shared by
      // every submission of the year — fetched once here, only for the
      // selected axes. The BL Forecast Validation is also per client+year:
      // "Last checked status" is the furthest-along ticked milestone.
      const [annualEntries, validationSteps] = await Promise.all([
        Promise.all(
          annualAxes.map(async (axis) => [
            axis.axisId,
            await fetchAnnualActuals(client.cl_id, year, axis.axisId),
          ] as const)
        ),
        fetchForecastValidation(client.cl_id, year),
      ]);
      const annualByAxis: Record<string, ForecastRow[]> =
        Object.fromEntries(annualEntries);
      const lastChecked = lastCheckedStepLabel(validationSteps);

      for (const rfq of rfqs) {
        const dataByAxis: Record<string, AxisData> = Object.fromEntries(
          await Promise.all(
            axes.map(async (axis) => [
              axis.axisId,
              await fetchAxisData(client.cl_id, year, rfq, axis.axisId),
            ])
          )
        );

        const baseCells = [client.cl_id, client.CL_Name, year, rfq];
        const submission = `${rfq}-${year}`;

        for (const axis of axes) {
          const data = dataByAxis[axis.axisId];
          if (axis.axisId === "revenue") {
            // GAIA rides in the same doc; the level helper owns the per-month
            // "detail wins over BL" priority used to mask each cell to its
            // counted months. Revenue rows carry the -OF / -BL markers.
            rows.push(
              ...axisRows(
                baseCells, submission, axis.label, axis.adminLabel,
                data, data.actuals, ref.productNameById, lastChecked,
                blSubmissionLevelByMonth(data), extra
              )
            );
          } else {
            // Media/Labs: BL lines only (no masking) — the annual MediaOcean
            // rows are emitted once per client × year below (they are shared by
            // every RFQ, so echoing them per submission would duplicate them).
            rows.push(
              ...axisRows(
                baseCells, submission, axis.label, axis.adminLabel,
                data, [], ref.productNameById, lastChecked, null, extra
              )
            );
          }
        }
      }

      // Annual MediaOcean rows — once per client × year, RFQ = "ANNUAL"
      // (matching the Bulk Edit sheets' sentinel): the data is shared by
      // every RFQ of the year, so it belongs to none in particular. A row with
      // detail lines is exploded into them (no roll-up parent) to avoid
      // double-counting, like the Revenue admin lines.
      for (const axis of annualAxes) {
        for (const row of annualByAxis[axis.axisId]) {
          for (const leaf of adminLeaves(row)) {
            // Annual MediaOcean actuals carry no product; Product Name stays "".
            const product = leaf.productId
              ? ref.productNameById.get(leaf.productId) ?? leaf.productId
              : "";
            rows.push([
              ...appendExtra([
                client.cl_id, client.CL_Name, year, ANNUAL_RFQ_SENTINEL, "",
                axis.label, axis.adminLabel, leaf.project, row.label, product,
                ...monthCells(leaf.months),
              ], extra),
              lastChecked,
            ]);
          }
        }
      }
    }
  }

  return rows;
}

/**
 * "General Forecast Data (Extended)" — the selected axes flattened into one
 * tab with the per-client columns (`CLIENT_COLUMN_HEADERS`) appended to every
 * row.
 */
export async function generateExtendedForecastReport(
  scope: GeneralReportScope,
  ref: BulkReference
): Promise<ReportResult> {
  const rows = await buildReportRows(scope, ref);

  const title = `PlusCo Forecaster report — General Forecast Data (Extended) — ${new Date()
    .toISOString()
    .slice(0, 10)}`;
  const created = await sheets.createSpreadsheet(title, [EXTENDED_TAB_TITLE]);
  await sheets.writeValues(created.spreadsheetId, EXTENDED_TAB_TITLE, [
    EXTENDED_HEADER,
    ...rows,
  ]);

  return {
    spreadsheetId: created.spreadsheetId,
    url: created.url,
    rowCount: rows.length,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// ALL FLAGS REPORT
// ════════════════════════════════════════════════════════════════════════════

/**
 * "All Flags" — every flag of every type, for every client, flattened into one
 * tab. It joins the three flag categories the Flags page shows per submission:
 *   • QA checks (cat 2)     — transient, never persisted; recomputed live here
 *                             from each submission's Media/Labs figures.
 *   • Big swings (cat 3)    — persisted on the submission's data_entries doc.
 *   • Under target (cat 4)  — persisted on the submission's data_entries doc.
 *
 * Every amount is in the client's own currency (no FX) — the Currency column
 * disambiguates. Persisted flags carry their justification (context / note);
 * QA rows are one per violating month and carry no justification.
 */

const ALL_FLAGS_TAB_TITLE = "All Flags";

const ALL_FLAGS_HEADER = [
  "ClientId",
  "Client",
  "Agency",
  "CL_Tier",
  "Currency",
  "Year",
  "RFQ",
  "Category",
  "Type",
  "Axis",
  "Subject",
  "Month", // QA checks only (the violating month); blank on swing/under-target
  "Current",
  "Reference",
  "Delta",
  "Threshold", // persisted flags only; blank on QA checks
  "Justified", // persisted flags only ("Yes"/"No"); blank on QA checks
  "Context",
  "Note",
  "Analyzed Months", // under-target only
];

/** Human labels for the persisted-flag rules (the "Type" column). */
const FLAG_RULE_LABELS: Record<FlagRuleId, string> = {
  "revenue-swing": "Revenue swing",
  "media-swing": "Media swing",
  "labs-swing": "Labs swing",
  "media-under-target": "Media under target",
  "labs-under-target": "Labs under target",
};

/** Human labels for the persisted-flag categories (the "Category" column). */
const FLAG_CATEGORY_LABELS: Record<FlagCategory, string> = {
  swing: "Big swing",
  under_target: "Under target",
};

/**
 * The leading client + submission cells shared by every flag row of one
 * submission: ClientId, Client, Agency, CL_Tier, Currency, Year, RFQ.
 */
function flagBaseCells(
  client: Client,
  year: number,
  rfq: RFQType
): (string | number)[] {
  return [
    client.cl_id,
    client.CL_Name,
    client.CL_Agency,
    client.CL_Tier,
    client.CL_Currency,
    year,
    rfq,
  ];
}

/** One row for a persisted swing / under-target flag. */
function storedFlagRow(base: (string | number)[], flag: StoredFlag): ReportRow {
  return [
    ...base,
    FLAG_CATEGORY_LABELS[flag.category],
    FLAG_RULE_LABELS[flag.ruleId] ?? flag.ruleId,
    flag.axis,
    flag.title,
    "", // Month — n/a (swing is annual, under-target spans a window)
    flag.current,
    flag.reference,
    flag.delta,
    flag.threshold,
    flag.justified ? "Yes" : "No",
    flag.context ? flagContextLabel(flag.context) : "",
    flag.note ?? "",
    (flag.analyzedMonths ?? []).map((m) => MONTH_LABELS[m - 1]).join(", "),
  ];
}

/** One row per violating month of each live QA (cat-2) alert. */
function blAlertRows(base: (string | number)[], alerts: BlAlert[]): ReportRow[] {
  const rows: ReportRow[] = [];
  for (const alert of alerts) {
    for (const r of alert.rows) {
      rows.push([
        ...base,
        "QA check",
        alert.title,
        alert.axis,
        // The Labs-over-media alert names a media type per row; the others
        // describe the whole axis, so fall back to the alert title.
        r.label ?? alert.title,
        MONTH_LABELS[r.month - 1],
        r.left, // Current — the amount that is too high
        r.right, // Reference — the forecast it exceeds
        r.variance, // Delta — left − right
        "", // Threshold — n/a
        "", // Justified — n/a (QA checks clear on their own, never justified)
        "", // Context
        "", // Note
        "", // Analyzed Months
      ]);
    }
  }
  return rows;
}

/**
 * Every flag of every type across every client × submission. Reads one
 * data_entries doc per submission (its persisted flags + Media/Labs BL) and one
 * annual-actuals doc per client × year (the MediaOcean actuals the QA checks
 * compare against, shared by every RFQ of the year).
 */
async function buildAllFlagsRows(ref: BulkReference): Promise<ReportRow[]> {
  // Partner → media type, needed by the Labs-over-media QA check.
  const partners = await fetchLabsPartners();
  const mediaTypeById = new Map<string, MediaType>(
    partners.map((p) => [p.partnerId, p.mediaType])
  );
  const partnerMediaType = (id: string): MediaType | undefined =>
    mediaTypeById.get(id);

  // The RFQ types that actually exist, grouped by year (avoids fetching
  // submissions for year/RFQ combinations that were never created).
  const rfqTypesByYear = new Map<number, RFQType[]>();
  for (const r of ref.rfqs) {
    const list = rfqTypesByYear.get(r.year) ?? [];
    list.push(r.type);
    rfqTypesByYear.set(r.year, list);
  }
  const years = [...rfqTypesByYear.keys()].sort((a, b) => a - b);

  const rows: ReportRow[] = [];

  for (const client of ref.clients) {
    for (const year of years) {
      const rfqTypes = [...(rfqTypesByYear.get(year) ?? [])].sort(
        (a, b) => RFQ_TYPE_ORDER[a] - RFQ_TYPE_ORDER[b]
      );

      // Annual MediaOcean actuals are per client × year — shared by every RFQ.
      const annual = await fetchAnnualActualsEntry(client.cl_id, year);
      const mediaActuals = annual.media ?? [];
      const labsActuals = annual.labs ?? [];

      // One read per submission, in parallel; flatten in RFQ order.
      const perRfq = await Promise.all(
        rfqTypes.map(async (rfq): Promise<ReportRow[]> => {
          const entry = await fetchDataEntry(client.cl_id, year, rfq);
          if (!entry) return [];
          const base = flagBaseCells(client, year, rfq);
          const out: ReportRow[] = [];

          // Persisted swing (cat 3) + under-target (cat 4) flags.
          const flags = (entry.flags as StoredFlagMap | undefined) ?? {};
          for (const flag of Object.values(flags))
            out.push(storedFlagRow(base, flag));

          // Live QA checks (cat 2) — recomputed from this submission's Media/Labs
          // BL and the year's shared MediaOcean actuals (as the Flags page does).
          const media: AxisData = {
            buckets: entry.axes?.media?.buckets ?? [],
            actuals: mediaActuals,
          };
          const labs: AxisData = {
            buckets: entry.axes?.labs?.buckets ?? [],
            actuals: labsActuals,
          };
          out.push(
            ...blAlertRows(base, computeBlAlerts({ media, labs, partnerMediaType }))
          );

          return out;
        })
      );

      for (const arr of perRfq) rows.push(...arr);
    }
  }

  return rows;
}

/**
 * "All Flags" — every flag (QA checks, big swings, under-target) for every
 * client, flattened into one tab. Takes no scope: it always covers every client
 * and every existing submission.
 */
export async function generateAllFlagsReport(
  ref: BulkReference
): Promise<ReportResult> {
  const rows = await buildAllFlagsRows(ref);

  const title = `PlusCo Forecaster report — All Flags — ${new Date()
    .toISOString()
    .slice(0, 10)}`;
  const created = await sheets.createSpreadsheet(title, [ALL_FLAGS_TAB_TITLE]);
  await sheets.writeValues(created.spreadsheetId, ALL_FLAGS_TAB_TITLE, [
    ALL_FLAGS_HEADER,
    ...rows,
  ]);

  return {
    spreadsheetId: created.spreadsheetId,
    url: created.url,
    rowCount: rows.length,
  };
}
