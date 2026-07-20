// lib/services/report-service.ts

/**
 * Report Center — builders that push read-only Google Sheet reports.
 *
 * Unlike Bulk Edit (whose sheets round-trip back into the app), reports are
 * one-way snapshots shaped for analysis. First report:
 *
 * "General Forecast Data" — the selected axes flattened into ONE tab:
 *   • `Year` and `RFQ` columns, plus a `Submission` marker column: on Revenue
 *     it flags the two key rows ("RFQ2-2026-OF" / "RFQ2-2026-BL"); on
 *     Media/Labs every BL Input row gets "RFQ2-2026-BL" and admin rows stay
 *     empty;
 *   • one row per BL line (project × type) and per Admin line — GAIA rows
 *     ride with their submission; annual MediaOcean rows (Media/Labs) appear
 *     ONCE per client × year with RFQ = "ANNUAL", since they are shared by
 *     every RFQ of the year;
 *   • on Revenue only, a "BL Submission (BL+Admin)" summary row reproducing
 *     the forecast grid's mauve source-of-truth line: for each month the GAIA
 *     detail figures win when any carries a value, otherwise the BL Input
 *     total is used;
 *   • a vertical `Total` column (Jan..Dec summed) on every row.
 */

import { MONTHS, type MonthlyMap } from "../types/common.types";
import {
  REVENUE_GAIA_FORECAST_TYPE,
  type AxisData,
  type AxisId,
  type ForecastRow,
} from "../types/forecaster.types";
import { type RFQType, RFQ_TYPE_ORDER } from "../types/rfq.types";
import type { Client } from "../types/client.types";
import { blSubmissionByMonth } from "../format/revenue-commission";
import { resolveClientStatus } from "../format/client";
import { ANNUAL_RFQ_SENTINEL } from "../format/bulk-forecast";
import { fetchAxisData } from "./data-entry-service";
import { fetchAnnualActuals } from "./annual-actuals-service";
import { fetchCurrencyRateForYear } from "./currency-service";
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

const TAB_TITLE = "General Forecast Data";
const EXTENDED_TAB_TITLE = "General Forecast Data (Extended)";

const HEADER = [
  "ClientId",
  "Client",
  "Year",
  "RFQ",
  "Submission", // Revenue: RFQ2-2026-OF / RFQ2-2026-BL on the key rows; Media/Labs: RFQ2-2026-BL on BL Input rows
  "Axis",
  "Section",
  "Project",
  "Type",
  ...MONTH_LABELS,
  "Total",
];

/**
 * Extra per-client columns appended (after `Total`) by the extended report.
 * Order matches the request; `Product Name` is intentionally left blank for
 * now, and `FO_Value_CAD` is the row's Total converted to CAD (see
 * `clientColumns`).
 */
const CLIENT_COLUMN_HEADERS = [
  "Agency",
  "CL_Tier",
  "FO_Currency",
  "Product Name",
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

const EXTENDED_HEADER = [...HEADER, ...CLIENT_COLUMN_HEADERS];

const AXES: { axisId: AxisId; label: string; adminLabel: string }[] = [
  { axisId: "media", label: "Media", adminLabel: "MediaOcean (Admin)" },
  { axisId: "labs", label: "Labs", adminLabel: "MediaOcean (Admin)" },
  { axisId: "revenue", label: "Revenue", adminLabel: "GAIA (Admin)" },
];

const SUMMARY_SECTION = "BL Submission (BL+Admin)";

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
      "", // Product Name — intentionally blank for now
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
 * Rows of one axis of one submission: BL lines, Admin lines, and — when
 * `blSubmission` is given (Revenue only) — the "BL Submission (BL+Admin)"
 * summary line. Year and RFQ live in their own columns; the Submission column
 * differs per axis: with `revenueSuffixes` the Official Revenue admin row gets
 * "RFQ2-2026-OF" and the summary row gets "RFQ2-2026-BL" (BL Input rows stay
 * empty); without it (Media/Labs) every BL Input row gets "RFQ2-2026-BL" and
 * admin rows stay empty.
 */
function axisRows(
  baseCells: (string | number)[], // ClientId, Client, Year, RFQ
  submission: string, // "RFQ2-2026"
  axisLabel: string,
  adminSectionLabel: string,
  data: AxisData,
  adminRows: ForecastRow[],
  blSubmission: MonthlyMap | null,
  revenueSuffixes = false,
  extra: ExtraFn = null
): ReportRow[] {
  const rows: ReportRow[] = [];

  for (const bucket of data.buckets) {
    for (const row of bucket.rows) {
      rows.push(appendExtra([
        ...baseCells,
        revenueSuffixes ? "" : `${submission}-BL`,
        axisLabel, "BL Input", bucket.name, row.label,
        ...monthCells(row.months),
      ], extra));
    }
  }
  for (const row of adminRows) {
    const isOfficial =
      revenueSuffixes && row.rowType === REVENUE_GAIA_FORECAST_TYPE;
    rows.push(appendExtra([
      ...baseCells,
      isOfficial ? `${submission}-OF` : "",
      axisLabel, adminSectionLabel, "", row.label,
      ...monthCells(row.months),
    ], extra));
  }

  // Nothing stored for this axis/submission → no block at all (the summary
  // row alone would just be a line of zeros).
  if (rows.length === 0 || blSubmission === null) return rows;

  rows.push(appendExtra([
    ...baseCells,
    revenueSuffixes ? `${submission}-BL` : "",
    axisLabel, SUMMARY_SECTION, "", "",
    ...monthCells(blSubmission),
  ], extra));
  return rows;
}

/**
 * Shared row builder for both reports. When `extended` is true, each row gets
 * the per-client columns appended (see `CLIENT_COLUMN_HEADERS`); this also
 * fetches the USD→CAD rate once per year for the `FO_Value_CAD` conversion.
 */
async function buildReportRows(
  scope: GeneralReportScope,
  ref: BulkReference,
  extended: boolean
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

  // USD→CAD rate per selected year — fetched once (extended report only).
  const rateByYear = new Map<number, number | undefined>();
  if (extended) {
    await Promise.all(
      years.map(async (y) => rateByYear.set(y, await fetchCurrencyRateForYear(y)))
    );
  }

  const rows: ReportRow[] = [];

  for (const client of clients) {
    for (const year of years) {
      // The per-client column suffix (null for the plain report).
      const extra: ExtraFn = extended
        ? clientColumns(client, year, rateByYear.get(year))
        : null;

      // Annual MediaOcean actuals (Media/Labs) are per client+year, shared by
      // every submission of the year — fetched once here, only for the
      // selected axes.
      const annualByAxis: Record<string, ForecastRow[]> = Object.fromEntries(
        await Promise.all(
          annualAxes.map(async (axis) => [
            axis.axisId,
            await fetchAnnualActuals(client.cl_id, year, axis.axisId),
          ])
        )
      );

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
            // GAIA rides in the same doc; the mauve-row helper owns the
            // per-month "detail wins over BL" priority. Revenue rows carry
            // the -OF / -BL Submission suffixes.
            rows.push(
              ...axisRows(
                baseCells, submission, axis.label, axis.adminLabel,
                data, data.actuals, blSubmissionByMonth(data),
                true, extra
              )
            );
          } else {
            // Media/Labs: BL lines only — no summary row, and the annual
            // MediaOcean rows are emitted once per client × year below (they
            // are shared by every RFQ, so echoing them per submission would
            // duplicate the figures).
            rows.push(
              ...axisRows(
                baseCells, submission, axis.label, axis.adminLabel,
                data, [], null, false, extra
              )
            );
          }
        }
      }

      // Annual MediaOcean rows — once per client × year, RFQ = "ANNUAL"
      // (matching the Bulk Edit sheets' sentinel): the data is shared by
      // every RFQ of the year, so it belongs to none in particular.
      for (const axis of annualAxes) {
        for (const row of annualByAxis[axis.axisId]) {
          rows.push(appendExtra([
            client.cl_id, client.CL_Name, year, ANNUAL_RFQ_SENTINEL, "",
            axis.label, axis.adminLabel, "", row.label,
            ...monthCells(row.months),
          ], extra));
        }
      }
    }
  }

  return rows;
}

/** Builds and pushes the "General Forecast Data" report. Returns the URL. */
export async function generateGeneralForecastReport(
  scope: GeneralReportScope,
  ref: BulkReference
): Promise<ReportResult> {
  const rows = await buildReportRows(scope, ref, false);

  const title = `PlusCo Forecaster report — General Forecast Data — ${new Date()
    .toISOString()
    .slice(0, 10)}`;
  const created = await sheets.createSpreadsheet(title, [TAB_TITLE]);
  await sheets.writeValues(created.spreadsheetId, TAB_TITLE, [HEADER, ...rows]);

  return {
    spreadsheetId: created.spreadsheetId,
    url: created.url,
    rowCount: rows.length,
  };
}

/**
 * "General Forecast Data (Extended)" — identical to the general report but
 * with the per-client columns (`CLIENT_COLUMN_HEADERS`) appended to every row.
 */
export async function generateExtendedForecastReport(
  scope: GeneralReportScope,
  ref: BulkReference
): Promise<ReportResult> {
  const rows = await buildReportRows(scope, ref, true);

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
