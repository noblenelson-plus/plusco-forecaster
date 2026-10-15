// scripts/lib/client-ids.mjs
//
// Forecaster client ids for MediaOcean rows that only carry the client NAME
// (MEDIAOCEAN_INVESTMENT_MIX, SOCIAL_PARTNER_MIX_2025_vs_2026). The syncs tag
// each row `_clientId` so the Firestore rules can let people read their own
// clients' rows (MediaBox allocations) instead of their whole agency's.
//
// The lookup comes from PCC_Dashboard_NATIVE, which carries both
// PLUSCO_CLIENT_NAME and PLUSCO_CLIENT_ID (the Forecaster cl_id). A name that
// maps to more than one id is left out (its rows stay agency-only), as is the
// "-" placeholder id. Checked 2026-10-15: 171 names, none ambiguous; the only
// unmatched mix rows are agency "#N/A" (admin-only anyway).

const NATIVE = "`plusco-media-invest-solutions.PCC_Media_Investment.PCC_Dashboard_NATIVE`";

/** PLUSCO_CLIENT_NAME → Forecaster client id. `bq` is a BigQuery client. */
export async function fetchClientIdByName(bq) {
  const [rows] = await bq.query({
    query: `SELECT DISTINCT PLUSCO_CLIENT_NAME AS name, PLUSCO_CLIENT_ID AS id FROM ${NATIVE}
            WHERE PLUSCO_CLIENT_NAME IS NOT NULL AND PLUSCO_CLIENT_ID IS NOT NULL AND PLUSCO_CLIENT_ID != '-'`,
  });
  const ids = new Map();
  for (const { name, id } of rows) {
    if (!ids.has(name)) ids.set(name, new Set());
    ids.get(name).add(String(id).trim());
  }
  const out = new Map();
  const ambiguous = [];
  for (const [name, set] of ids) {
    if (set.size === 1) out.set(name, [...set][0]);
    else ambiguous.push(`${name} → ${[...set].join(" | ")}`);
  }
  if (ambiguous.length) console.warn(`Client names with several ids (left untagged): ${ambiguous.join("; ")}`);
  return out;
}

/**
 * Adds `_clientId` to a row from its PLUSCO_CLIENT_NAME (unchanged when the
 * name is unknown). Not a grain field, so doc ids are unchanged.
 */
export function withClientId(row, idByName) {
  const id = idByName.get(row.PLUSCO_CLIENT_NAME);
  return id ? { ...row, _clientId: id } : row;
}

/** Logs how many rows got a client id. */
export function logClientIdSplit(collection, rows) {
  const tagged = rows.filter((r) => r._clientId).length;
  const untagged = [...new Set(rows.filter((r) => !r._clientId).map((r) => `${r.PLUSCO_CLIENT_NAME} [${r.AGENCY}]`))];
  console.log(`${collection}: ${tagged}/${rows.length} rows tagged with _clientId.`);
  if (untagged.length) console.log(`  untagged (agency access only): ${untagged.slice(0, 20).join(", ")}${untagged.length > 20 ? " …" : ""}`);
}
