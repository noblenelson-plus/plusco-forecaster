// lib/services/data-entry-service.ts

/**
 * Firestore service — "data_entries" collection.
 *
 * One document per {client, year, RFQ} triplet (see forecaster.types.ts).
 * Every axis write goes through the "axes.{axisId}" dot-path: saving the
 * Media axis never touches Revenue or Labs, even though all three live in
 * the same document.
 *
 * V1 strategy (explicit Save):
 *   1. fetchDataEntry() when the grid mounts (+ fetch of the comparison RFQ)
 *   2. local editing (dirty map in use-forecaster-grid)
 *   3. saveAxisData() on Save click — a single write, whole axis
 */

import {
  doc,
  getDoc,
  onSnapshot,
  setDoc,
  updateDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "../firebase";
import type { RFQType } from "../types/rfq.types";
import { RFQ_TYPE_ORDER, buildRFQId } from "../types/rfq.types";
import type { MediaType, MonthlyMap } from "../types/common.types";
import {
  type AxisData,
  type AxisId,
  type AxisMeta,
  type DataEntry,
  buildDataEntryId,
  emptyAxisData,
  REVENUE_COMMISSION_TYPE,
} from "../types/forecaster.types";
import {
  applyCommissionOverwrite,
  commissionOverwriteMonths,
  computeCommission,
  ensureRevenueShape,
} from "../format/revenue-commission";
import type { FlagReviewMap } from "../types/flag.types";

const COLLECTION = "data_entries";

// ─── Reads ────────────────────────────────────────────────────────────────────

/**
 * Fetches the document for a {client, year, RFQ} triplet.
 * Returns null when it doesn't exist yet (nothing entered) —
 * a normal case, not an error.
 */
export async function fetchDataEntry(
  clientId: string,
  year: number,
  rfq: RFQType
): Promise<DataEntry | null> {
  const entryId = buildDataEntryId(clientId, year, rfq);
  const snapshot = await getDoc(doc(db, COLLECTION, entryId));
  if (!snapshot.exists()) return null;
  return {
    entry_id: snapshot.id,
    ...(snapshot.data() as Omit<DataEntry, "entry_id">),
  };
}

/**
 * One axis' data for a given triplet — always a usable AxisData.
 * If the document or the axis doesn't exist, returns an empty AxisData:
 * the grid never has to handle null.
 */
export async function fetchAxisData(
  clientId: string,
  year: number,
  rfq: RFQType,
  axisId: AxisId
): Promise<AxisData> {
  const entry = await fetchDataEntry(clientId, year, rfq);
  return normalizeAxisData(entry?.axes?.[axisId]);
}

/**
 * Coerce a raw stored axis into a usable AxisData.
 * Legacy docs stored `actuals` as a single MonthlyMap (no media type); that
 * shape is no longer supported, so a non-array `actuals` is ignored (→ []).
 */
function normalizeAxisData(raw: Partial<AxisData> | undefined): AxisData {
  if (!raw) return emptyAxisData();
  return {
    buckets: Array.isArray(raw.buckets) ? raw.buckets : [],
    actuals: Array.isArray(raw.actuals) ? raw.actuals : [],
  };
}

/**
 * Axis data + its per-side "last updated" stamps for a triplet, in a single
 * read. Used by the grid, which displays when BL_INPUT and ADMIN_INPUT were
 * last saved. For axes whose actuals live in the annual doc (Media, Labs), only
 * the BL stamp here is meaningful — the actuals stamp comes from that doc.
 */
export async function fetchAxisDataWithMeta(
  clientId: string,
  year: number,
  rfq: RFQType,
  axisId: AxisId
): Promise<{ data: AxisData; meta: AxisMeta }> {
  const entry = await fetchDataEntry(clientId, year, rfq);
  return {
    data: normalizeAxisData(entry?.axes?.[axisId]),
    meta: entry?.axisMeta?.[axisId] ?? {},
  };
}

// ─── Writes ───────────────────────────────────────────────────────────────────

/**
 * Saves a triplet's whole axis — creates the document on the first Save.
 *
 * setDoc + merge rather than updateDoc: no need to know whether the doc
 * already exists, and only the provided fields are written. The dot-path is
 * expressed as a nested object { axes: { [axisId]: ... } } which, with
 * merge:true, merges key-by-key without overwriting the other axes.
 */
export async function saveAxisData(
  clientId: string,
  year: number,
  rfq: RFQType,
  axisId: AxisId,
  data: AxisData,
  userUid?: string,
  /**
   * Which sides this write touched, for the per-side "last updated" stamps.
   * Defaults to BL only (the common path); callers that also write actuals in
   * the same doc (Revenue's GAIA) pass touchedActuals explicitly. A side left
   * out keeps its previous stamp (deep merge).
   */
  opts?: {
    touchedBL?: boolean;
    touchedActuals?: boolean;
    /**
     * Caller already knows the doc exists with createdAt set — skips the
     * backfill read below (saves a round trip on hot paths like propagation).
     */
    hasCreatedAt?: boolean;
  }
): Promise<void> {
  const entryId = buildDataEntryId(clientId, year, rfq);
  const now = new Date().toISOString();

  const touchedBL = opts?.touchedBL ?? true;
  const touchedActuals = opts?.touchedActuals ?? false;
  const meta: AxisMeta = {};
  if (touchedBL) meta.blUpdatedAt = now;
  if (touchedActuals) meta.actualsUpdatedAt = now;

  await setDoc(
    doc(db, COLLECTION, entryId),
    {
      clientId,
      year,
      rfq,
      axes: { [axisId]: data },
      updatedAt: now,
      ...(Object.keys(meta).length ? { axisMeta: { [axisId]: meta } } : {}),
      ...(userUid ? { lastModifiedBy: userUid } : {}),
    },
    { merge: true }
  );

  // createdAt: set once, after the fact, only if missing. The doc was just
  // written so this read hits the local cache.
  if (opts?.hasCreatedAt) return;
  const snapshot = await getDoc(doc(db, COLLECTION, entryId));
  if (snapshot.exists() && !snapshot.data().createdAt) {
    await updateDoc(doc(db, COLLECTION, entryId), { createdAt: now });
  }
}

// ─── Revenue commission sync (derived from Media + rates) ────────────────────

/**
 * Recomputes the Revenue Commission row from the persisted Media forecast and
 * the given commission rates, and writes it to Firestore — preserving the other
 * revenue streams (their stored values are re-read and kept). Used to keep the
 * commission in sync whenever Media is saved or the client's rates change.
 *
 * `yearRates` is the `commissionsConfig[year]` slice (passed in so this stays
 * decoupled from the clients collection).
 */
export async function syncRevenueCommission(
  clientId: string,
  year: number,
  rfq: RFQType,
  yearRates: Partial<Record<MediaType, MonthlyMap>> | undefined,
  userUid?: string
): Promise<void> {
  const entry = await fetchDataEntry(clientId, year, rfq);
  await syncRevenueCommissionFromEntry(entry, clientId, year, rfq, yearRates, userUid);
}

/**
 * Same as syncRevenueCommission, but reuses an already-fetched entry: the
 * Media and Revenue axes live in the same doc, so no extra read is needed.
 */
async function syncRevenueCommissionFromEntry(
  entry: DataEntry | null,
  clientId: string,
  year: number,
  rfq: RFQType,
  yearRates: Partial<Record<MediaType, MonthlyMap>> | undefined,
  userUid?: string
): Promise<void> {
  const media = normalizeAxisData(entry?.axes?.media);
  const revenue = ensureRevenueShape(normalizeAxisData(entry?.axes?.revenue));
  // A month carrying a Commission Overwrite value keeps its commission at 0 —
  // the overwrite replaces the calculation for that month.
  const { months } = applyCommissionOverwrite(
    computeCommission(media, yearRates),
    commissionOverwriteMonths(revenue)
  );
  // ensureRevenueShape pins the Commission row in the "General" project (the
  // first bucket) — scan all rows anyway so a stray can never be missed.
  const row = revenue.buckets
    .flatMap((b) => b.rows)
    .find((r) => r.rowType === REVENUE_COMMISSION_TYPE);
  if (row) row.months = months;
  await saveAxisData(clientId, year, rfq, "revenue", revenue, userUid, {
    hasCreatedAt: !!entry?.createdAt,
  });
}

/**
 * Propagates a commission-rate change across every RFQ of a (client, year):
 * recomputes and writes the Revenue Commission for each existing submission.
 * RFQs with no submission are skipped (nothing to sync), and LOCKED RFQs are
 * skipped — a locked submission is a frozen snapshot and must not be rewritten.
 *
 * All RFQs run in parallel and independently: one failure doesn't prevent the
 * others from completing. If any RFQ fails, an error is thrown afterwards so
 * the caller can retry — the sync is a recompute-from-source, so re-running
 * the whole year is idempotent and safe.
 */
export async function propagateCommissionForYear(
  clientId: string,
  year: number,
  yearRates: Partial<Record<MediaType, MonthlyMap>> | undefined,
  userUid?: string
): Promise<void> {
  const types = Object.keys(RFQ_TYPE_ORDER) as RFQType[];
  const results = await Promise.allSettled(
    types.map(async (type) => {
      // The entry and the RFQ lock status are independent — fetch both at once.
      const [entry, rfqSnap] = await Promise.all([
        fetchDataEntry(clientId, year, type),
        getDoc(doc(db, "rfqs", buildRFQId(year, type))),
      ]);
      if (!entry) return; // no submission for this RFQ — nothing to sync
      if (rfqSnap.exists() && rfqSnap.data().status === "LOCKED") return;
      await syncRevenueCommissionFromEntry(entry, clientId, year, type, yearRates, userUid);
    })
  );
  const failures = results.filter(
    (r): r is PromiseRejectedResult => r.status === "rejected"
  );
  if (failures.length > 0) {
    throw new Error(
      `Commission propagation failed for ${failures.length} RFQ(s): ` +
        failures.map((f) => String(f.reason)).join("; ")
    );
  }
}

// ─── Submission note (free-text comment, shared across the 3 axes) ───────────

/**
 * Free-text note attached to a whole submission ({client, year, rfq}), stored
 * top-level on the data_entries doc so it is shared by the Media, Revenue and
 * Labs tabs — independent of any axis. Editable even when the RFQ is locked
 * (the security rules carve out a note-only write for assigned BLs).
 */
export interface SubmissionNote {
  text: string;
  updatedAt?: string;
  updatedBy?: string; // User UID
}

/**
 * Subscribes in real time to a submission's note. Calls back with `null` when
 * the doc (or the note) does not exist yet — a normal empty case. Returns the
 * Firestore unsubscribe function.
 */
export function subscribeToSubmissionNote(
  clientId: string,
  year: number,
  rfq: RFQType,
  callback: (note: SubmissionNote | null) => void
): Unsubscribe {
  const entryId = buildDataEntryId(clientId, year, rfq);
  return onSnapshot(
    doc(db, COLLECTION, entryId),
    (snapshot) => {
      const note = snapshot.data()?.submissionNote as SubmissionNote | undefined;
      callback(note ?? null);
    },
    (err) => {
      console.error("Submission note subscription failed:", err);
      callback(null);
    }
  );
}

/**
 * Writes the submission note — creates the data_entries doc on first write
 * (setDoc + merge). The note replaces the whole `submissionNote` object so no
 * stale sub-key lingers. Touches only `submissionNote` and `updatedAt` on an
 * existing doc, which the security rules allow regardless of the RFQ lock.
 */
export async function saveSubmissionNote(
  clientId: string,
  year: number,
  rfq: RFQType,
  text: string,
  userUid?: string
): Promise<void> {
  const entryId = buildDataEntryId(clientId, year, rfq);
  const now = new Date().toISOString();
  await setDoc(
    doc(db, COLLECTION, entryId),
    {
      clientId,
      year,
      rfq,
      submissionNote: {
        text,
        updatedAt: now,
        ...(userUid ? { updatedBy: userUid } : {}),
      },
      updatedAt: now,
    },
    { merge: true }
  );
}

// ─── BL Forecast Validation (completion flags, shared across the 3 axes) ─────

/**
 * Subscribes in real time to a submission's confirmed steps — the milestones a
 * user has ticked as complete (see lib/constants/confirmation-steps.ts), stored
 * top-level on the data_entries doc so they are shared by the Media, Revenue and
 * Labs tabs. Calls back with a sorted, de-duplicated array of step ids (empty
 * when none/absent).
 *
 * Stored under the legacy `readyMonths` field name (kept so the annotation
 * carve-out in firestoreRules.txt doesn't change) — it now holds step-id
 * strings, not month numbers.
 */
export function subscribeToReadyMonths(
  clientId: string,
  year: number,
  rfq: RFQType,
  callback: (steps: string[]) => void
): Unsubscribe {
  const entryId = buildDataEntryId(clientId, year, rfq);
  return onSnapshot(
    doc(db, COLLECTION, entryId),
    (snapshot) => {
      const raw = snapshot.data()?.readyMonths;
      const steps = Array.isArray(raw)
        ? [...new Set(raw.filter((s): s is string => typeof s === "string"))].sort()
        : [];
      callback(steps);
    },
    (err) => {
      console.error("Confirmed steps subscription failed:", err);
      callback([]);
    }
  );
}

/**
 * Writes the submission's confirmed steps — creates the data_entries doc on
 * first write (setDoc + merge). The array is stored sorted; on an existing doc
 * the write touches only `readyMonths` and `updatedAt`, which the security rules
 * allow regardless of the RFQ lock (these flags are an annotation, not data).
 */
export async function saveReadyMonths(
  clientId: string,
  year: number,
  rfq: RFQType,
  steps: string[],
  userUid?: string
): Promise<void> {
  const entryId = buildDataEntryId(clientId, year, rfq);
  const now = new Date().toISOString();
  const sorted = [...new Set(steps)].sort();
  await setDoc(
    doc(db, COLLECTION, entryId),
    {
      clientId,
      year,
      rfq,
      readyMonths: sorted,
      readyMonthsMeta: { updatedAt: now, ...(userUid ? { updatedBy: userUid } : {}) },
      updatedAt: now,
    },
    { merge: true }
  );
}

// ─── Flag reviews (justifications for auto-raised flags, per submission) ─────

/**
 * Subscribes in real time to a submission's flag reviews — the per-flag
 * justifications (note + acknowledged mark) keyed by the flag's stable key,
 * stored top-level on the data_entries doc so they are shared by the Media,
 * Revenue and Labs tabs (a flag can concern any axis). Calls back with an empty
 * map when the doc (or the field) does not exist yet.
 */
export function subscribeToFlagReviews(
  clientId: string,
  year: number,
  rfq: RFQType,
  callback: (reviews: FlagReviewMap) => void
): Unsubscribe {
  const entryId = buildDataEntryId(clientId, year, rfq);
  return onSnapshot(
    doc(db, COLLECTION, entryId),
    (snapshot) => {
      const raw = snapshot.data()?.flagReviews as FlagReviewMap | undefined;
      callback(raw ?? {});
    },
    (err) => {
      console.error("Flag reviews subscription failed:", err);
      callback({});
    }
  );
}

/**
 * Writes one flag's review — creates the data_entries doc on first write
 * (setDoc + merge). Only `flagReviews.{key}` (+ updatedAt) is touched: the
 * nested map deep-merges, so the other flags' reviews keep their values and no
 * forecast field is affected. The security rules allow this annotation-only
 * write for an assigned BL even when the RFQ is locked. Reviews are never
 * deleted (acknowledging or clearing a note updates the entry in place), so the
 * deep merge never leaves a stale key.
 */
export async function saveFlagReview(
  clientId: string,
  year: number,
  rfq: RFQType,
  flagKey: string,
  review: { note: string; acknowledged: boolean },
  userUid?: string
): Promise<void> {
  const entryId = buildDataEntryId(clientId, year, rfq);
  const now = new Date().toISOString();
  await setDoc(
    doc(db, COLLECTION, entryId),
    {
      clientId,
      year,
      rfq,
      flagReviews: {
        [flagKey]: {
          note: review.note,
          acknowledged: review.acknowledged,
          updatedAt: now,
          ...(userUid ? { updatedBy: userUid } : {}),
        },
      },
      updatedAt: now,
    },
    { merge: true }
  );
}

/**
 * Updates ONLY an axis' actuals (ADMIN_INPUT).
 * Compatible with a future security rule that would let only admins
 * touch "axes.{axisId}.actuals".
 */
export async function saveAxisActuals(
  clientId: string,
  year: number,
  rfq: RFQType,
  axisId: AxisId,
  actuals: AxisData["actuals"],
  userUid?: string
): Promise<void> {
  const entryId = buildDataEntryId(clientId, year, rfq);
  const now = new Date().toISOString();
  await setDoc(
    doc(db, COLLECTION, entryId),
    {
      clientId,
      year,
      rfq,
      axes: { [axisId]: { actuals } },
      updatedAt: now,
      axisMeta: { [axisId]: { actualsUpdatedAt: now } },
      ...(userUid ? { lastModifiedBy: userUid } : {}),
    },
    { merge: true }
  );
}