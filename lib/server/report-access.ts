// lib/server/report-access.ts

/**
 * Server-side access check + download for the Reports snapshot files, used by
 * app/api/report-file/route.ts. Runs with the Admin SDK (the SSR service
 * account), so it never depends on storage.rules.
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

import { getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { normalizeGrantTabs, readableAgencyScope, scopeCoversAgency } from "../format/access";
import { emailDomain, normalizeDomain, normalizeEmail } from "../format/email";

export const REPORT_BUCKET = "pluscoops.firebasestorage.app";
const PROJECT_ID = "pluscoops";

function adminApp(): App {
  return getApps()[0] ?? initializeApp({ projectId: PROJECT_ID, storageBucket: REPORT_BUCKET });
}

/** A definitive answer for the caller (no fallback). */
export type ReportFileResult =
  | { ok: true; body: Buffer; contentType: string }
  | { ok: false; status: 401 | 403 | 404; error: string };

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

/**
 * Verifies the ID token, checks access to `path` (already validated against
 * the route's whitelist) and downloads the file. Throws on infrastructure
 * errors (the route then falls back to forwarding the token to Storage).
 */
export async function readReportFile(path: string, idToken: string): Promise<ReportFileResult> {
  const app = adminApp();

  let decoded;
  try {
    decoded = await getAuth(app).verifyIdToken(idToken);
  } catch (e) {
    const code = (e as { code?: unknown })?.code;
    if (typeof code === "string" && code.startsWith("auth/")) {
      return { ok: false, status: 401, error: "Invalid or expired sign-in token." };
    }
    throw e;
  }

  const denied = await checkReportAccess(path, decoded.email, decoded.email_verified === true);
  if (denied) return denied;

  const file = getStorage(app).bucket(REPORT_BUCKET).file(path);
  const [exists] = await file.exists();
  if (!exists) return { ok: false, status: 404, error: "Not published." };
  const [[body], [meta]] = await Promise.all([file.download(), file.getMetadata()]);
  return { ok: true, body, contentType: meta.contentType ?? "application/octet-stream" };
}

/** The storage.rules decision for one caller: null = allowed, else the refusal. */
export async function checkReportAccess(
  path: string,
  rawEmail: string | undefined,
  emailVerified: boolean
): Promise<Extract<ReportFileResult, { ok: false }> | null> {
  const email = normalizeEmail(rawEmail);
  if (!email || !emailVerified) {
    return { ok: false, status: 403, error: "A verified company email is required." };
  }

  const db = getFirestore(adminApp());
  const [userSnap, signInSnap, companySnap, grantSnap] = await Promise.all([
    db.doc(`users/${email}`).get(),
    db.doc("config/sign_in_domains").get(),
    db.doc("config/company_domains").get(),
    db.doc(`dashboard_grants/${email}`).get(),
  ]);

  // isActive: company domain allowed to sign in, a users row, not revoked.
  const domain = emailDomain(email);
  const signInDomains = strings(signInSnap.get("domains")).map(normalizeDomain);
  const user = userSnap.data();
  if (!user || user.disabled === true || !signInDomains.includes(domain)) {
    return { ok: false, status: 403, error: "No access." };
  }

  const agencyMatch = path.match(/^reports\/[^/]+\/([^/]+)\/data\.json\.gz$/);
  if (agencyMatch) {
    const agencySnap = await db.collection("agencies").get();
    const agencyDomains = Object.fromEntries(
      agencySnap.docs.map((d) => [d.id, strings(d.get("domains"))])
    );
    const scope = readableAgencyScope({
      email,
      isAdmin: user.role === "ADMIN",
      disabled: false,
      agencyDomains,
      companyDomains: strings(companySnap.get("domains")),
      grants: normalizeGrantTabs(grantSnap.get("tabs")),
      dashboardAccess: { hiddenTabs: [], hiddenSubtabs: [] },
    });
    if (!scopeCoversAgency(scope, agencyMatch[1])) {
      return { ok: false, status: 403, error: "No access to this agency's report." };
    }
  }
  return null;
}
