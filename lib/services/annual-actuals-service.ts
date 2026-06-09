// lib/services/annual-actuals-service.ts

/**
 * Firestore service — "annual_actuals" collection.
 *
 * One document per {client, year} (see forecaster.types.ts). It holds the
 * ADMIN_INPUT (actuals) for axes whose source is an annual figure (Media's and
 * Labs' MediaOcean): a single set of rows per year, shared by every submission
 * of that year, rather than one copy per RFQ.
 *
 * Each axis's actuals live under the dot-path "axes.{axisId}", so writing Media
 * never touches Labs (setDoc + merge, like data-entry-service). Revenue is not
 * stored here — its GAIA actuals stay per-submission in data_entries.
 */

import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import type { AxisId, ForecastRow } from "../types/forecaster.types";
import { buildAnnualActualsId } from "../types/forecaster.types";

const COLLECTION = "annual_actuals";

// ─── Read ─────────────────────────────────────────────────────────────────────

/**
 * Annual actuals rows for an axis of a {client, year}. Returns [] when the
 * document or the axis doesn't exist yet — the grid never has to handle null.
 */
export async function fetchAnnualActuals(
  clientId: string,
  year: number,
  axisId: AxisId
): Promise<ForecastRow[]> {
  const entryId = buildAnnualActualsId(clientId, year);
  const snapshot = await getDoc(doc(db, COLLECTION, entryId));
  if (!snapshot.exists()) return [];
  const rows = snapshot.data()?.axes?.[axisId];
  return Array.isArray(rows) ? (rows as ForecastRow[]) : [];
}

/**
 * All axes' annual actuals for a {client, year} in a single read — used by the
 * dashboard, which needs both Media and Labs and would otherwise read the doc
 * twice. Returns {} when the document doesn't exist.
 */
export async function fetchAnnualActualsEntry(
  clientId: string,
  year: number
): Promise<Partial<Record<AxisId, ForecastRow[]>>> {
  const entryId = buildAnnualActualsId(clientId, year);
  const snapshot = await getDoc(doc(db, COLLECTION, entryId));
  if (!snapshot.exists()) return {};
  const axes = snapshot.data()?.axes;
  return axes && typeof axes === "object" ? axes : {};
}

// ─── Write ──────────────────────────────────────────────────────────────────

/**
 * Saves an axis's annual actuals for a {client, year} — creates the document on
 * the first save. setDoc + merge expresses the dot-path via a nested object so
 * the other axis is preserved. createdAt is set once, after the fact.
 */
export async function saveAnnualActuals(
  clientId: string,
  year: number,
  axisId: AxisId,
  actuals: ForecastRow[],
  userUid?: string
): Promise<void> {
  const entryId = buildAnnualActualsId(clientId, year);
  const now = new Date().toISOString();

  await setDoc(
    doc(db, COLLECTION, entryId),
    {
      clientId,
      year,
      axes: { [axisId]: actuals },
      updatedAt: now,
      ...(userUid ? { lastModifiedBy: userUid } : {}),
    },
    { merge: true }
  );

  // createdAt: set once, only if missing (the doc is in cache after the write).
  const snapshot = await getDoc(doc(db, COLLECTION, entryId));
  if (snapshot.exists() && !snapshot.data().createdAt) {
    await updateDoc(doc(db, COLLECTION, entryId), { createdAt: now });
  }
}
