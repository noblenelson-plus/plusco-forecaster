// filepath: scripts/migrate-auth.mjs
/**
 * User & access management rebuild — data migration.
 *
 * Moves from uid-keyed users with roles VIEWER/BUSINESS_LEAD/EXEC/ADMIN,
 * invites and per-user client lists (assignedClients / assignedAgencies) to:
 *   - users/{email} (lowercase), role USER | ADMIN;
 *   - client teams (CL_Business_Lead, CL_Digital_Lead, GM Pod,
 *     CL_Collaborators) resolved into CL_Team_Emails on each client;
 *   - config/dashboard_access (per-dashboard GLOBAL/AGENCY mode + grants).
 * Mirrors lib/format/client-team.ts (computeTeamEmails) and
 * lib/format/email.ts; GM_POD_EMAILS is read from client.constants.ts.
 *
 * Modes (every writing mode needs --commit; without it, it only reports):
 *   --backup                Snapshot users, invites, agencies, client team
 *                           fields and access configs to a local JSON file
 *                           (scripts/backups/, gitignored) and to
 *                           auth_migration_backups/{id} in Firestore.
 *   (no flag) / --dry-run   Compute the migration and write the review report
 *                           (scripts/backups/auth-migration-plan-*.json/.txt).
 *   --commit                Take a fresh backup, then apply the migration.
 *                           Additive: new users/{email} docs, client
 *                           CL_Collaborators / CL_Team_Emails (+ normalized
 *                           BL/DL), config/dashboard_access (only if absent),
 *                           pluscompanymedia.com as a company domain. The old
 *                           users/{uid} docs and invites stay until --cleanup,
 *                           so the live app keeps working until the cutover.
 *   --cleanup [--commit]    After the rules + app cutover: delete invites,
 *                           the old users/{uid} docs and config/dashboard_pages.
 *   --rollback FILE [--commit]
 *                           Restore users, invites, client team fields and the
 *                           access configs from a backup file; removes users
 *                           docs, client fields and configs the backup lacks.
 *
 * Idempotent: re-running --commit changes nothing already migrated (existing
 * users/{email} docs and config/dashboard_access are never overwritten).
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
const HERE = dirname(fileURLToPath(import.meta.url));
const BACKUP_DIR = join(HERE, "backups");
const MIGRATED_BY = "migrate-auth";

/** Client fields the migration reads or rewrites (and backs up). */
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
const CONFIG_DOCS = ["company_domains", "dashboard_pages", "dashboard_access"];
const GRANTABLE_DASHBOARDS = ["labs-pacing", "exec-kpis", "mediaocean", "mediabox", "reports"];
/**
 * A person's old assignedClients covering at least this share of an agency's
 * clients are treated as agency-wide access (dropped, like assignedAgencies),
 * not as explicit grants to turn into collaborators.
 */
const AGENCY_WIDE_SHARE = 0.5;
/** Company-wide domains the plan requires ("all agencies" on Agency dashboards). */
const PLUS_DOMAINS = ["pluscompany.com", "pluscompanymedia.com"];

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const argAfter = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};

// ─── Email + team helpers (mirror lib/format/email.ts / client-team.ts) ──────
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const normalizeEmail = (v) => String(v ?? "").trim().toLowerCase();
const isValidEmail = (v) => EMAIL_RE.test(normalizeEmail(v));
const normalizeEmailList = (values) =>
  [...new Set([...values].map(normalizeEmail).filter((e) => EMAIL_RE.test(e)))].sort();
const normTeamValue = (v) => {
  const s = String(v ?? "").trim();
  return s.includes("@") ? s.toLowerCase() : s;
};

/** GM_POD_EMAILS, parsed from the TS source so there is one copy of it. */
function loadGmPodEmails() {
  const src = readFileSync(join(HERE, "..", "lib", "constants", "client.constants.ts"), "utf8");
  const block = /export const GM_POD_EMAILS[^=]*=\s*\{([\s\S]*?)\n\};/.exec(src);
  if (!block) throw new Error("GM_POD_EMAILS not found in client.constants.ts");
  const out = {};
  for (const m of block[1].matchAll(/"([^"]+)"\s*:\s*\[([^\]]*)\]/g)) {
    out[m[1]] = [...m[2].matchAll(/"([^"]+)"/g)].map((x) => x[1].toLowerCase());
  }
  if (Object.keys(out).length === 0) throw new Error("GM_POD_EMAILS parsed empty");
  return out;
}
const GM_POD_EMAILS = loadGmPodEmails();

const computeTeamEmails = (c) =>
  normalizeEmailList([
    c.CL_Business_Lead,
    c.CL_Digital_Lead,
    ...(GM_POD_EMAILS[c.GM_Pod] ?? []),
    ...(c.CL_Collaborators ?? []),
  ]);

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
function fromJson(value) {
  if (Array.isArray(value)) return value.map(fromJson);
  if (value && typeof value === "object") {
    if (Object.keys(value).length === 1 && typeof value.__timestamp === "string") {
      return admin.firestore.Timestamp.fromDate(new Date(value.__timestamp));
    }
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fromJson(v)]));
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

const ms = (ts) => (ts instanceof admin.firestore.Timestamp ? ts.toMillis() : 0);

/** Commits `ops` (functions taking a batch) in batches of BATCH_SIZE. */
async function commitOps(db, ops) {
  for (let i = 0; i < ops.length; i += BATCH_SIZE) {
    const batch = db.batch();
    ops.slice(i, i + BATCH_SIZE).forEach((op) => op(batch));
    await batch.commit();
  }
}

// ─── Backup ──────────────────────────────────────────────────────────────────
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
  await commitOps(
    db,
    entries.map((e) => (batch) =>
      // Doc ids may contain '@' and '.', never '/', so `{collection}__{id}` is safe.
      batch.set(header.collection(BACKUP_DOCS).doc(`${e.collection}__${e.id}`), e)
    )
  );
  const stored = (await header.collection(BACKUP_DOCS).count().get()).data().count;
  if (stored !== entries.length) {
    throw new Error(`Firestore copy check failed: ${stored}/${entries.length} docs.`);
  }
  await header.update({ complete: true });

  console.log(`Backup ${backupId} OK.`);
  for (const [c, n] of Object.entries(counts)) console.log(`  ${c.padEnd(9)} ${n}`);
  console.log(`  local:     ${file}`);
  console.log(`  firestore: ${BACKUP_COLLECTION}/${backupId} (${stored} docs)`);
  return file;
}

// ─── Plan ────────────────────────────────────────────────────────────────────
async function buildPlan(db) {
  const [usersSnap, invitesSnap, clientsSnap, agenciesSnap, companySnap, pagesSnap, accessSnap] =
    await Promise.all([
      db.collection("users").get(),
      db.collection("invites").get(),
      db.collection("clients").get(),
      db.collection("agencies").get(),
      db.collection("config").doc("company_domains").get(),
      db.collection("config").doc("dashboard_pages").get(),
      db.collection("config").doc("dashboard_access").get(),
    ]);

  const issues = [];
  const existingEmailDocs = new Set(usersSnap.docs.filter((d) => d.id.includes("@")).map((d) => d.id));
  const legacyUsers = usersSnap.docs.filter((d) => !d.id.includes("@"));

  // Step 1 — users/{email} from the old uid-keyed docs (merge duplicates:
  // ADMIN wins, latest sign-in wins for the profile fields).
  const newUsers = new Map(); // email → { data, sources[] }
  for (const d of legacyUsers) {
    const u = d.data();
    const email = normalizeEmail(u.email);
    if (!isValidEmail(email)) {
      issues.push(`users/${d.id}: no valid email ("${u.email ?? ""}") — skipped`);
      continue;
    }
    const role = u.role === "ADMIN" ? "ADMIN" : "USER";
    const candidate = {
      email,
      uid: d.id,
      displayName: u.displayName ?? null,
      photoURL: u.photoURL ?? null,
      role,
      lastLoginAt: u.lastLoginAt ?? null,
      createdAt: u.createdAt ?? null,
      createdBy: null,
      ...(u.disabled === true ? { disabled: true } : {}),
    };
    const prev = newUsers.get(email);
    if (!prev) {
      newUsers.set(email, { data: candidate, sources: [`users/${d.id} (${u.role})`], oldRole: u.role });
    } else {
      issues.push(`${email}: several uid docs (${prev.sources.join(", ")}, users/${d.id}) — merged`);
      const newer = ms(candidate.lastLoginAt) > ms(prev.data.lastLoginAt) ? candidate : prev.data;
      newUsers.set(email, {
        data: { ...newer, role: prev.data.role === "ADMIN" || role === "ADMIN" ? "ADMIN" : "USER" },
        sources: [...prev.sources, `users/${d.id} (${u.role})`],
        oldRole: prev.oldRole === "ADMIN" ? "ADMIN" : u.role,
      });
    }
  }

  // Step 2 — pending invites → users rows added by hand (never signed in).
  for (const d of invitesSnap.docs) {
    const v = d.data();
    const email = normalizeEmail(d.id);
    if (!isValidEmail(email)) {
      issues.push(`invites/${d.id}: not an email — skipped`);
      continue;
    }
    if (newUsers.has(email)) continue; // signed in since; the user doc wins
    newUsers.set(email, {
      data: {
        email,
        uid: null,
        displayName: null,
        photoURL: null,
        role: v.role === "ADMIN" ? "ADMIN" : "USER",
        lastLoginAt: null,
        createdAt: v.createdAt ?? null,
        createdBy: isValidEmail(v.createdBy) ? normalizeEmail(v.createdBy) : MIGRATED_BY,
      },
      sources: [`invites/${d.id} (${v.role})`],
      oldRole: v.role,
    });
  }

  // Grants to convert: the assignedClients of non-admin users and invites
  // (admins see every client anyway).
  const grants = []; // { email, clIds, source }
  for (const d of legacyUsers) {
    const u = d.data();
    const email = normalizeEmail(u.email);
    if (u.role === "ADMIN") continue;
    if (isValidEmail(email) && Array.isArray(u.assignedClients) && u.assignedClients.length) {
      grants.push({ email, clIds: u.assignedClients, source: `users/${d.id}` });
    }
  }
  for (const d of invitesSnap.docs) {
    const v = d.data();
    const email = normalizeEmail(d.id);
    if (v.role === "ADMIN") continue;
    if (isValidEmail(email) && Array.isArray(v.assignedClients) && v.assignedClients.length) {
      grants.push({ email, clIds: v.assignedClients, source: `invites/${d.id}` });
    }
  }

  // Step 3 — collaborators: an explicit grant not already covered by the team.
  // Grants covering ≥ AGENCY_WIDE_SHARE of an agency's clients are agency-wide
  // access (dropped — dashboards grant reading by agency instead).
  const clients = new Map(clientsSnap.docs.map((d) => [d.id, { id: d.id, ...d.data() }]));
  const agencyTotals = {};
  for (const c of clients.values()) agencyTotals[c.CL_Agency] = (agencyTotals[c.CL_Agency] ?? 0) + 1;
  const agencyWide = new Map(); // source → Set(agency)
  for (const g of grants) {
    const perAgency = {};
    for (const clId of new Set(g.clIds)) {
      const c = clients.get(clId);
      if (c) perAgency[c.CL_Agency] = (perAgency[c.CL_Agency] ?? 0) + 1;
    }
    const wide = Object.entries(perAgency)
      .filter(([a, n]) => n / agencyTotals[a] >= AGENCY_WIDE_SHARE)
      .map(([a]) => a);
    if (wide.length) agencyWide.set(g.source, new Set(wide));
  }
  const droppedAgencyWide = []; // { email, agency, count }
  for (const g of grants) {
    for (const a of agencyWide.get(g.source) ?? []) {
      const count = g.clIds.filter((id) => clients.get(id)?.CL_Agency === a).length;
      droppedAgencyWide.push({ email: g.email, agency: a, count });
    }
  }
  const addCollab = new Map(); // clId → Set(email)
  const collaborations = []; // { email, clId, clName }
  let alreadyOnTeam = 0;
  for (const g of grants) {
    for (const clId of g.clIds) {
      const c = clients.get(clId);
      if (!c) {
        issues.push(`${g.source}: assigned client "${clId}" does not exist — dropped`);
        continue;
      }
      if (agencyWide.get(g.source)?.has(c.CL_Agency)) continue;
      const baseTeam = computeTeamEmails({ ...c, CL_Collaborators: [] });
      const existing = normalizeEmailList(c.CL_Collaborators ?? []);
      if (baseTeam.includes(g.email) || existing.includes(g.email)) {
        alreadyOnTeam++;
        continue;
      }
      let set = addCollab.get(clId);
      if (!set) addCollab.set(clId, (set = new Set()));
      if (!set.has(g.email)) {
        set.add(g.email);
        collaborations.push({ email: g.email, clId, clName: c.CL_Name ?? clId });
      }
    }
  }

  // Step 4 — CL_Team_Emails (+ normalized BL / DL, merged collaborators).
  const clientUpdates = []; // { clId, name, update, teamBefore, teamAfter }
  const teamEmails = new Set();
  for (const c of clients.values()) {
    const collaborators = normalizeEmailList([
      ...(c.CL_Collaborators ?? []),
      ...(addCollab.get(c.id) ?? []),
    ]);
    const bl = normTeamValue(c.CL_Business_Lead);
    const dl = normTeamValue(c.CL_Digital_Lead);
    const team = computeTeamEmails({ ...c, CL_Business_Lead: bl, CL_Digital_Lead: dl, CL_Collaborators: collaborators });
    team.forEach((e) => teamEmails.add(e));
    for (const [field, v] of [["CL_Business_Lead", c.CL_Business_Lead], ["CL_Digital_Lead", c.CL_Digital_Lead]]) {
      if (v && String(v).trim() && !isValidEmail(v)) {
        issues.push(`clients/${c.id} (${c.CL_Name}): ${field} "${v}" is not an email — ignored for access`);
      }
    }
    const update = {};
    if ((c.CL_Business_Lead ?? "") !== bl) update.CL_Business_Lead = bl;
    if ((c.CL_Digital_Lead ?? "") !== dl && c.CL_Digital_Lead !== undefined) update.CL_Digital_Lead = dl;
    if (JSON.stringify(c.CL_Collaborators ?? null) !== JSON.stringify(collaborators)) {
      update.CL_Collaborators = collaborators;
    }
    if (JSON.stringify(c.CL_Team_Emails ?? null) !== JSON.stringify(team)) update.CL_Team_Emails = team;
    if (Object.keys(update).length) {
      clientUpdates.push({ clId: c.id, name: c.CL_Name ?? c.id, update, teamBefore: c.CL_Team_Emails ?? null, teamAfter: team });
    }
  }

  // Step 5 — a users row for every team email (so the drawer pickers list
  // them), added as "never signed in".
  for (const email of teamEmails) {
    if (newUsers.has(email) || existingEmailDocs.has(email)) continue;
    newUsers.set(email, {
      data: {
        email,
        uid: null,
        displayName: null,
        photoURL: null,
        role: "USER",
        lastLoginAt: null,
        createdAt: null,
        createdBy: MIGRATED_BY,
      },
      sources: ["client team (no account yet)"],
      oldRole: null,
    });
  }
  const usersToCreate = [...newUsers.values()].filter((u) => !existingEmailDocs.has(u.data.email));

  // Step 6 — config/dashboard_access defaults (only if absent): every
  // dashboard in AGENCY mode, open to every agency domain + the Plus domains;
  // the sub-tabs hidden from every role today stay hidden.
  const companyDomains = companySnap.exists ? (companySnap.data().domains ?? []).map(normalizeEmail) : [];
  const agencyDomains = agenciesSnap.docs.flatMap((d) => (d.data().domains ?? []).map(normalizeEmail));
  const allDomains = [...new Set([...agencyDomains, ...companyDomains, ...PLUS_DOMAINS])].filter(Boolean).sort();
  const pages = pagesSnap.exists ? pagesSnap.data() : {};
  const hiddenSubtabs = [
    ...new Set([
      ...(pages.hidden ?? []),
      ...Object.entries(pages.access ?? {})
        .filter(([, roles]) => Array.isArray(roles) && roles.length === 0)
        .map(([id]) => id),
    ]),
  ]
    .filter((id) => typeof id === "string" && id.includes("/"))
    .sort();
  const dashboardAccess = accessSnap.exists
    ? null
    : {
        dashboards: Object.fromEntries(
          GRANTABLE_DASHBOARDS.map((id) => [id, { mode: "AGENCY", domains: allDomains, users: [] }])
        ),
        hiddenSubtabs,
      };

  // Step 7 — company-wide domains.
  const addCompanyDomains = PLUS_DOMAINS.filter((d) => !companyDomains.includes(d));

  // Former-role summary (who changes).
  const roleChanges = {};
  for (const u of newUsers.values()) {
    const key = `${u.oldRole ?? "(none)"} → ${u.data.role}`;
    roleChanges[key] = (roleChanges[key] ?? 0) + 1;
  }

  return {
    usersToCreate,
    existingEmailDocs: [...existingEmailDocs],
    legacyUserIds: legacyUsers.map((d) => d.id),
    inviteIds: invitesSnap.docs.map((d) => d.id),
    collaborations,
    alreadyOnTeam,
    droppedAgencyWide,
    clientUpdates,
    dashboardAccess,
    dashboardAccessExists: accessSnap.exists,
    addCompanyDomains,
    roleChanges,
    issues,
  };
}

function writeReport(plan) {
  mkdirSync(BACKUP_DIR, { recursive: true });
  const base = join(BACKUP_DIR, `auth-migration-plan-${stamp(new Date())}`);
  const lines = [];
  const L = (s = "") => lines.push(s);
  L("AUTH MIGRATION — DRY RUN REPORT");
  L(`Generated ${new Date().toISOString()}`);
  L();
  L("SUMMARY");
  L(`  users/{email} docs to create : ${plan.usersToCreate.length}`);
  const bySource = {};
  for (const u of plan.usersToCreate) {
    const k = u.sources[0].startsWith("users/") ? "from signed-in accounts" : u.sources[0].startsWith("invites/") ? "from pending invites" : "team members with no account";
    bySource[k] = (bySource[k] ?? 0) + 1;
  }
  for (const [k, n] of Object.entries(bySource)) L(`      ${k.padEnd(30)} ${n}`);
  L(`  users/{email} already present : ${plan.existingEmailDocs.length} (left untouched)`);
  L(`  role changes                  : ${Object.entries(plan.roleChanges).map(([k, n]) => `${k}: ${n}`).join(" · ")}`);
  L(`  collaborators to add          : ${plan.collaborations.length} for ${new Set(plan.collaborations.map((c) => c.email)).size} people (grants already covered by the team: ${plan.alreadyOnTeam})`);
  L(`  agency-wide grants dropped    : ${plan.droppedAgencyWide.reduce((n, d) => n + d.count, 0)} client grants, ${plan.droppedAgencyWide.length} person × agency pairs (≥ ${AGENCY_WIDE_SHARE * 100}% of the agency; admins' grants skipped too)`);
  L(`  clients to update             : ${plan.clientUpdates.length}`);
  L(`  config/dashboard_access       : ${plan.dashboardAccess ? "create with defaults" : "already exists — left untouched"}`);
  L(`  company domains to add        : ${plan.addCompanyDomains.join(", ") || "none"}`);
  L(`  later, --cleanup deletes      : ${plan.inviteIds.length} invites, ${plan.legacyUserIds.length} old users/{uid} docs, config/dashboard_pages`);
  L(`  issues                        : ${plan.issues.length}`);
  L();
  if (plan.dashboardAccess) {
    L("DASHBOARD ACCESS DEFAULTS");
    L(`  every dashboard: AGENCY mode, domains = ${plan.dashboardAccess.dashboards["labs-pacing"].domains.join(", ")}`);
    L(`  sub-tabs hidden (admins only): ${plan.dashboardAccess.hiddenSubtabs.join(", ") || "none"}`);
    L();
  }
  L("AGENCY-WIDE GRANTS DROPPED (person: agency × clients held)");
  for (const d of [...plan.droppedAgencyWide].sort((a, b) => a.email.localeCompare(b.email))) {
    L(`  ${d.email}: ${d.agency} × ${d.count}`);
  }
  L();
  L("COLLABORATORS (person → client), from former explicit client assignments");
  const byEmail = new Map();
  for (const c of plan.collaborations) {
    if (!byEmail.has(c.email)) byEmail.set(c.email, []);
    byEmail.get(c.email).push(c.clName);
  }
  for (const [email, names] of [...byEmail].sort()) {
    L(`  ${email} (${names.length}): ${names.sort().join(", ")}`);
  }
  L();
  L("USERS TO CREATE");
  for (const u of [...plan.usersToCreate].sort((a, b) => a.data.email.localeCompare(b.data.email))) {
    L(`  ${u.data.email.padEnd(45)} ${u.data.role.padEnd(5)} ${u.data.uid ? "signed in" : "never signed in"}  ← ${u.sources.join("; ")}`);
  }
  L();
  L("ISSUES");
  for (const i of plan.issues) L(`  - ${i}`);
  writeFileSync(`${base}.txt`, lines.join("\n"));
  writeFileSync(`${base}.json`, JSON.stringify(toJson(plan), null, 2));
  return { txt: `${base}.txt`, json: `${base}.json`, summary: lines.slice(0, lines.indexOf("AGENCY-WIDE GRANTS DROPPED (person: agency × clients held)")) };
}

async function applyPlan(db, plan) {
  const ops = [];
  for (const u of plan.usersToCreate) {
    const data = { ...u.data };
    if (data.createdAt === null) data.createdAt = admin.firestore.FieldValue.serverTimestamp();
    // create() fails if the doc appeared since the plan — never overwrite.
    ops.push((b) => b.create(db.collection("users").doc(data.email), data));
  }
  for (const c of plan.clientUpdates) {
    ops.push((b) => b.update(db.collection("clients").doc(c.clId), c.update));
  }
  if (plan.dashboardAccess) {
    ops.push((b) => b.create(db.collection("config").doc("dashboard_access"), {
      ...plan.dashboardAccess,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }));
  }
  if (plan.addCompanyDomains.length) {
    ops.push((b) => b.set(
      db.collection("config").doc("company_domains"),
      { domains: admin.firestore.FieldValue.arrayUnion(...plan.addCompanyDomains) },
      { merge: true }
    ));
  }
  await commitOps(db, ops);
  console.log(`Applied ${ops.length} writes.`);
}

// ─── Cleanup ─────────────────────────────────────────────────────────────────
async function runCleanup(db, commit) {
  const [users, invites, pages] = await Promise.all([
    db.collection("users").get(),
    db.collection("invites").get(),
    db.collection("config").doc("dashboard_pages").get(),
  ]);
  const legacy = users.docs.filter((d) => !d.id.includes("@"));
  // Never delete a uid doc whose email has no users/{email} doc yet.
  const emailDocs = new Set(users.docs.filter((d) => d.id.includes("@")).map((d) => d.id));
  const orphan = legacy.filter((d) => !emailDocs.has(normalizeEmail(d.data().email)));
  const deletable = legacy.filter((d) => emailDocs.has(normalizeEmail(d.data().email)));
  console.log(`Cleanup: ${invites.size} invites, ${deletable.length} old users/{uid} docs, config/dashboard_pages ${pages.exists ? "present" : "absent"}.`);
  if (orphan.length) {
    const sample = orphan.slice(0, 5).map((d) => d.id).join(", ");
    console.log(`  Kept ${orphan.length} uid docs with no users/{email} counterpart (run --commit first?), e.g. ${sample}`);
  }
  if (!commit) {
    console.log("Nothing deleted. Re-run with --cleanup --commit.");
    return;
  }
  const ops = [
    ...invites.docs.map((d) => (b) => b.delete(d.ref)),
    ...deletable.map((d) => (b) => b.delete(d.ref)),
    ...(pages.exists ? [(b) => b.delete(pages.ref)] : []),
  ];
  await commitOps(db, ops);
  console.log(`Deleted ${ops.length} docs.`);
}

// ─── Rollback ────────────────────────────────────────────────────────────────
async function runRollback(db, file, commit) {
  const backup = JSON.parse(readFileSync(file, "utf8"));
  const entries = backup.entries.map((e) => ({ ...e, data: fromJson(e.data) }));
  const byCol = (c) => entries.filter((e) => e.collection === c);
  const [users, invites, clients] = await Promise.all(
    ["users", "invites", "clients"].map((c) => db.collection(c).get())
  );
  const backedUsers = new Set(byCol("users").map((e) => e.id));
  const backedInvites = new Set(byCol("invites").map((e) => e.id));
  const backedConfigs = new Set(byCol("config").map((e) => e.id));
  const del = admin.firestore.FieldValue.delete();

  const ops = [];
  for (const d of users.docs) if (!backedUsers.has(d.id)) ops.push((b) => b.delete(d.ref));
  for (const d of invites.docs) if (!backedInvites.has(d.id)) ops.push((b) => b.delete(d.ref));
  for (const e of byCol("users")) ops.push((b) => b.set(db.collection("users").doc(e.id), e.data));
  for (const e of byCol("invites")) ops.push((b) => b.set(db.collection("invites").doc(e.id), e.data));
  const existingClients = new Set(clients.docs.map((d) => d.id));
  for (const e of byCol("clients")) {
    if (!existingClients.has(e.id)) continue; // deleted since — not recreated
    const update = {};
    for (const f of backup.clientFields ?? CLIENT_FIELDS) update[f] = f in e.data ? e.data[f] : del;
    ops.push((b) => b.update(db.collection("clients").doc(e.id), update));
  }
  for (const id of CONFIG_DOCS) {
    const e = byCol("config").find((x) => x.id === id);
    const ref = db.collection("config").doc(id);
    ops.push(e ? (b) => b.set(ref, e.data) : (b) => b.delete(ref));
  }
  console.log(
    `Rollback from ${backup.backupId}: ${ops.length} writes ` +
      `(users ${backedUsers.size}, invites ${backedInvites.size}, clients ${byCol("clients").length}, ` +
      `configs restored: ${[...backedConfigs].join(", ") || "none"}).`
  );
  if (!commit) {
    console.log("Nothing written. Re-run with --rollback FILE --commit.");
    return;
  }
  await commitOps(db, ops);
  console.log("Rollback applied.");
}

// ─── Entry point ─────────────────────────────────────────────────────────────
async function main() {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: FIRESTORE_PROJECT,
  });
  const db = admin.firestore();
  const commit = has("--commit");

  if (has("--backup")) {
    await runBackup(db);
  } else if (has("--rollback")) {
    const file = argAfter("--rollback");
    if (!file) throw new Error("--rollback needs a backup file path.");
    await runRollback(db, file, commit);
  } else if (has("--cleanup")) {
    await runCleanup(db, commit);
  } else {
    if (commit) {
      console.log("Taking a fresh backup before writing…");
      await runBackup(db);
    }
    const plan = await buildPlan(db);
    const report = writeReport(plan);
    console.log(report.summary.join("\n"));
    console.log(`Full report: ${report.txt}`);
    if (commit) await applyPlan(db, plan);
    else console.log("Dry run — nothing written. Review the report, then re-run with --commit.");
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
