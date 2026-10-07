// filepath: scripts/migrate-auth.mjs
/**
 * User & access management rebuild — data migration (auth-rebuild branch).
 *
 * The rebuild replaces uid-keyed users with roles VIEWER/BUSINESS_LEAD/EXEC/ADMIN,
 * invites and per-user client lists (assignedClients / assignedAgencies) with:
 *   - users keyed by lowercase email, role USER | ADMIN;
 *   - client teams (CL_Business_Lead, CL_Digital_Lead, GM Pod, CL_Collaborators)
 *     resolved into a denormalized CL_Team_Emails array on each client;
 *   - config/dashboard_access (per-dashboard GLOBAL/AGENCY mode + grants).
 *
 * Modes:
 *   node scripts/migrate-auth.mjs --backup
 *       Snapshot everything the migration touches, BEFORE any write:
 *         - the whole `users` and `invites` collections (every field),
 *         - each client's team / agency fields,
 *         - `agencies`, config/company_domains and config/dashboard_pages.
 *       Written twice: a local JSON file (scripts/backups/, gitignored — it
 *       holds staff emails) and a Firestore copy in `auth_migration_backups`
 *       so a restore doesn't depend on the file. The Firestore copy is
 *       verified (doc count) and the JSON file re-parsed before reporting OK.
 *   --dry-run / --commit / --rollback FILE
 *       Not implemented yet (Phase 6 of the plan).
 *
 * Why not `bulk_backups`: the Bulk Edit history panel lists that collection and
 * expects its header shape (axes, years, undo). `auth_migration_backups` has no
 * rules block, so client SDKs are denied by default; this script (Admin SDK)
 * bypasses rules.
 *
 * Needs read/write access to Firestore in pluscoops and a current
 * gcloud auth application-default login.
 */

import admin from "firebase-admin";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const FIRESTORE_PROJECT = "pluscoops";
const BACKUP_COLLECTION = "auth_migration_backups";
const BACKUP_DOCS = "docs";
const BATCH_SIZE = 400;
const BACKUP_DIR = join(dirname(fileURLToPath(import.meta.url)), "backups");

/** Client fields the migration reads or rewrites. */
const CLIENT_FIELDS = [
  "CL_ID",
  "CL_Name",
  "CL_Business_Lead",
  "CL_Digital_Lead",
  "GM_Pod",
  "CL_Agency",
  "CL_Collaborators",
  "CL_Team_Emails",
];
const CONFIG_DOCS = ["company_domains", "dashboard_pages"];

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);

// ─── JSON (de)serialization that keeps Firestore Timestamps restorable ────────
function toJson(value) {
  if (value instanceof admin.firestore.Timestamp) {
    return { __timestamp: value.toDate().toISOString() };
  }
  if (Array.isArray(value)) return value.map(toJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toJson(v)]));
  }
  return value;
}

function stamp(date) {
  const p = (n) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-` +
    `${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`
  );
}

// ─── backup ──────────────────────────────────────────────────────────────────
async function collectSnapshot(db) {
  const [users, invites, clients, agencies] = await Promise.all(
    ["users", "invites", "clients", "agencies"].map((c) => db.collection(c).get())
  );
  const configs = await Promise.all(
    CONFIG_DOCS.map((id) => db.collection("config").doc(id).get())
  );

  /** One entry per source document: `{collection, id, data}` (raw values). */
  const entries = [];
  for (const d of users.docs) entries.push({ collection: "users", id: d.id, data: d.data() });
  for (const d of invites.docs) entries.push({ collection: "invites", id: d.id, data: d.data() });
  for (const d of agencies.docs) entries.push({ collection: "agencies", id: d.id, data: d.data() });
  for (const d of clients.docs) {
    const src = d.data();
    const data = {};
    for (const f of CLIENT_FIELDS) if (f in src) data[f] = src[f];
    entries.push({ collection: "clients", id: d.id, data });
  }
  for (const d of configs) {
    if (d.exists) entries.push({ collection: "config", id: d.id, data: d.data() });
  }
  return entries;
}

function countBy(entries) {
  const counts = {};
  for (const e of entries) counts[e.collection] = (counts[e.collection] ?? 0) + 1;
  return counts;
}

async function runBackup(db) {
  const now = new Date();
  const backupId = `auth-migration-${stamp(now)}`;
  const entries = await collectSnapshot(db);
  const counts = countBy(entries);

  // 1) Local JSON file.
  mkdirSync(BACKUP_DIR, { recursive: true });
  const file = join(BACKUP_DIR, `${backupId}.json`);
  const payload = {
    backupId,
    createdAt: now.toISOString(),
    project: FIRESTORE_PROJECT,
    clientFields: CLIENT_FIELDS,
    counts,
    entries: entries.map((e) => ({ ...e, data: toJson(e.data) })),
  };
  writeFileSync(file, JSON.stringify(payload, null, 2));
  const reread = JSON.parse(readFileSync(file, "utf8"));
  if (reread.entries.length !== entries.length) {
    throw new Error(`Local file check failed: ${reread.entries.length}/${entries.length} entries.`);
  }

  // 2) Firestore copy: header + one doc per source document (keeps each write
  //    far below the 1 MB document limit).
  const header = db.collection(BACKUP_COLLECTION).doc(backupId);
  await header.set({
    backupId,
    kind: "AUTH_MIGRATION",
    createdAt: admin.firestore.Timestamp.fromDate(now),
    clientFields: CLIENT_FIELDS,
    counts,
    total: entries.length,
    complete: false,
  });
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = db.batch();
    for (const e of entries.slice(i, i + BATCH_SIZE)) {
      // Doc ids may contain '@' and '.', never '/', so `{collection}__{id}` is safe.
      batch.set(header.collection(BACKUP_DOCS).doc(`${e.collection}__${e.id}`), e);
    }
    await batch.commit();
  }
  const stored = (await header.collection(BACKUP_DOCS).count().get()).data().count;
  if (stored !== entries.length) {
    throw new Error(`Firestore copy check failed: ${stored}/${entries.length} docs.`);
  }
  await header.update({ complete: true });

  console.log(`Backup ${backupId} OK.`);
  for (const [c, n] of Object.entries(counts)) console.log(`  ${c.padEnd(9)} ${n}`);
  console.log(`  local:     ${file}`);
  console.log(`  firestore: ${BACKUP_COLLECTION}/${backupId} (${stored} docs)`);
}

// ─── entry point ─────────────────────────────────────────────────────────────
async function main() {
  if (has("--dry-run") || has("--commit") || has("--rollback")) {
    console.error("--dry-run / --commit / --rollback are not implemented yet (Phase 6).");
    process.exit(1);
  }
  if (!has("--backup")) {
    console.log("Usage: node scripts/migrate-auth.mjs --backup");
    process.exit(0);
  }
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: FIRESTORE_PROJECT,
  });
  await runBackup(admin.firestore());
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
