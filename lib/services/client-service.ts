// lib/services/client-service.ts

import {
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  onSnapshot,
  collection,
  getDocs,
  query,
  where,
  arrayRemove,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "../firebase";
import { Client, ClientFormData } from "../types/client.types";
import {
  CLIENT_STATUSES,
  CLIENT_AGENCIES,
  CLIENT_REGIONS,
  CLIENT_OFFICES,
  CLIENT_GM_PODS,
  CLIENT_FEE_STRUCTURES,
  CLIENT_ADVERTISER_VERTICALS,
  type ClientTier,
} from "../constants/client.constants";
import { resolveClientStatus } from "../format/client";
import { computeTierFromDigitalSpend, sumDigitalSpend } from "../format/tier";
import { MEDIA_TYPES, MONTHS, type MediaType } from "../types/common.types";
import { MEDIA_TYPE_LABELS } from "../types/forecaster.types";
import type { RFQType } from "../types/rfq.types";
import { configuredYears, detectUniformRate } from "./commission-service";
import { fetchAxisData } from "./data-entry-service";
import { fetchCurrencyRateForYear } from "./currency-service";

// ─── Valid value sets for CSV validation ──────────────────────────────────────

const VALID_STATUSES    = CLIENT_STATUSES.map((s) => s.value);
const VALID_AGENCIES    = CLIENT_AGENCIES.map((a) => a.value);
const VALID_REGIONS     = CLIENT_REGIONS.map((r) => r.value);
const VALID_OFFICES     = CLIENT_OFFICES.map((o) => o.value);
const VALID_GM_PODS     = CLIENT_GM_PODS.map((g) => g.value);
const VALID_FEE_STRUCTS = CLIENT_FEE_STRUCTURES.map((f) => f.value);
const VALID_VERTICALS   = CLIENT_ADVERTISER_VERTICALS.map((v) => v.value);
const VALID_CURRENCIES  = ["CAD", "USD"];

const REQUIRED_COLUMNS = [
  "CL_Name",
  "CL_Agency",
  "Client_Fee_Structure",
  "CL_Currency",
  "Client_Status_2026",
] as const;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ValidatedRow {
  id: string;
  data: Record<string, unknown>;
}

export interface CSVValidationResult {
  fileName: string;
  validRows: ValidatedRow[];
  errors: string[];
}

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Random 8-hex-char id (e.g. "9ff8895e") — the format of the existing client
 * ids. 4 random bytes ≈ 4.3 billion values, so collisions are a non-concern
 * at this collection's size.
 */
function generateClientId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

function escapeCSV(value: unknown): string {
  const str = value == null ? "" : String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// ─── Logo Upload ──────────────────────────────────────────────────────────────

/**
 * Real-time subscription to a single client doc. Used by the forecast page to
 * keep commission rates (commissionsConfig) live, so the Revenue Commission row
 * reflects a rate change immediately. Returns the unsubscribe function.
 */
export function subscribeToClient(
  clId: string,
  onChange: (client: Client | null) => void
): () => void {
  return onSnapshot(doc(db, "clients", clId), (snap) => {
    onChange(
      snap.exists() ? ({ cl_id: snap.id, ...(snap.data() as Omit<Client, "cl_id">) }) : null
    );
  });
}

export async function uploadClientLogo(file: File, clientName: string): Promise<string> {
  const ext = file.name.split(".").pop() ?? "png";
  const slug = clientName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .slice(0, 30);
  const path = `client-logos/${slug}_${Date.now()}.${ext}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file);
  return getDownloadURL(storageRef);
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export async function saveClient(
  formData: ClientFormData,
  cl_id: string | null
): Promise<Client> {
  const id = cl_id ?? generateClientId();
  const docRef = doc(db, "clients", id);
  const now = new Date().toISOString();
  const payload = {
    ...formData,
    updatedAt: now,
    ...(cl_id ? {} : { createdAt: now }),
  };
  await setDoc(docRef, payload, { merge: true });

  // `merge: true` deep-merges map fields, so removing a key (a dropped status
  // year, or an eligibility flag toggled back to the default) would NOT delete
  // it server-side. For maps that can shrink we replace the whole field with
  // updateDoc, which overwrites a field rather than merging it. Only on edit —
  // a freshly created doc has no stale keys.
  if (cl_id) {
    await updateDoc(docRef, {
      Client_Status_By_Year: formData.Client_Status_By_Year,
      Labs_Eligibility: formData.Labs_Eligibility ?? {},
    });
  }

  return { cl_id: id, ...payload } as Client;
}

/**
 * Deletes a client AND everything keyed to it, so no orphaned data lingers:
 * forecast submissions (data_entries), annual MediaOcean actuals
 * (annual_actuals), synced MediaBox totals (mediabox_totals), product tracking
 * (product_tracking), BL Forecast Validations (forecast_validations), and the
 * client's id in every user's assignedClients list. Admin-only (enforced by the
 * Firestore rules). The client doc itself is deleted LAST, so a partial failure
 * leaves the client visible and the deletion retryable.
 */
export async function deleteClient(cl_id: string): Promise<void> {
  // Related docs all carry a `clientId` field (see firestoreRules.txt).
  const relatedCollections = [
    "data_entries",
    "annual_actuals",
    "mediabox_totals",
    "product_tracking",
    "forecast_validations",
  ];
  const refs = (
    await Promise.all(
      relatedCollections.map(async (coll) => {
        const snap = await getDocs(
          query(collection(db, coll), where("clientId", "==", cl_id))
        );
        return snap.docs.map((d) => d.ref);
      })
    )
  ).flat();

  const BATCH_SIZE = 500;
  for (let start = 0; start < refs.length; start += BATCH_SIZE) {
    const batch = writeBatch(db);
    refs.slice(start, start + BATCH_SIZE).forEach((r) => batch.delete(r));
    await batch.commit();
  }

  // Unassign the client from every user that carried it.
  const assigned = await getDocs(
    query(collection(db, "users"), where("assignedClients", "array-contains", cl_id))
  );
  await Promise.all(
    assigned.docs.map((d) =>
      updateDoc(d.ref, { assignedClients: arrayRemove(cl_id) })
    )
  );

  await deleteDoc(doc(db, "clients", cl_id));
}

// ─── CSV Export ───────────────────────────────────────────────────────────────

const CSV_COLUMNS = [
  "cl_id",
  "CL_Name",
  "CL_Logo",
  "CL_Agency",
  "CL_Business_Unit_Region",
  "CL_Office",
  "CL_Business_Lead",
  "CL_Digital_Lead",
  "Client_Fee_Structure",
  "GM_Pod",
  "CL_Currency",
  "CL_GAIA_Number",
  "CL_MediaBox_IDs",
  "CL_Tier",
  "CL_Advertiser_Vertical",
  "Client_Status_2026",
  "CL_Hidden",
  "Client_Notes",
] as const;

export function exportClientsToCSV(clients: Client[]): void {
  // The CSV keeps a single status column for round-trip simplicity: we export
  // the status resolved for 2026 (the column header stays "Client_Status_2026").
  // Nested fields (Forecasting_Type, Labs_Eligibility) are UI-only and omitted.
  const header = CSV_COLUMNS.join(",");
  const rows = clients.map((c) =>
    CSV_COLUMNS.map((col) => {
      if (col === "Client_Status_2026") return escapeCSV(resolveClientStatus(c, 2026));
      if (col === "CL_Hidden") return escapeCSV(c.CL_Hidden ? "true" : "false");
      const value = c[col as keyof Client];
      if (Array.isArray(value)) return escapeCSV(value.join("|"));
      return escapeCSV(value);
    }).join(",")
  );
  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `clients_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

// ─── Commissions CSV Export ───────────────────────────────────────────────────

const COMMISSION_CSV_HEADER = [
  "cl_id",
  "CL_Name",
  "Year",
  "Media_Type",       // canonical key (tv, social, …) — machine-friendly
  "Media_Type_Label", // display label (TV, Social, …)
  "Uniform_Rate",     // the single % when all 12 months match, else empty
  ...MONTHS.map((m) =>
    ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][m - 1]
  ),
];

/**
 * Exports every client's commission rates as a CSV download — one row per
 * client × year × configured media type, with the 12 monthly rates (in %) and
 * a Uniform_Rate convenience column filled when all 12 months are identical.
 * Clients (or years) with no commission config simply contribute no rows.
 */
export function exportCommissionsToCSV(clients: Client[]): void {
  const rows: string[] = [];

  for (const client of clients) {
    const config = client.commissionsConfig ?? {};
    // configuredYears sorts descending — export oldest first for readability.
    const years = configuredYears(config).sort((a, b) => a - b);
    for (const year of years) {
      const yearConfig = config[year] ?? {};
      // MEDIA_TYPES order keeps rows stable across exports.
      for (const type of MEDIA_TYPES) {
        const map = yearConfig[type as MediaType];
        if (!map) continue;
        const uniform = detectUniformRate(map);
        rows.push(
          [
            escapeCSV(client.cl_id),
            escapeCSV(client.CL_Name),
            year,
            type,
            escapeCSV(MEDIA_TYPE_LABELS[type as MediaType]),
            uniform ?? "",
            ...MONTHS.map((m) => map[m] ?? 0),
          ].join(",")
        );
      }
    }
  }

  const csv = [COMMISSION_CSV_HEADER.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `commissions_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

// ─── CSV Validation (dry run — no writes) ────────────────────────────────────

/**
 * Parses and validates a CSV file without writing to Firestore.
 * Returns a CSVValidationResult with valid rows and error messages.
 * Call commitCSVImport() to actually write the valid rows.
 */
export async function validateCSV(file: File): Promise<CSVValidationResult> {
  const text = await file.text();
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  if (lines.length < 2) {
    throw new Error("CSV file is empty or missing data rows.");
  }

  const headers = lines[0].split(",").map((h) => h.trim());

  const missingCols = REQUIRED_COLUMNS.filter((col) => !headers.includes(col));
  if (missingCols.length > 0) {
    throw new Error(`Missing required columns: ${missingCols.join(", ")}`);
  }

  const errors: string[] = [];
  const validRows: ValidatedRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const lineNumber = i + 1;
    const values = parseCSVLine(lines[i]);

    if (values.length !== headers.length) {
      errors.push(
        `Row ${lineNumber}: column count mismatch (expected ${headers.length}, got ${values.length})`
      );
      continue;
    }

    const row: Record<string, unknown> = {};
    headers.forEach((h, idx) => { row[h] = values[idx]; });

    // Validate constrained fields
    const validations: [string, string, string[]][] = [
      ["Client_Fee_Structure",    row.Client_Fee_Structure as string,    VALID_FEE_STRUCTS],
      ["CL_Currency",             row.CL_Currency as string,             VALID_CURRENCIES],
      ["Client_Status_2026",      row.Client_Status_2026 as string,      VALID_STATUSES],
      ["CL_Agency",               row.CL_Agency as string,               VALID_AGENCIES],
      ["CL_Business_Unit_Region", row.CL_Business_Unit_Region as string, VALID_REGIONS],
      ["CL_Office",               row.CL_Office as string,               [...VALID_OFFICES, ""]],
      ["GM_Pod",                  row.GM_Pod as string,                  [...VALID_GM_PODS, ""]],
      ["CL_Advertiser_Vertical",  row.CL_Advertiser_Vertical as string,  [...VALID_VERTICALS, ""]],
    ];

    let hasError = false;
    for (const [field, value, allowed] of validations) {
      if (value && !allowed.includes(value)) {
        errors.push(
          `Row ${lineNumber}: invalid ${field} "${value}" — allowed: ${allowed.filter(Boolean).join(", ")}`
        );
        hasError = true;
      }
    }
    if (hasError) continue;

    // Parse pipe-separated GAIA numbers
    const gaiaRaw = (row.CL_GAIA_Number as string) ?? "";
    row.CL_GAIA_Number = gaiaRaw ? gaiaRaw.split("|").map((s) => s.trim()) : [];

    // Pipe-separated MediaBox IDs — only touched when the CSV carries the
    // column, so older files without it don't wipe existing mappings.
    if ("CL_MediaBox_IDs" in row) {
      const mediaboxRaw = (row.CL_MediaBox_IDs as string) ?? "";
      row.CL_MediaBox_IDs = mediaboxRaw
        ? mediaboxRaw.split("|").map((s) => s.trim())
        : [];
    }

    // Status: the CSV carries a single 2026 column → map it into the per-year
    // map and drop the legacy key so docs don't keep a stale scalar. The write
    // is a deep merge, so `{2026: …}` never touches other years; when the CSV
    // has no status, the field is left out entirely (an empty map would WIPE
    // the per-year map on merge).
    const status2026 = row.Client_Status_2026 as string;
    if (status2026) row.Client_Status_By_Year = { 2026: status2026 };
    delete row.Client_Status_2026;

    // Hidden flag (optional column).
    row.CL_Hidden = (row.CL_Hidden as string) === "true";

    // Fields the CSV does NOT carry (commissionsConfig, Forecasting_Type,
    // Labs_Eligibility, createdAt) are intentionally absent from the payload:
    // the batch write merges, so whatever the doc already holds survives the
    // import. Writing defaults here (even `{}`) would overwrite them — that is
    // exactly the bug that wiped script-loaded commissions. Read paths all
    // fall back to defaults when the fields are missing on a new doc.

    // Resolve document ID
    const existingId = (row.cl_id as string)?.trim() || "";
    const id = existingId || generateClientId();
    row.updatedAt = new Date().toISOString();
    delete row.cl_id;

    // Tier is computed from the digital spend forecast (see lib/format/tier.ts),
    // never imported: the CSV column is ignored on existing clients so an import
    // can't overwrite a computed value. New clients start at PARTNER (no
    // forecast yet → $0 digital spend) until the next recompute.
    delete row.CL_Tier;
    if (!existingId) row.CL_Tier = "PARTNER";

    validRows.push({ id, data: row });
  }

  return { fileName: file.name, validRows, errors };
}

// ─── Tier recompute ───────────────────────────────────────────────────────────

/**
 * One client's tier computation against a reference submission (year + RFQ).
 * Produced by computeTierUpdates (a dry run); applyTierUpdates writes them.
 */
export interface TierComputation {
  cl_id: string;
  name: string;
  currentTier?: ClientTier;
  computedTier: ClientTier;
  /** Annual digital spend converted to CAD (0 when the submission is empty). */
  digitalSpendCad: number;
  /** USD client with no USD→CAD rate for the year — tier left untouched. */
  skippedNoRate: boolean;
}

export interface TierRecomputeReport {
  computations: TierComputation[];
  /** Computations whose tier actually changes (excluding skipped ones). */
  changes: TierComputation[];
  skipped: TierComputation[];
}

/**
 * Dry run: computes every client's tier from the digital media spend
 * (Digital Direct + Programmatic + SEM + Social) of the {year, rfq}
 * submission, in CAD. No writes — call applyTierUpdates with the report
 * after the admin confirms.
 *
 * USD clients are converted with the year's USD→CAD rate; when no rate is
 * configured they are reported as skipped rather than mis-ranked.
 */
export async function computeTierUpdates(
  clients: Client[],
  year: number,
  rfq: RFQType
): Promise<TierRecomputeReport> {
  const usdToCad = await fetchCurrencyRateForYear(year);

  const computations = await Promise.all(
    clients.map(async (client): Promise<TierComputation> => {
      const base = {
        cl_id: client.cl_id,
        name: client.CL_Name,
        currentTier: client.CL_Tier,
      };

      if (client.CL_Currency === "USD" && usdToCad === undefined) {
        return {
          ...base,
          computedTier: client.CL_Tier ?? "PARTNER",
          digitalSpendCad: 0,
          skippedNoRate: true,
        };
      }

      const axis = await fetchAxisData(client.cl_id, year, rfq, "media");
      const rate = client.CL_Currency === "USD" ? usdToCad! : 1;
      const digitalSpendCad = sumDigitalSpend(axis) * rate;

      return {
        ...base,
        computedTier: computeTierFromDigitalSpend(digitalSpendCad),
        digitalSpendCad,
        skippedNoRate: false,
      };
    })
  );

  return {
    computations,
    changes: computations.filter(
      (c) => !c.skippedNoRate && c.computedTier !== c.currentTier
    ),
    skipped: computations.filter((c) => c.skippedNoRate),
  };
}

/**
 * Writes the tier changes of a dry-run report (batches of 500).
 * Returns the number of updated clients.
 */
export async function applyTierUpdates(
  report: TierRecomputeReport
): Promise<number> {
  const BATCH_SIZE = 500;
  const now = new Date().toISOString();

  for (let start = 0; start < report.changes.length; start += BATCH_SIZE) {
    const batch = writeBatch(db);
    report.changes.slice(start, start + BATCH_SIZE).forEach((c) => {
      batch.update(doc(db, "clients", c.cl_id), {
        CL_Tier: c.computedTier,
        updatedAt: now,
      });
    });
    await batch.commit();
  }

  return report.changes.length;
}

// ─── CSV Commit (batch write) ─────────────────────────────────────────────────

/**
 * Writes pre-validated rows to Firestore in batches of 500.
 * Should only be called after validateCSV() and user confirmation.
 */
export async function commitCSVImport(validRows: ValidatedRow[]): Promise<ImportResult> {
  const BATCH_SIZE = 500;

  for (let start = 0; start < validRows.length; start += BATCH_SIZE) {
    const batch = writeBatch(db);
    validRows.slice(start, start + BATCH_SIZE).forEach(({ id, data }) => {
      batch.set(doc(db, "clients", id), data, { merge: true });
    });
    await batch.commit();
  }

  return {
    imported: validRows.length,
    skipped: 0,
    errors: [],
  };
}