// scripts/migrate-client-access.mjs
//
// One-off migration: imports client access assignments from a CSV of
// (Client_ID, Email) rows into `users/{uid}.assignedClients` — the single
// source of truth for user↔client access (see assignment-service.ts).
//
// Usage:
//   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json   # or gcloud ADC
//   node scripts/migrate-client-access.mjs "/path/to/Client_Access.csv"            # dry run
//   node scripts/migrate-client-access.mjs "/path/to/Client_Access.csv" --apply    # write
//   node scripts/migrate-client-access.mjs "/path/to/Client_Access.csv" --apply --replace
//   node scripts/migrate-client-access.mjs "/path/to/Client_Access.csv" --apply --provision
//
// Behavior:
//   - Default is MERGE: the CSV's clients are added to each user's existing
//     assignedClients (union, no removal). --replace overwrites the whole
//     array with exactly the CSV's set for the users present in the CSV.
//   - Emails are matched case-insensitively against the `email` field of the
//     users collection. Emails with no user doc are reported and skipped —
//     a profile only exists after the person's first login — UNLESS
//     --provision is passed: then a Firebase Auth account (if absent) and a
//     BUSINESS_LEAD profile doc are created up front with the CSV's clients.
//     When the person later signs in with Google using that email, Firebase
//     attaches the provider to the same uid and ensureUserProfile leaves the
//     existing doc (and its assignedClients) untouched.
//   - Client_IDs absent from the `clients` collection are reported; their
//     rows are skipped so a typo can't grant access to nothing.

import { readFileSync } from "node:fs";
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

const [, , csvPath, ...flags] = process.argv;
const APPLY = flags.includes("--apply");
const REPLACE = flags.includes("--replace");
const PROVISION = flags.includes("--provision");

if (!csvPath) {
  console.error(
    "Usage: node scripts/migrate-client-access.mjs <csv-path> [--apply] [--replace]"
  );
  process.exit(1);
}

// ── Parse the CSV (Client_ID, Email) ─────────────────────────────────────────

const lines = readFileSync(csvPath, "utf8").trim().split(/\r?\n/).slice(1);
const clientsByEmail = new Map(); // email(lower) → Set<clientId>
const badRows = [];

lines.forEach((line, i) => {
  const row = i + 2; // 1-based, after header
  const [clientId, email] = line.split(",").map((s) => s?.trim());
  if (!clientId || !email || !email.includes("@")) {
    badRows.push(`row ${row}: unparseable line "${line}"`);
    return;
  }
  const key = email.toLowerCase();
  const set = clientsByEmail.get(key) ?? new Set();
  set.add(clientId);
  clientsByEmail.set(key, set);
});

// ── Verify against Firestore & write ─────────────────────────────────────────

initializeApp({ credential: applicationDefault() });
const db = getFirestore();

const [usersSnap, clientsSnap] = await Promise.all([
  db.collection("users").get(),
  db.collection("clients").get(),
]);

const userByEmail = new Map(); // email(lower) → user doc
for (const doc of usersSnap.docs) {
  const email = (doc.data().email ?? "").toLowerCase();
  if (email) userByEmail.set(email, doc);
}
const knownClientIds = new Set(clientsSnap.docs.map((d) => d.id));

const unknownClientIds = new Set();
const missingUsers = [];
let updated = 0;
let unchanged = 0;
let provisioned = 0;

for (const [email, wantedRaw] of clientsByEmail) {
  // Drop client ids that don't exist.
  const wanted = [...wantedRaw].filter((id) => {
    if (knownClientIds.has(id)) return true;
    unknownClientIds.add(id);
    return false;
  });

  let userDoc = userByEmail.get(email);
  if (!userDoc && PROVISION) {
    if (APPLY) {
      // Reuse the Auth account when it already exists (doc-less), else create.
      const auth = getAuth();
      let uid;
      try {
        uid = (await auth.getUserByEmail(email)).uid;
      } catch {
        uid = (await auth.createUser({ email })).uid;
      }
      // Same shape as ensureUserProfile's first-login doc; lastLoginAt stays
      // null until the person actually signs in.
      await db.collection("users").doc(uid).set({
        email,
        displayName: null,
        photoURL: null,
        role: "BUSINESS_LEAD",
        assignedClients: [...new Set(wanted)].sort(),
        createdAt: FieldValue.serverTimestamp(),
        lastLoginAt: null,
      });
      provisioned++;
      console.log(`PROVISIONED ${email}: ${wanted.length} clients (uid ${uid})`);
    } else {
      provisioned++;
      console.log(`would provision ${email}: ${wanted.length} clients`);
    }
    continue;
  }
  if (!userDoc) {
    missingUsers.push(`${email} (${wanted.length} clients)`);
    continue;
  }

  const existing = userDoc.data().assignedClients ?? [];
  const next = REPLACE
    ? [...new Set(wanted)].sort()
    : [...new Set([...existing, ...wanted])].sort();

  const same =
    next.length === existing.length &&
    [...existing].sort().every((v, i) => v === next[i]);
  if (same) {
    unchanged++;
    continue;
  }

  if (APPLY) {
    await userDoc.ref.update({ assignedClients: next });
  }
  updated++;
  const added = next.filter((id) => !existing.includes(id));
  const removed = existing.filter((id) => !next.includes(id));
  console.log(
    `${APPLY ? "WROTE" : "would write"} ${email}: ${existing.length} → ${next.length} clients` +
      (added.length ? ` (+${added.length}: ${added.join(", ")})` : "") +
      (removed.length ? ` (−${removed.length}: ${removed.join(", ")})` : "")
  );
}

// ── Report ───────────────────────────────────────────────────────────────────

console.log(
  `\n${APPLY ? "Applied" : "Dry run"} (${REPLACE ? "REPLACE" : "MERGE"}) — ` +
    `${updated} user(s) ${APPLY ? "updated" : "to update"}, ${unchanged} already up to date` +
    (PROVISION ? `, ${provisioned} ${APPLY ? "provisioned" : "to provision"}` : "") +
    "."
);
if (badRows.length) {
  console.log(`\nUnparseable CSV rows (${badRows.length}):`);
  badRows.forEach((s) => console.log("  " + s));
}
if (unknownClientIds.size) {
  console.log(
    `\nClient_IDs not found in the clients collection (${unknownClientIds.size}, rows skipped): ` +
      [...unknownClientIds].join(", ")
  );
}
if (missingUsers.length) {
  console.log(
    `\nEmails with no user profile yet (${missingUsers.length}) — they get their doc on first login; re-run afterwards:`
  );
  missingUsers.forEach((s) => console.log("  " + s));
}
