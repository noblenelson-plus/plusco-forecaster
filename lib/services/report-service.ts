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
import { blSubmissionByMonth } from "../format/revenue-commission";
import { ANNUAL_RFQ_SENTINEL } from "../format/bulk-forecast";
import { fetchAxisData } from "./data-entry-service";
import { fetchAnnualActuals } from "./annual-actuals-service";
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

const AXES: { axisId: AxisId; label: string; adminLabel: string }[] = [
  { axisId: "media", label: "Media", adminLabel: "MediaOcean (Admin)" },
  { axisId: "labs", label: "Labs", adminLabel: "MediaOcean (Admin)" },
  { axisId: "revenue", label: "Revenue", adminLabel: "GAIA (Admin)" },
];

const SUMMARY_SECTION = "BL Submission (BL+Admin)";

type ReportRow = (string | number)[];

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
  revenueSuffixes = false
): ReportRow[] {
  const rows: ReportRow[] = [];

  for (const bucket of data.buckets) {
    for (const row of bucket.rows) {
      rows.push([
        ...baseCells,
        revenueSuffixes ? "" : `${submission}-BL`,
        axisLabel, "BL Input", bucket.name, row.label,
        ...monthCells(row.months),
      ]);
    }
  }
  for (const row of adminRows) {
    const isOfficial =
      revenueSuffixes && row.rowType === REVENUE_GAIA_FORECAST_TYPE;
    rows.push([
      ...baseCells,
      isOfficial ? `${submission}-OF` : "",
      axisLabel, adminSectionLabel, "", row.label,
      ...monthCells(row.months),
    ]);
  }

  // Nothing stored for this axis/submission → no block at all (the summary
  // row alone would just be a line of zeros).
  if (rows.length === 0 || blSubmission === null) return rows;

  rows.push([
    ...baseCells,
    revenueSuffixes ? `${submission}-BL` : "",
    axisLabel, SUMMARY_SECTION, "", "",
    ...monthCells(blSubmission),
  ]);
  return rows;
}

/** Builds and pushes the "General Forecast Data" report. Returns the URL. */
export async function generateGeneralForecastReport(
  scope: GeneralReportScope,
  ref: BulkReference
): Promise<ReportResult> {
  const clients = ref.clients.filter((c) => scope.clientIds.includes(c.cl_id));
  const years = [...scope.years].sort((a, b) => a - b);
  const rfqs = [...scope.rfqs].sort(
    (a, b) => RFQ_TYPE_ORDER[a] - RFQ_TYPE_ORDER[b]
  );
  // Keep the canonical Media → Labs → Revenue order regardless of the
  // selection order in the UI.
  const axes = AXES.filter((a) => scope.axes.includes(a.axisId));
  const annualAxes = axes.filter((a) => a.axisId !== "revenue");

  const rows: ReportRow[] = [];

  for (const client of clients) {
    for (const year of years) {
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
                true
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
                data, [], null
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
          rows.push([
            client.cl_id, client.CL_Name, year, ANNUAL_RFQ_SENTINEL, "",
            axis.label, axis.adminLabel, "", row.label,
            ...monthCells(row.months),
          ]);
        }
      }
    }
  }

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
