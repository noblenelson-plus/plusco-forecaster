// lib/services/client-service.ts

import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  writeBatch,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db } from "../firebase";
import { Client, ClientFormData } from "../types/client.types";
import {
  CLIENT_STATUSES,
  CLIENT_TIERS,
  CLIENT_AGENCIES,
  CLIENT_REGIONS,
  CLIENT_OFFICES,
  CLIENT_GM_PODS,
  CLIENT_FEE_STRUCTURES,
} from "../constants/client.constants";

// ─── Valid value sets for CSV validation ──────────────────────────────────────

const VALID_STATUSES    = CLIENT_STATUSES.map((s) => s.value);
const VALID_TIERS       = CLIENT_TIERS.map((t) => t.value);
const VALID_AGENCIES    = CLIENT_AGENCIES.map((a) => a.value);
const VALID_REGIONS     = CLIENT_REGIONS.map((r) => r.value);
const VALID_OFFICES     = CLIENT_OFFICES.map((o) => o.value);
const VALID_GM_PODS     = CLIENT_GM_PODS.map((g) => g.value);
const VALID_FEE_STRUCTS = CLIENT_FEE_STRUCTURES.map((f) => f.value);
const VALID_CURRENCIES  = ["CAD", "USD"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateClientId(name: string): string {
  const slug = name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 30);
  return `CL_${slug}_${Date.now()}`;
}

// ─── Logo Upload ──────────────────────────────────────────────────────────────

/**
 * Uploads a logo image to Firebase Storage and returns the download URL.
 * Path: client-logos/{slug}_{timestamp}.{ext}
 */
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
  const id = cl_id ?? generateClientId(formData.CL_Name);
  const ref = doc(db, "clients", id);

  const now = new Date().toISOString();
  const payload = {
    ...formData,
    updatedAt: now,
    ...(cl_id ? {} : { createdAt: now }),
  };

  await setDoc(ref, payload, { merge: true });
  return { cl_id: id, ...payload } as Client;
}

export async function deleteClient(cl_id: string): Promise<void> {
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
  "CL_Tier",
  "Client_Status_2026",
  "Client_Notes",
] as const;

function escapeCSV(value: unknown): string {
  const str = value == null ? "" : String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportClientsToCSV(clients: Client[]): void {
  const header = CSV_COLUMNS.join(",");
  const rows = clients.map((c) =>
    CSV_COLUMNS.map((col) => {
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

// ─── CSV Import ───────────────────────────────────────────────────────────────

const REQUIRED_COLUMNS = ["CL_Name", "CL_Agency", "Client_Fee_Structure", "CL_Currency", "CL_Tier", "Client_Status_2026"] as const;

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

export async function parseClientsFromCSV(file: File): Promise<ImportResult> {
  const text = await file.text();
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  if (lines.length < 2) throw new Error("CSV file is empty or missing data rows.");

  const headers = lines[0].split(",").map((h) => h.trim());

  const missingCols = REQUIRED_COLUMNS.filter((col) => !headers.includes(col));
  if (missingCols.length > 0) {
    throw new Error(`Missing required columns: ${missingCols.join(", ")}`);
  }

  const errors: string[] = [];
  const validRows: { id: string; data: Record<string, unknown> }[] = [];

  for (let i = 1; i < lines.length; i++) {
    const lineNumber = i + 1;
    const values = parseCSVLine(lines[i]);

    if (values.length !== headers.length) {
      errors.push(`Row ${lineNumber}: column count mismatch (expected ${headers.length}, got ${values.length})`);
      continue;
    }

    const row: Record<string, unknown> = {};
    headers.forEach((h, idx) => { row[h] = values[idx]; });

    // Validate all constrained fields
    const validations: [string, string, string[]][] = [
      ["Client_Fee_Structure", row.Client_Fee_Structure as string, VALID_FEE_STRUCTS],
      ["CL_Currency",          row.CL_Currency as string,          VALID_CURRENCIES],
      ["CL_Tier",              row.CL_Tier as string,              VALID_TIERS],
      ["Client_Status_2026",   row.Client_Status_2026 as string,   VALID_STATUSES],
      ["CL_Agency",            row.CL_Agency as string,            VALID_AGENCIES],
      ["CL_Business_Unit_Region", row.CL_Business_Unit_Region as string, VALID_REGIONS],
      ["CL_Office",            row.CL_Office as string,            [...VALID_OFFICES, ""]],
      ["GM_Pod",               row.GM_Pod as string,               [...VALID_GM_PODS, ""]],
    ];

    let hasError = false;
    for (const [field, value, allowed] of validations) {
      if (value && !allowed.includes(value)) {
        errors.push(`Row ${lineNumber}: invalid ${field} "${value}" — allowed: ${allowed.filter(Boolean).join(", ")}`);
        hasError = true;
      }
    }
    if (hasError) continue;

    // Parse pipe-separated GAIA numbers
    const gaiaRaw = (row.CL_GAIA_Number as string) ?? "";
    row.CL_GAIA_Number = gaiaRaw ? gaiaRaw.split("|").map((s) => s.trim()) : [];

    const id = (row.cl_id as string)?.trim() || generateClientId(row.CL_Name as string);
    const now = new Date().toISOString();
    row.createdAt = row.createdAt ?? now;
    row.updatedAt = now;
    row.commissionsConfig = row.commissionsConfig ?? {};
    delete row.cl_id;

    validRows.push({ id, data: row });
  }

  // Batch write (max 500 per batch)
  const BATCH_SIZE = 500;
  for (let start = 0; start < validRows.length; start += BATCH_SIZE) {
    const batch = writeBatch(db);
    validRows.slice(start, start + BATCH_SIZE).forEach(({ id, data }) => {
      batch.set(doc(db, "clients", id), data, { merge: true });
    });
    await batch.commit();
  }

  return { imported: validRows.length, skipped: errors.length, errors };
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