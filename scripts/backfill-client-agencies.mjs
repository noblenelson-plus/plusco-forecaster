// filepath: scripts/backfill-client-agencies.mjs
/**
 * Backfill / repair:  users.clientAgencies  from  users.assignedClients.
 *
 * `clientAgencies` is the derived list of agencies (CL_Agency) of a user's
 * assigned clients. Firestore + Storage rules check it to let a user read
 * agency-scoped data (MediaOcean tab, Reports snapshots) for their clients'
 * agencies. The app keeps it current on every assignment change; run this once
 * after deploying that change (existing users have no clientAgencies yet), and
 * any time you suspect drift.
 *
 * Run from repo root:
 *   node scripts/backfill-client-agencies.mjs --dry-run   preview, writes nothing
 *   node scripts/backfill-client-agencies.mjs             write the changes
 *
 * Needs read+write to Firestore in pluscoops and a current
 * gcloud auth application-default login.
 */

import admin from "firebase-admin";

const FIRESTORE_PROJECT = "pluscoops";
const DRY_RUN = process.argv.includes("--dry-run");

const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

async function main() {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: FIRESTORE_PROJECT,
  });
  const db = admin.firestore();

  const clients = await db.collection("clients").select("CL_Agency").get();
  const agencyOf = new Map(clients.docs.map((d) => [d.id, d.get("CL_Agency")]));
  console.log(`Loaded ${agencyOf.size} client(s).`);

  const users = await db.collection("users").get();
  let changed = 0;
  for (const u of users.docs) {
    const assigned = u.get("assignedClients") ?? [];
    const next = [
      ...new Set(assigned.map((id) => agencyOf.get(id)).filter((a) => typeof a === "string" && a)),
    ].sort();
    const current = [...(u.get("clientAgencies") ?? [])].sort();
    if (same(next, current)) continue;
    changed += 1;
    console.log(
      `  ${String(u.get("email")).padEnd(40)} [${current.join(", ")}] -> [${next.join(", ")}]`
    );
    if (!DRY_RUN) await u.ref.update({ clientAgencies: next });
  }

  console.log("");
  console.log(
    DRY_RUN
      ? `Dry run: ${changed} of ${users.size} user(s) would change. Nothing written.`
      : `Done: updated ${changed} of ${users.size} user(s).`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("Backfill FAILED:", err?.message || err);
  process.exit(1);
});
