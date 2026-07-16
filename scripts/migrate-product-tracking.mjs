// scripts/migrate-product-tracking.mjs
//
// One-off migration: imports the Product axis CSV into the `product_tracking`
// collection (one doc per client, ID = cl_id — see lib/types/product.types.ts).
//
// CSV columns: Client (cl_id), Product (catalog name), Status (label),
// Comment (→ note), Timing (M/D/YYYY → "YYYY-MM").
//
// Usage:
//   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json   # or gcloud ADC
//   node scripts/migrate-product-tracking.mjs "/path/to/Product migration - Sheet1.csv"           # dry run
//   node scripts/migrate-product-tracking.mjs "/path/to/Product migration - Sheet1.csv" --apply   # write
//
// Behavior:
//   - Client IDs absent from the `clients` collection are reported; their rows
//     are skipped so a typo never creates an orphan tracking doc.
//   - Unknown product names or status labels abort the run (the catalog is
//     static — an unknown value means a mapping bug, not data to skip).
//   - Timing on a Rejected row is dropped and reported (the app never shows it).
//   - Duplicate (client, product) rows: identical entries are deduped and
//     reported; conflicting entries abort the run.
//   - Existing product_tracking docs are MERGED per product: a product present
//     in the CSV replaces that product's entry wholesale; products already
//     tracked in Firestore but absent from the CSV are left untouched.

import { readFileSync } from "node:fs";
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const [, , csvPath, ...flags] = process.argv;
const APPLY = flags.includes("--apply");

if (!csvPath) {
  console.error(
    "Usage: node scripts/migrate-product-tracking.mjs <csv-path> [--apply]"
  );
  process.exit(1);
}

// ── Catalog + status mappings (keep in sync with lib/types/product.types.ts) ──

const PRODUCT_IDS = new Map(
  [
    ["Analytics Hub", "analytics-hub"],
    ["Smart Persona", "smart-persona"],
    ["AIOS", "aios"],
    ["Social Sonar", "social-sonar"],
    ["Insights Hub", "insights-hub"],
    ["DCO", "dco"],
    ["Radius", "radius"],
    ["AEO", "aeo"],
    ["Mediabox 2.0", "mediabox-2"],
    ["Affiliates (AIM)", "affiliates-aim"],
  ].map(([name, id]) => [name.toLowerCase(), id])
);

const STATUS_IDS = new Map([
  ["identified prospect", "IDENTIFIED_PROSPECT"],
  ["pitched to client", "PITCHED_TO_CLIENT"],
  ["approved", "APPROVED"],
  ["rejected", "REJECTED"],
]);

// ── CSV parsing (quoted fields may contain commas and doubled quotes) ─────────

function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f !== "")) rows.push(row);
  return rows;
}

/** "M/D/YYYY" → "YYYY-MM" (day ignored — timing is month-grained). */
function parseTiming(raw, rowNo) {
  const m = raw.match(/^(\d{1,2})\/\d{1,2}\/(\d{4})$/);
  if (!m) throw new Error(`row ${rowNo}: unparseable timing "${raw}"`);
  return `${m[2]}-${String(m[1]).padStart(2, "0")}`;
}

// ── Build the per-client product maps ─────────────────────────────────────────

const rows = parseCSV(readFileSync(csvPath, "utf8"));
const header = rows.shift().map((h) => h.trim().toLowerCase());
const col = (name) => {
  const idx = header.indexOf(name);
  if (idx === -1) throw new Error(`CSV is missing the "${name}" column`);
  return idx;
};
const COL = {
  client: col("client"),
  product: col("product"),
  status: col("status"),
  comment: col("comment"),
  timing: col("timing"),
};

const byClient = new Map(); // clientId → Map<productId, entry>
const warnings = [];
const fatal = [];

rows.forEach((cells, i) => {
  const rowNo = i + 2; // 1-based, after header
  const clientId = cells[COL.client]?.trim();
  const productName = cells[COL.product]?.trim();
  const statusLabel = cells[COL.status]?.trim();
  const note = cells[COL.comment]?.trim() ?? "";
  const timingRaw = cells[COL.timing]?.trim() ?? "";

  if (!clientId || !productName || !statusLabel) {
    fatal.push(`row ${rowNo}: missing client/product/status`);
    return;
  }
  const productId = PRODUCT_IDS.get(productName.toLowerCase());
  if (!productId) {
    fatal.push(`row ${rowNo}: unknown product "${productName}"`);
    return;
  }
  const status = STATUS_IDS.get(statusLabel.toLowerCase());
  if (!status) {
    fatal.push(`row ${rowNo}: unknown status "${statusLabel}"`);
    return;
  }

  const entry = { status };
  if (timingRaw) {
    if (status === "REJECTED") {
      warnings.push(
        `row ${rowNo}: timing "${timingRaw}" dropped (status is Rejected)`
      );
    } else {
      try {
        entry.timing = parseTiming(timingRaw, rowNo);
      } catch (e) {
        fatal.push(e.message);
        return;
      }
    }
  }
  if (note) entry.note = note;

  const products = byClient.get(clientId) ?? new Map();
  const existing = products.get(productId);
  if (existing) {
    if (JSON.stringify(existing) === JSON.stringify(entry)) {
      warnings.push(
        `row ${rowNo}: duplicate of an identical (${clientId}, ${productName}) row — deduped`
      );
    } else {
      fatal.push(
        `row ${rowNo}: conflicting duplicate for (${clientId}, ${productName}): ` +
          `${JSON.stringify(existing)} vs ${JSON.stringify(entry)}`
      );
    }
    return;
  }
  products.set(productId, entry);
  byClient.set(clientId, products);
});

if (fatal.length) {
  console.error("✖ Aborting — fix these rows first:");
  fatal.forEach((m) => console.error("  " + m));
  process.exit(1);
}

// ── Firestore ────────────────────────────────────────────────────────────────

initializeApp({ credential: applicationDefault(), projectId: "pluscoops" });
const db = getFirestore();

// Validate client IDs against the clients collection (doc ID = cl_id).
const clientIds = [...byClient.keys()];
const clientDocs = await db.getAll(
  ...clientIds.map((id) => db.doc(`clients/${id}`))
);
const missing = clientDocs.filter((d) => !d.exists).map((d) => d.id);
for (const id of missing) {
  warnings.push(
    `client "${id}" not found in the clients collection — ${
      byClient.get(id).size
    } row(s) skipped`
  );
  byClient.delete(id);
}

// Merge with existing tracking docs: CSV wins per product, the rest is kept.
const existingDocs = await db.getAll(
  ...[...byClient.keys()].map((id) => db.doc(`product_tracking/${id}`))
);
const existingByClient = new Map(
  existingDocs.map((d) => [d.id, d.exists ? d.data().products ?? {} : {}])
);

let writes = 0;
for (const [clientId, products] of byClient) {
  const merged = { ...existingByClient.get(clientId) };
  for (const [productId, entry] of products) merged[productId] = entry;
  const overwritten = Object.keys(existingByClient.get(clientId)).filter((k) =>
    products.has(k)
  );
  if (overwritten.length) {
    warnings.push(
      `client ${clientId}: replacing already-tracked product(s) ${overwritten.join(", ")}`
    );
  }

  console.log(
    `${APPLY ? "→" : "(dry)"} ${clientId}: ${products.size} product(s)` +
      (Object.keys(merged).length > products.size
        ? ` (+${Object.keys(merged).length - products.size} existing kept)`
        : "")
  );
  for (const [productId, entry] of products) {
    console.log(
      `    ${productId}: ${entry.status}` +
        (entry.timing ? ` · timing ${entry.timing}` : "") +
        (entry.note ? ` · note "${entry.note.slice(0, 60)}${entry.note.length > 60 ? "…" : ""}"` : "")
    );
  }

  if (APPLY) {
    await db.doc(`product_tracking/${clientId}`).set({
      clientId,
      products: merged,
      updatedAt: new Date().toISOString(),
    });
    writes++;
  }
}

if (warnings.length) {
  console.log("\n⚠ Warnings:");
  warnings.forEach((m) => console.log("  " + m));
}
console.log(
  `\n${APPLY ? `✔ Wrote ${writes} doc(s).` : `Dry run — ${byClient.size} doc(s) would be written. Re-run with --apply.`}`
);
