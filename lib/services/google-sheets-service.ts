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
    throw new Error(
      `Google API error ${resp.status}${detail ? `: ${detail}` : ""}`
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

/** Creates a spreadsheet with the given tab titles, returns id + URL + sheetIds. */
export async function createSpreadsheet(
  title: string,
  sheetTitles: string[]
): Promise<CreatedSpreadsheet> {
  const body = {
    properties: { title },
    sheets: sheetTitles.map((t) => ({ properties: { title: t } })),
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

/** Writes a matrix into a tab starting at A1 (USER_ENTERED so numbers stay numbers). */
export async function writeValues(
  spreadsheetId: string,
  sheetTitle: string,
  values: (string | number)[][]
): Promise<void> {
  const range = `${quoteSheet(sheetTitle)}!A1`;
  const url = `${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(
    range
  )}?valueInputOption=USER_ENTERED`;
  await api(url, { method: "PUT", body: JSON.stringify({ values }) });
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
