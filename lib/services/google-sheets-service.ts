// lib/services/google-sheets-service.ts

/**
 * Google Sheets transport for the Bulk Edit module.
 *
 * The app is entirely client-side (no server, no secrets), so we authenticate
 * with Google Identity Services (GIS) in the browser and call the Sheets/Drive
 * REST APIs directly with the resulting access token. The token is short-lived
 * (~1 h) and not refreshable client-side, so the admin re-connects each session
 * — acceptable for an admin-only tool.
 *
 * Setup (done once in Google Cloud, outside the code): enable the Sheets + Drive
 * APIs, create an OAuth Web client, and put its id in NEXT_PUBLIC_GOOGLE_CLIENT_ID.
 * Scopes: `spreadsheets` (read/write) + `drive.file` (access only files the app
 * creates), so the consent stays narrow.
 */

const GIS_SRC = "https://accounts.google.com/gsi/client";
const SCOPES =
  "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file";
const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";

/** The OAuth client id, injected at build time. Absent → feature disabled. */
export const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";

export function isGoogleConfigured(): boolean {
  return GOOGLE_CLIENT_ID.length > 0;
}

// ─── Minimal GIS typings (the script attaches `google` to window) ────────────

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

interface TokenClient {
  requestAccessToken: (overrides?: { prompt?: string }) => void;
  callback: (resp: TokenResponse) => void;
}

interface GoogleOAuth2 {
  initTokenClient: (config: {
    client_id: string;
    scope: string;
    callback: (resp: TokenResponse) => void;
  }) => TokenClient;
}

declare global {
  interface Window {
    google?: { accounts?: { oauth2?: GoogleOAuth2 } };
  }
}

// ─── Script + token-client bootstrap ─────────────────────────────────────────

let scriptPromise: Promise<void> | null = null;

function loadGisScript(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Google Sheets is only available in the browser."));
  }
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Failed to load Google script.")));
      return;
    }
    const script = document.createElement("script");
    script.src = GIS_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Identity script."));
    document.head.appendChild(script);
  });
  return scriptPromise;
}

let tokenClient: TokenClient | null = null;
let accessToken: string | null = null;
let tokenExpiresAt = 0;

async function ensureTokenClient(): Promise<TokenClient> {
  if (!isGoogleConfigured()) {
    throw new Error("Google Sheets is not configured (NEXT_PUBLIC_GOOGLE_CLIENT_ID missing).");
  }
  await loadGisScript();
  const oauth2 = window.google?.accounts?.oauth2;
  if (!oauth2) throw new Error("Google Identity Services failed to initialize.");
  if (!tokenClient) {
    tokenClient = oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: SCOPES,
      callback: () => {}, // replaced per-request in requestAccessToken
    });
  }
  return tokenClient;
}

export function isConnected(): boolean {
  return !!accessToken && Date.now() < tokenExpiresAt;
}

export function disconnect(): void {
  accessToken = null;
  tokenExpiresAt = 0;
}

/**
 * Requests (or refreshes) an access token via the GIS popup. Resolves once the
 * user has granted access. `prompt: ""` lets Google skip the popup when a valid
 * grant already exists in the session.
 */
export function connect(): Promise<void> {
  return new Promise(async (resolve, reject) => {
    try {
      const client = await ensureTokenClient();
      client.callback = (resp: TokenResponse) => {
        if (resp.error || !resp.access_token) {
          reject(new Error(resp.error_description || resp.error || "Authorization failed."));
          return;
        }
        accessToken = resp.access_token;
        tokenExpiresAt = Date.now() + (resp.expires_in ?? 3600) * 1000 - 60_000; // 1 min safety
        resolve();
      };
      client.requestAccessToken({ prompt: isConnected() ? "" : "consent" });
    } catch (err) {
      reject(err);
    }
  });
}

/** Ensures a usable token, prompting the user if needed. */
async function getToken(): Promise<string> {
  if (isConnected() && accessToken) return accessToken;
  await connect();
  if (!accessToken) throw new Error("Not connected to Google.");
  return accessToken;
}

// ─── REST helpers ────────────────────────────────────────────────────────────

/** A non-2xx Google API response; `status` lets callers retry transient ones. */
export class GoogleApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const token = await getToken();
  const resp = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!resp.ok) {
    if (resp.status === 401) {
      disconnect(); // force re-auth on the next call
    }
    let detail = "";
    try {
      const body = await resp.json();
      detail = body?.error?.message ?? "";
    } catch {
      // ignore non-JSON error bodies
    }
    throw new GoogleApiError(
      `Google API error ${resp.status}${detail ? `: ${detail}` : ""}`,
      resp.status
    );
  }
  return (await resp.json()) as T;
}

// ─── Spreadsheet operations ──────────────────────────────────────────────────

export interface CreatedSpreadsheet {
  spreadsheetId: string;
  url: string;
  /** tab title → numeric sheetId (needed for data-validation requests). */
  sheetIdsByTitle: Record<string, number>;
}

/**
 * A tab to create: a bare title (Google's default 1000×26 grid), or a title
 * with an exact grid size so a large write fits without expanding the sheet.
 */
export type SheetSpec =
  | string
  | { title: string; rowCount: number; columnCount: number };

/** Creates a spreadsheet with the given tabs, returns id + URL + sheetIds. */
export async function createSpreadsheet(
  title: string,
  sheets: SheetSpec[]
): Promise<CreatedSpreadsheet> {
  const body = {
    properties: { title },
    sheets: sheets.map((s) =>
      typeof s === "string"
        ? { properties: { title: s } }
        : {
            properties: {
              title: s.title,
              gridProperties: {
                rowCount: Math.max(1, s.rowCount),
                columnCount: Math.max(1, s.columnCount),
              },
            },
          }
    ),
  };
  const res = await api<{
    spreadsheetId: string;
    spreadsheetUrl: string;
    sheets?: { properties?: { sheetId?: number; title?: string } }[];
  }>(SHEETS_API, { method: "POST", body: JSON.stringify(body) });

  const sheetIdsByTitle: Record<string, number> = {};
  for (const s of res.sheets ?? []) {
    const { title: t, sheetId } = s.properties ?? {};
    if (t != null && sheetId != null) sheetIdsByTitle[t] = sheetId;
  }
  return { spreadsheetId: res.spreadsheetId, url: res.spreadsheetUrl, sheetIdsByTitle };
}

/** A single dropdown (ONE_OF_LIST) over the data rows of one column. */
export interface ColumnDropdown {
  sheetId: number;
  /** 0-based column index. */
  columnIndex: number;
  values: string[];
  /** Number of data rows to cover (defaults to 1000). */
  rowCount?: number;
}

/**
 * Applies in-sheet dropdowns to the given columns via one batchUpdate. `strict`
 * is false so a slightly-off value (case, paste) is only flagged, not blocked —
 * the import QA is the real gate.
 */
export async function applyDataValidations(
  spreadsheetId: string,
  dropdowns: ColumnDropdown[]
): Promise<void> {
  const requests = dropdowns
    .filter((d) => d.columnIndex >= 0 && d.values.length > 0)
    .map((d) => ({
      setDataValidation: {
        range: {
          sheetId: d.sheetId,
          startRowIndex: 1,
          endRowIndex: 1 + (d.rowCount ?? 1000),
          startColumnIndex: d.columnIndex,
          endColumnIndex: d.columnIndex + 1,
        },
        rule: {
          condition: {
            type: "ONE_OF_LIST",
            values: d.values.map((v) => ({ userEnteredValue: v })),
          },
          showCustomUi: true,
          strict: false,
        },
      },
    }));
  if (requests.length === 0) return;
  await api(`${SHEETS_API}/${spreadsheetId}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({ requests }),
  });
}

/**
 * Google Sheets' hard cap on cells per spreadsheet (all tabs, whole grid).
 * Writes past it fail, so large exports are checked against it up front.
 */
export const SHEETS_CELL_LIMIT = 10_000_000;

/**
 * Cells sent per write request. One PUT of a very large matrix (tens of MB of
 * JSON) makes the API fail with a 500, so big writes go out in row chunks of
 * roughly this many cells (~2 MB each). Small writes stay a single request.
 */
const WRITE_CHUNK_CELLS = 200_000;

/** Statuses worth retrying: rate limit (per-minute write quota) and transient server errors. */
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 4;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Grows a tab's grid to at least `rows` × `cols` (never shrinks it). */
async function ensureGridSize(
  spreadsheetId: string,
  sheetTitle: string,
  rows: number,
  cols: number
): Promise<void> {
  const res = await api<{
    sheets?: {
      properties?: {
        sheetId?: number;
        title?: string;
        gridProperties?: { rowCount?: number; columnCount?: number };
      };
    }[];
  }>(
    `${SHEETS_API}/${spreadsheetId}?fields=sheets.properties(sheetId,title,gridProperties)`
  );
  const props = res.sheets?.find((s) => s.properties?.title === sheetTitle)
    ?.properties;
  if (props?.sheetId == null) return;
  const rowCount = props.gridProperties?.rowCount ?? 0;
  const columnCount = props.gridProperties?.columnCount ?? 0;
  if (rowCount >= rows && columnCount >= cols) return;
  await api(`${SHEETS_API}/${spreadsheetId}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({
      requests: [
        {
          updateSheetProperties: {
            properties: {
              sheetId: props.sheetId,
              gridProperties: {
                rowCount: Math.max(rowCount, rows),
                columnCount: Math.max(columnCount, cols),
              },
            },
            fields: "gridProperties(rowCount,columnCount)",
          },
        },
      ],
    }),
  });
}

/** PUTs one block of rows at `startRow` (1-based), retrying transient failures with backoff. */
async function putRows(
  spreadsheetId: string,
  sheetTitle: string,
  startRow: number,
  values: (string | number)[][]
): Promise<void> {
  const range = `${quoteSheet(sheetTitle)}!A${startRow}`;
  const url = `${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(
    range
  )}?valueInputOption=USER_ENTERED`;
  for (let attempt = 1; ; attempt++) {
    try {
      await api(url, { method: "PUT", body: JSON.stringify({ values }) });
      return;
    } catch (error) {
      const retryable =
        error instanceof GoogleApiError && RETRYABLE_STATUSES.has(error.status);
      if (!retryable || attempt >= MAX_ATTEMPTS) throw error;
      // 2 s, 4 s, 8 s — long enough for the per-minute write quota to refill.
      await sleep(1000 * 2 ** attempt);
    }
  }
}

/**
 * Writes a matrix into a tab starting at A1 (USER_ENTERED so numbers stay
 * numbers). Large matrices are split into sequential row chunks; the tab must
 * already be big enough (see the sized `SheetSpec` in createSpreadsheet).
 */
export async function writeValues(
  spreadsheetId: string,
  sheetTitle: string,
  values: (string | number)[][]
): Promise<void> {
  const width = values.reduce((max, row) => Math.max(max, row.length), 1);
  const rowsPerChunk = Math.max(1, Math.floor(WRITE_CHUNK_CELLS / width));
  if (values.length <= rowsPerChunk) {
    await putRows(spreadsheetId, sheetTitle, 1, values);
    return;
  }
  // A single write grows the grid to fit, but a chunk whose start row lies
  // beyond the grid is rejected — so size the tab before writing in pieces.
  await ensureGridSize(spreadsheetId, sheetTitle, values.length, width);
  for (let start = 0; start < values.length; start += rowsPerChunk) {
    await putRows(
      spreadsheetId,
      sheetTitle,
      start + 1,
      values.slice(start, start + rowsPerChunk)
    );
  }
}

/** Reads a whole tab back as a raw matrix (unformatted, so numbers are numbers). */
export async function readSheet(
  spreadsheetId: string,
  sheetTitle: string
): Promise<unknown[][]> {
  const range = quoteSheet(sheetTitle);
  const url = `${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(
    range
  )}?valueRenderOption=UNFORMATTED_VALUE`;
  const res = await api<{ values?: unknown[][] }>(url);
  return res.values ?? [];
}

/** Returns the tab titles present in a spreadsheet. */
export async function getSheetTitles(spreadsheetId: string): Promise<string[]> {
  const url = `${SHEETS_API}/${spreadsheetId}?fields=sheets.properties.title`;
  const res = await api<{ sheets?: { properties?: { title?: string } }[] }>(url);
  return (res.sheets ?? [])
    .map((s) => s.properties?.title)
    .filter((t): t is string => !!t);
}

// ─── Utilities ───────────────────────────────────────────────────────────────

/** Wraps a sheet title in single quotes (doubling internal quotes) for A1 ranges. */
function quoteSheet(title: string): string {
  return `'${title.replace(/'/g, "''")}'`;
}

/**
 * Accepts a full Google Sheets URL or a bare id and returns the spreadsheet id.
 * Returns null when nothing id-like is found.
 */
export function extractSpreadsheetId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const urlMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (urlMatch) return urlMatch[1];
  // Bare id (Drive ids are long alphanumeric with - and _).
  if (/^[a-zA-Z0-9-_]{20,}$/.test(trimmed)) return trimmed;
  return null;
}
