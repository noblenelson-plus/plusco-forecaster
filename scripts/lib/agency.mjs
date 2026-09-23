// filepath: scripts/lib/agency.mjs
/**
 * Agency normalization shared by the syncs that feed agency-scoped data (the
 * Reports snapshots and the MediaOcean collections).
 *
 * Every synced row is tagged with ONE app agency -- the same values as
 * `clients.CL_Agency` / `users.assignedAgencies` (CLIENT_AGENCIES in
 * lib/constants/client.constants.ts). Security rules compare that tag against
 * the reader's agencies, so it must match those names exactly.
 *
 * Anything that isn't one of the app agencies ("#N/A", blanks, a new agency the
 * app doesn't know yet) becomes UNASSIGNED_AGENCY, which only Admin and Exec can
 * read. Nothing leaks to the wrong agency and nothing silently disappears: the
 * syncs print how many rows landed there.
 */

// Keep in sync with CLIENT_AGENCIES in lib/constants/client.constants.ts.
export const APP_AGENCIES = ["Cossette Media", "Showroom", "Jungle", "Mekanism"];

// Tag for rows with no recognizable agency (Admin/Exec only). Starts with "_"
// so it can never collide with a real agency name.
export const UNASSIGNED_AGENCY = "_unassigned";

const BY_KEY = new Map(APP_AGENCIES.map((a) => [a.toLowerCase(), a]));

/** Maps a raw agency value to its app agency name, or UNASSIGNED_AGENCY. */
export function normalizeAgency(raw) {
  if (raw === null || raw === undefined) return UNASSIGNED_AGENCY;
  const key = String(raw).trim().toLowerCase();
  return BY_KEY.get(key) ?? UNASSIGNED_AGENCY;
}

/** Logs a per-agency row count, flagging rows that only Admin/Exec will see. */
export function logAgencySplit(label, counts) {
  console.log(`Agency split for ${label}:`);
  for (const [agency, n] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
    const note =
      agency === UNASSIGNED_AGENCY ? "  (no recognized agency -> Admin/Exec only)" : "";
    console.log(`  ${agency.padEnd(16)} ${String(n).padStart(8)}${note}`);
  }
}

/** Counts rows per normalized agency, using `agencyOf(row)`. */
export function countByAgency(rows, agencyOf) {
  const counts = new Map();
  for (const r of rows) {
    const a = agencyOf(r);
    counts.set(a, (counts.get(a) ?? 0) + 1);
  }
  return counts;
}
