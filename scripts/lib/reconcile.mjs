// filepath: scripts/lib/reconcile.mjs
/**
 * Shared reconcile engine for the BigQuery -> Firestore sync scripts.
 *
 * The rule every sync follows: after a run, the Firestore collection is an EXACT
 * mirror of the current BigQuery source -- updates, additions AND deletions all
 * flow through. The old syncs were upsert-only (never deleted), so removed or
 * re-keyed rows left orphaned docs that the app summed on top of the real data.
 * This module centralizes the fix so every sync gets identical behavior and
 * identical safety brakes, and a change here reaches all of them at once.
 *
 * A sync file stays thin: it declares its table/collection, fetches the rows,
 * and calls reconcileCollection() with its own doc-id function. Everything else
 * -- dedupe, orphan detection, the dry-run preview, the safety brakes, batched
 * upsert-then-delete -- lives here.
 *
 * Exports:
 *   cleanValue(v)            value coercion, identical across every sync.
 *   grainDocId(row, fields)  sha256 hash of an ordered list of grain columns.
 *   keyDocId(rawValue)       single-key id sanitizer (may return null -> skip row).
 *   reconcileFlags(argv)     parse --dry-run / --force.
 *   reconcileCollection(...) the engine. Returns { status, ...counts }.
 */

import crypto from "crypto";

// ── value coercion (identical in every existing sync) ────────────────────────
// numbers/strings/booleans pass through, bigint -> Number, BigQuery wrapper
// objects ({ value }) unwrap (numeric strings coerced to numbers), else null.
export function cleanValue(v) {
  if (v === undefined || v === null) return null;
  const t = typeof v;
  if (t === "number" || t === "string" || t === "boolean") return v;
  if (t === "bigint") return Number(v);
  if (t === "object") {
    if (v.value !== undefined && v.value !== null) {
      const inner = v.value;
      if (typeof inner === "string") {
        const n = Number(inner);
        return inner.trim() !== "" && !Number.isNaN(n) ? n : inner;
      }
      return inner;
    }
    return String(v);
  }
  return null;
}

// ── doc-id strategies ────────────────────────────────────────────────────────

/**
 * Grain-hash id: a stable sha256 over an ordered list of grain columns. Used by
 * syncs whose rows have no single-column key (mediaocean, social-partner-mix).
 * cleanValue first so the hash input matches what is stored; JSON.stringify keeps
 * null distinct from "". The field ORDER defines the hash -- it must exactly
 * match the field list the sync has always used, or ids stop lining up.
 */
export function grainDocId(row, fields) {
  const parts = fields.map((f) => cleanValue(row[f]));
  const canonical = JSON.stringify(parts);
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

/**
 * Single-key id: sanitize one key value into a Firestore doc id, or null when the
 * value is not a usable key (blank / "NULL" / "#N/A"). Used by client-keyed syncs
 * (kpi-by-client, meta-social-output). A null return means the row is skipped,
 * exactly as those syncs already do. Logic is verbatim from those scripts.
 */
export function keyDocId(rawValue) {
  if (rawValue === undefined || rawValue === null) return null;
  let id = String(rawValue).trim();
  if (id === "" || id.toUpperCase() === "NULL" || id === "#N/A") return null;
  id = id.replace(/\//g, "_");
  if (id === "." || id === "..") id = `_${id}_`;
  if (id.length > 1400) id = id.slice(0, 1400);
  return id;
}

// ── flags ────────────────────────────────────────────────────────────────────
export function reconcileFlags(argv = process.argv) {
  return {
    dryRun: argv.includes("--dry-run"),
    force: argv.includes("--force"),
  };
}

// ── the engine ───────────────────────────────────────────────────────────────

/**
 * Reconcile a Firestore collection to a set of BigQuery rows.
 *
 * @param {object}   o
 * @param {FirebaseFirestore.Firestore} o.db          initialized Firestore handle
 * @param {string}   o.collection                     target collection name
 * @param {object[]} o.rows                            current BigQuery rows
 * @param {(row:object)=>(string|null)} o.toDocId      row -> doc id (null = skip)
 * @param {{field:string,label:string,width?:number,money?:boolean}[]} [o.sampleFields]
 *                                                     columns shown in the orphan sample
 * @param {boolean}  [o.dryRun=false]                  preview only, write nothing
 * @param {boolean}  [o.force=false]                   bypass the orphan-ratio brake
 * @param {number}   [o.batchSize=450]                 Firestore batch size
 * @param {number}   [o.orphanAbortRatio=0.4]          abort above this orphan share
 * @returns {Promise<{status:'aborted'|'dry-run'|'applied', upserted:number,
 *                    deleted:number, finalSize:number, orphans:number,
 *                    skipped:number, existing:number}>}
 */
export async function reconcileCollection({
  db,
  collection,
  rows,
  toDocId,
  sampleFields = [],
  dryRun = false,
  force = false,
  batchSize = 450,
  orphanAbortRatio = 0.4,
}) {
  console.log("");
  console.log(
    dryRun
      ? "MODE: dry run  (no writes; drop --dry-run to apply)"
      : `MODE: write  (upsert + delete orphans)${force ? "  [--force: orphan brake OFF]" : ""}`
  );
  console.log(`Collection: "${collection}"`);
  console.log("");

  // Safety brake #1: never reconcile against an empty source (would wipe all).
  if (!Array.isArray(rows) || rows.length === 0) {
    console.error(
      "ABORT: source returned 0 rows. Refusing to reconcile against an empty " +
        "source -- that would delete the entire collection."
    );
    return zeroResult("aborted");
  }

  // 1. Build the current id -> data map (dedupe by id; skip null-id rows).
  const syncedAt = new Date().toISOString();
  const current = new Map();
  let duplicates = 0;
  let skipped = 0;
  for (const row of rows) {
    const id = toDocId(row);
    if (id === null || id === undefined) {
      skipped += 1;
      continue;
    }
    if (current.has(id)) duplicates += 1;
    const data = {};
    for (const [key, value] of Object.entries(row)) {
      data[key] = cleanValue(value);
    }
    data._syncedAt = syncedAt;
    current.set(id, data);
  }
  console.log(`Unique current id(s): ${current.size}`);
  if (skipped > 0) console.log(`Skipped (no usable key): ${skipped}`);
  if (duplicates > 0) {
    console.warn(`Note: ${duplicates} row(s) shared an id (collapsed, last kept).`);
  }

  // Safety brake #1b: every row skipped / no ids -> also an empty target.
  if (current.size === 0) {
    console.error(
      "ABORT: no usable ids from the source (every row skipped). Refusing to " +
        "reconcile -- that would delete the entire collection."
    );
    return zeroResult("aborted");
  }

  // 2. Snapshot existing Firestore doc ids (id-only fetch, light on reads).
  console.log(`Reading existing doc ids from "${collection}" ...`);
  const existingSnap = await db.collection(collection).select().get();
  const existingIds = existingSnap.docs.map((d) => d.id);
  const existingIdSet = new Set(existingIds);
  console.log(`Existing Firestore doc(s): ${existingIds.length}`);

  // 3. Orphans = existing ids not produced by any current row.
  const orphanIds = existingIds.filter((id) => !current.has(id));
  const newIds = [...current.keys()].filter((id) => !existingIdSet.has(id));

  console.log("");
  console.log("-- Reconcile plan ------------------------------------------");
  console.log(`  upsert (all current rows):   ${current.size}`);
  console.log(`    of which brand-new ids:    ${newIds.length}`);
  console.log(`  DELETE (orphaned docs):      ${orphanIds.length}`);
  console.log(
    `  final collection size:       ${current.size}  (was ${existingIds.length})`
  );
  console.log("------------------------------------------------------------");

  // 4. Readable sample of the orphans (full data for up to N ids).
  await printOrphanSample({ db, collection, orphanIds, sampleFields });

  // Safety brake #2: disproportionate delete set.
  const ratioExceeded =
    existingIds.length > 0 &&
    orphanIds.length / existingIds.length > orphanAbortRatio;
  const pctOrphan =
    existingIds.length > 0
      ? ((100 * orphanIds.length) / existingIds.length).toFixed(1)
      : "0.0";
  const pctLimit = (orphanAbortRatio * 100).toFixed(0);

  if (dryRun) {
    console.log("");
    if (ratioExceeded) {
      console.warn(
        `NOTE: orphans are ${pctOrphan}% of the collection (> ${pctLimit}%). In ` +
          "write mode this would ABORT unless you pass --force."
      );
      console.log("");
    }
    console.log(
      "Dry run complete. Nothing was written. Drop --dry-run to upsert the " +
        "current rows and delete the orphans above."
    );
    return {
      status: "dry-run",
      upserted: 0,
      deleted: 0,
      finalSize: existingIds.length,
      orphans: orphanIds.length,
      skipped,
      existing: existingIds.length,
    };
  }

  if (ratioExceeded && !force) {
    console.error("");
    console.error(
      `ABORT: orphans are ${pctOrphan}% of the collection (> ${pctLimit}%). ` +
        "That is a lot to delete -- refusing as a safety brake."
    );
    console.error("  If expected, review with --dry-run, then re-run with --force.");
    console.error(
      "  If not, the source may have come back short (a mid-rebuild or failed " +
        "query) -- check it before forcing."
    );
    return {
      status: "aborted",
      upserted: 0,
      deleted: 0,
      finalSize: existingIds.length,
      orphans: orphanIds.length,
      skipped,
      existing: existingIds.length,
    };
  }

  // 5a. Upsert every current row FIRST, so the app never reads an empty window.
  console.log("");
  console.log("Applying: upserting current rows ...");
  const docs = [...current.entries()].map(([id, data]) => ({ id, data }));
  let upserted = 0;
  for (let i = 0; i < docs.length; i += batchSize) {
    const slice = docs.slice(i, i + batchSize);
    const batch = db.batch();
    for (const { id, data } of slice) {
      batch.set(db.collection(collection).doc(id), data);
    }
    await batch.commit();
    upserted += slice.length;
    console.log(`  upserted ${upserted}/${docs.length}`);
  }

  // 5b. THEN delete the orphans.
  console.log("Applying: deleting orphaned docs ...");
  let deleted = 0;
  for (let i = 0; i < orphanIds.length; i += batchSize) {
    const slice = orphanIds.slice(i, i + batchSize);
    const batch = db.batch();
    for (const id of slice) {
      batch.delete(db.collection(collection).doc(id));
    }
    await batch.commit();
    deleted += slice.length;
    console.log(`  deleted ${deleted}/${orphanIds.length}`);
  }

  console.log("");
  console.log(
    `Done. Upserted ${upserted} row(s), deleted ${deleted} orphan(s). ` +
      `Collection "${collection}" now mirrors the source (${current.size} docs).`
  );
  return {
    status: "applied",
    upserted,
    deleted,
    finalSize: current.size,
    orphans: orphanIds.length,
    skipped,
    existing: existingIds.length,
  };
}

// ── helpers ──────────────────────────────────────────────────────────────────

function zeroResult(status) {
  return {
    status,
    upserted: 0,
    deleted: 0,
    finalSize: 0,
    orphans: 0,
    skipped: 0,
    existing: 0,
  };
}

async function printOrphanSample({ db, collection, orphanIds, sampleFields }) {
  const SAMPLE = 15;
  const ids = orphanIds.slice(0, SAMPLE);
  if (ids.length === 0) return;
  if (!sampleFields || sampleFields.length === 0) {
    console.log("");
    console.log(`Sample of orphaned doc ids (first ${ids.length}):`);
    for (const id of ids) console.log(`  ${id}`);
    return;
  }
  const refs = ids.map((id) => db.collection(collection).doc(id));
  const docs = await db.getAll(...refs);
  console.log("");
  console.log(`Sample of orphaned docs (first ${ids.length}):`);
  const header = sampleFields
    .map((f) => (f.money ? f.label : f.label.padEnd(f.width ?? f.label.length)))
    .join("  ");
  console.log(`  ${header}`);
  for (const d of docs) {
    const r = d.data() || {};
    const cells = sampleFields.map((f) => {
      const raw = cleanValue(r[f.field]);
      if (f.money) return (Math.round(Number(raw) || 0)).toLocaleString();
      const w = f.width ?? f.label.length;
      return String(raw ?? "").slice(0, w).padEnd(w);
    });
    console.log(`  ${cells.join("  ")}`);
  }
}
