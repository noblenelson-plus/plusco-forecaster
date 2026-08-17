// filepath: app/api/raw-table/route.ts
/**
 * Server route: filtered reads of the large raw BigQuery tables (MIR / Billing)
 * for the MIR Raw Data and Billing Summary pages. First server-side BigQuery
 * access in the app; lets leads filter by ANY combination of fields (like Looker)
 * and export the result, without syncing 126k rows into Firestore or shipping
 * BigQuery credentials to the browser.
 *
 * POST body `action`:
 *   - "options": distinct value list for every filterable column (populates dropdowns).
 *   - "query":   rows matching the filters (AND across fields, OR within a field).
 *                mode "preview" caps at 10 rows; "full" returns the slice for export
 *                (hard-capped at MAX_EXPORT_ROWS).
 *
 * Safety: only allowlisted tables (TABLES) and columns (filterCols) are usable;
 * every value is a bound query PARAMETER (no injection); filter columns are CAST to
 * STRING so numeric columns still match string filter values; LIMIT is server-set.
 * Param types are inferred by BigQuery from the JS string arrays (ARRAY<STRING>).
 *
 * Credentials: Application Default Credentials (same as the sync scripts). Local:
 * `gcloud auth application-default login`. Production: host must expose ADC / a
 * service account to the Node server, else a clear auth error is returned.
 */

import { NextResponse } from "next/server";
import { BigQuery } from "@google-cloud/bigquery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BQ_PROJECT = "plusco-media-invest-solutions";

const PREVIEW_LIMIT = 10;
const MAX_EXPORT_ROWS = 100000;

interface TableConfig {
  ref: string;
  filterCols: string[];
}

const TABLES: Record<string, TableConfig> = {
  mir: {
    ref: "`plusco-media-invest-solutions.PCC_Media_Investment.PCC_Dashboard_NATIVE`",
    filterCols: [
      "PLUSCO_YEAR",
      "MONTH",
      "BU_REGION",
      "BUSINESS_LEAD",
      "GM_POD",
      "PLUSCO_CLIENT_NAME",
      "AGENCY",
      "PLUSCO_MEDIA_CHANNEL",
      "CLIENT_STATUS_IN_2026",
    ],
  },
  billing: {
    ref: "`plusco-media-invest-solutions.PCC_Media_Investment.Billing_summary_master`",
    filterCols: [
      "PLUSCO_BU_REGION",
      "PLUSCO_BUSINESS_LEAD",
      "PLUSCO_CLIENT_NAME",
      "AGENCY",
      "INVOICE_MONTH",
      "MEDIA_NAME",
    ],
  },
};

const bq = new BigQuery({ projectId: BQ_PROJECT });

type Filters = Record<string, string[]>;

function buildWhere(
  filters: Filters,
  allowed: string[]
): { where: string; params: Record<string, unknown> } {
  const allowedSet = new Set(allowed);
  const clauses: string[] = [];
  const params: Record<string, unknown> = {};
  let i = 0;

  for (const [field, values] of Object.entries(filters || {})) {
    if (!allowedSet.has(field)) continue;
    if (!Array.isArray(values)) continue;
    const clean = values
      .map((v) => (v === null || v === undefined ? "" : String(v)))
      .filter((v) => v.trim() !== "");
    if (clean.length === 0) continue;

    const key = `f${i++}`;
    clauses.push(`CAST(\`${field}\` AS STRING) IN UNNEST(@${key})`);
    params[key] = clean;
  }

  return {
    where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
    params,
  };
}

async function getOptions(table: TableConfig) {
  const selects = table.filterCols
    .map(
      (c) =>
        `ARRAY_AGG(DISTINCT CAST(\`${c}\` AS STRING) IGNORE NULLS) AS \`${c}\``
    )
    .join(",\n  ");
  const sql = `SELECT\n  ${selects}\nFROM ${table.ref}`;

  const [rows] = await bq.query({ query: sql });
  const row: Record<string, unknown> = (rows && rows[0]) || {};

  const options: Record<string, string[]> = {};
  for (const c of table.filterCols) {
    const vals: string[] = Array.isArray(row[c]) ? (row[c] as string[]) : [];
    options[c] = vals
      .map((v) => (v ?? "").toString().trim())
      .filter((v) => v !== "")
      .sort((a, b) => a.localeCompare(b));
  }
  return options;
}

export async function POST(req: Request) {
  let body: {
    table?: string;
    action?: string;
    filters?: Filters;
    mode?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const tableKey = (body.table || "").toString();
  const table = TABLES[tableKey];
  if (!table) {
    return NextResponse.json(
      { error: `Unknown table "${tableKey}".` },
      { status: 400 }
    );
  }

  const action = (body.action || "query").toString();

  try {
    if (action === "options") {
      const options = await getOptions(table);
      return NextResponse.json({ options });
    }

    const { where, params } = buildWhere(body.filters || {}, table.filterCols);
    const isPreview = (body.mode || "preview") === "preview";
    const limit = isPreview ? PREVIEW_LIMIT : MAX_EXPORT_ROWS;

    const sql = `SELECT * FROM ${table.ref}\n${where}\nLIMIT ${limit}`;
    const [rows] = await bq.query({ query: sql, params });

    return NextResponse.json({
      rows,
      rowCount: rows.length,
      truncated: !isPreview && rows.length >= MAX_EXPORT_ROWS,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "BigQuery request failed.";
    const isAuth = /credential|permission|denied|auth|ADC|Could not load/i.test(
      message
    );
    return NextResponse.json(
      {
        error: message,
        hint: isAuth
          ? "The server could not authenticate to BigQuery. Locally, run `gcloud auth application-default login`. In production, the host must expose Application Default Credentials or a service account to the Next server."
          : undefined,
      },
      { status: isAuth ? 503 : 502 }
    );
  }
}
