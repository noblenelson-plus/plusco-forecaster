// lib/server/report-access.ts

/**
 * Server-side access check + download for the Reports snapshot files, used by
 * app/api/report-file/route.ts. Uses the SSR service account (Cloud Run
 * metadata server) through the Google REST APIs, so it never depends on
 * storage.rules. No firebase-admin: Next.js symlinks it as an external
 * package, which makes `firebase deploy` fail on Windows (EPERM).
 *
 * Why: storage.rules' cross-service Firestore lookups refused every non-admin
 * (agency-domain users like @cossettemedia.com got 403 on their own agency's
 * file), while the same logic in Firestore rules and the app allows them. The
 * route now applies the app's reference logic (lib/format/access.ts) itself,
 * reading the same docs the rules read: users/{email},
 * config/sign_in_domains, config/company_domains, agencies, and
 * dashboard_grants/{email}.
 *
 * Mirrors storage.rules: the manifest needs an active user; an agency file
 * needs admin, or an active user whose domain or grants cover the agency.
 */

import { normalizeGrantTabs, readableAgencyScope, scopeCoversAgency } from "../format/access";
import { emailDomain, normalizeDomain, normalizeEmail } from "../format/email";

export const REPORT_BUCKET = "pluscoops.firebasestorage.app";
const PROJECT_ID = "pluscoops";
// The public web API key (same as lib/firebase.ts), for verifying ID tokens.
const WEB_API_KEY = "AIzaSyD8Y56gUQc-Uzih2ApfuLB5-HF6Or-DQ9I";
const FIRESTORE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const TIMEOUT_MS = 20_000;

/** A definitive answer for the caller (no fallback). */
export type ReportFileResult =
  | { ok: true; body: ArrayBuffer; contentType: string }
  | { ok: false; status: 401 | 403 | 404; error: string };
type Refusal = Extract<ReportFileResult, { ok: false }>;

type RestFields = Record<string, Record<string, unknown>>;

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

async function getJson(url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
}

// ─── Service-account token (Cloud Run metadata server) ───────────────────────

let cachedToken: { value: string; expiresAt: number } | null = null;

async function serviceToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const res = await fetch(
    "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
    { headers: { "Metadata-Flavor": "Google" }, cache: "no-store", signal: AbortSignal.timeout(5_000) }
  );
  if (!res.ok) throw new Error(`metadata token HTTP ${res.status}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return json.access_token;
}

// ─── Firestore REST ───────────────────────────────────────────────────────────

/** Decodes a Firestore REST value into plain JSON. */
function decodeValue(v: Record<string, unknown>): unknown {
  if ("stringValue" in v) return v.stringValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("arrayValue" in v) {
    const values = (v.arrayValue as { values?: Record<string, unknown>[] }).values ?? [];
    return values.map(decodeValue);
  }
  if ("mapValue" in v) return decodeFields((v.mapValue as { fields?: RestFields }).fields);
  return null;
}

function decodeFields(fields: RestFields | undefined): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields ?? {}).map(([k, v]) => [k, decodeValue(v)]));
}

/** One document's fields, or null when it doesn't exist. */
async function getDoc(path: string, token: string): Promise<Record<string, unknown> | null> {
  const url = `${FIRESTORE}/${path.split("/").map(encodeURIComponent).join("/")}`;
  const res = await getJson(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Firestore ${path}: HTTP ${res.status}`);
  return decodeFields(((await res.json()) as { fields?: RestFields }).fields);
}

/** Agency doc id → its `domains`. */
async function fetchAgencyDomains(token: string): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {};
  let pageToken = "";
  do {
    const page = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "";
    const res = await getJson(`${FIRESTORE}/agencies?pageSize=300${page}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Firestore agencies: HTTP ${res.status}`);
    const json = (await res.json()) as {
      documents?: { name: string; fields?: RestFields }[];
      nextPageToken?: string;
    };
    for (const d of json.documents ?? []) {
      const id = decodeURIComponent(d.name.slice(d.name.lastIndexOf("/") + 1));
      out[id] = strings(decodeFields(d.fields).domains);
    }
    pageToken = json.nextPageToken ?? "";
  } while (pageToken);
  return out;
}

// ─── Access + download ────────────────────────────────────────────────────────

/** Verifies a Firebase ID token; null when invalid or expired. */
async function verifyIdToken(idToken: string): Promise<{ email?: string; emailVerified: boolean } | null> {
  const res = await getJson(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${WEB_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  if (res.status === 400) return null; // INVALID_ID_TOKEN, TOKEN_EXPIRED, …
  if (!res.ok) throw new Error(`accounts:lookup HTTP ${res.status}`);
  const user = ((await res.json()) as { users?: { email?: string; emailVerified?: boolean }[] }).users?.[0];
  return user ? { email: user.email, emailVerified: user.emailVerified === true } : null;
}

/**
 * Verifies the ID token, checks access to `path` (already validated against
 * the route's whitelist) and downloads the file. Throws on infrastructure
 * errors (the route then falls back to forwarding the token to Storage).
 */
export async function readReportFile(path: string, idToken: string): Promise<ReportFileResult> {
  const caller = await verifyIdToken(idToken);
  if (!caller) return { ok: false, status: 401, error: "Invalid or expired sign-in token." };

  const token = await serviceToken();
  const denied = await checkReportAccess(path, caller.email, caller.emailVerified, token);
  if (denied) return denied;

  const res = await getJson(
    `https://storage.googleapis.com/storage/v1/b/${REPORT_BUCKET}/o/${encodeURIComponent(path)}?alt=media`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (res.status === 404) return { ok: false, status: 404, error: "Not published." };
  if (!res.ok) throw new Error(`Storage download HTTP ${res.status}`);
  return {
    ok: true,
    body: await res.arrayBuffer(),
    contentType: res.headers.get("content-type") ?? "application/octet-stream",
  };
}

/**
 * The storage.rules decision for one caller: null = allowed, else the refusal.
 * `token` is a service-account access token.
 */
export async function checkReportAccess(
  path: string,
  rawEmail: string | undefined,
  emailVerified: boolean,
  token: string
): Promise<Refusal | null> {
  const email = normalizeEmail(rawEmail);
  if (!email || !emailVerified) {
    return { ok: false, status: 403, error: "A verified company email is required." };
  }

  const [user, signIn, company, grant] = await Promise.all([
    getDoc(`users/${email}`, token),
    getDoc("config/sign_in_domains", token),
    getDoc("config/company_domains", token),
    getDoc(`dashboard_grants/${email}`, token),
  ]);

  // isActive: company domain allowed to sign in, a users row, not revoked.
  const signInDomains = strings(signIn?.domains).map(normalizeDomain);
  if (!user || user.disabled === true || !signInDomains.includes(emailDomain(email))) {
    return { ok: false, status: 403, error: "No access." };
  }

  const agencyMatch = path.match(/^reports\/[^/]+\/([^/]+)\/data\.json\.gz$/);
  if (agencyMatch) {
    const scope = readableAgencyScope({
      email,
      isAdmin: user.role === "ADMIN",
      disabled: false,
      agencyDomains: await fetchAgencyDomains(token),
      companyDomains: strings(company?.domains),
      grants: normalizeGrantTabs(grant?.tabs),
      dashboardAccess: { hiddenTabs: [], hiddenSubtabs: [] },
    });
    if (!scopeCoversAgency(scope, agencyMatch[1])) {
      return { ok: false, status: 403, error: "No access to this agency's report." };
    }
  }
  return null;
}
