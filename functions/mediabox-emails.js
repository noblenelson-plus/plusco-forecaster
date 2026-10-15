// functions/mediabox-emails.js

/**
 * Who a Forecaster client is allocated to in MediaBox / Planner.
 *
 * MediaBox pushes `mediabox_clients/{mbClientId}` (name + `allocatedEmails`)
 * into this project. A Forecaster client links to its MediaBox client(s)
 * through `CL_MediaBox_IDs`; its derived `CL_MediaBox_Emails` is the union of
 * those clients' allocated emails (lowercase, sorted). The security rules read
 * it like `CL_Team_Emails`.
 *
 * Plain functions over a Firestore instance, shared by the Cloud Functions
 * (index.js) and the backfill script (scripts/backfill-mediabox-emails.mjs).
 */

/** The client's MediaBox ids: trimmed, non-empty, deduped. */
export function mediaboxIds(client) {
  const raw = Array.isArray(client?.CL_MediaBox_IDs) ? client.CL_MediaBox_IDs : [];
  return [...new Set(raw.filter((x) => typeof x === "string").map((x) => x.trim()).filter(Boolean))];
}

/** Lowercase, trimmed, deduped, sorted emails. */
export function normalizeEmails(list) {
  const raw = Array.isArray(list) ? list : [];
  return [...new Set(raw.filter((e) => typeof e === "string").map((e) => e.trim().toLowerCase()).filter((e) => e.includes("@")))].sort();
}

/** Union of the allocated emails of the given MediaBox clients (missing docs add nothing). */
export async function allocatedEmailsFor(db, ids) {
  if (!ids.length) return [];
  const snaps = await db.getAll(...ids.map((id) => db.collection("mediabox_clients").doc(id)));
  return normalizeEmails(snaps.flatMap((s) => (s.exists ? s.get("allocatedEmails") ?? [] : [])));
}

/** Same members, same order (both lists are normalized). */
export function sameEmails(a, b) {
  return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((e, i) => e === b[i]);
}

/**
 * The client's up-to-date CL_MediaBox_Emails, or null when the stored value
 * is already right (nothing to write).
 */
export async function mediaboxEmailsUpdate(db, client) {
  const next = await allocatedEmailsFor(db, mediaboxIds(client));
  return sameEmails(next, client?.CL_MediaBox_Emails) ? null : next;
}
