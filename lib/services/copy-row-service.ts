// lib/services/copy-row-service.ts

/**
 * Copies a single BL_INPUT row from the submission currently open in the grid
 * to another submission (any year + RFQ) of the SAME client.
 *
 * The feature is deliberately usable even when the source submission is LOCKED
 * (you're only reading its rows); the destination submission, however, must be
 * UNLOCKED — that guard lives in the UI (CopyRowModal), which knows the RFQ
 * statuses. This service only reads/writes the destination `data_entries` doc.
 *
 * A copied row always gets a fresh rowId (IDs are per-document — see the
 * factories in forecaster.types). It lands in the destination bucket whose name
 * matches the source bucket (created on demand when missing). If a row with the
 * same identity (rowType, plus productId for Product Fees lines) already exists
 * there, the caller decides whether to overwrite it or add a new line.
 */

import { fetchAxisData, saveAxisData } from "./data-entry-service";
import type {
  AxisData,
  AxisId,
  ForecastBucket,
  ForecastRow,
} from "../types/forecaster.types";
import {
  GENERAL_PROJECT_NAME,
  newBucket,
  newRow,
} from "../types/forecaster.types";
import type { RFQType } from "../types/rfq.types";

/** Destination submission (same client as the source). */
export interface CopyDest {
  clientId: string;
  year: number;
  rfq: RFQType;
}

/** What copying into `dest` would do — computed before the user confirms. */
export interface RowCopyPlan {
  /** A bucket with the source's name already exists in the destination. */
  bucketExists: boolean;
  /** An existing row with the same identity that would be hit on overwrite. */
  conflict: ForecastRow | null;
}

export type CopyMode = "add" | "overwrite";

/** Bucket names match case-insensitively, ignoring surrounding whitespace. */
function sameBucketName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Two rows are "the same line" when they share a rowType — and, for the Product
 * Fees stream (the only rowType that repeats via a linked product), the same
 * productId. Everything else keys on rowType alone.
 */
function isSameRowIdentity(a: ForecastRow, b: ForecastRow): boolean {
  if (a.rowType !== b.rowType) return false;
  if (a.productId || b.productId) return a.productId === b.productId;
  return true;
}

/** Deep-clone a BL row for another document — fresh rowId unless one is kept. */
function cloneRowForCopy(source: ForecastRow, keepRowId?: string): ForecastRow {
  const clone = newRow(source.rowType, source.label);
  if (keepRowId) clone.rowId = keepRowId;
  clone.months = { ...source.months };
  if (source.note) clone.note = source.note;
  if (source.productId) clone.productId = source.productId;
  if (source.explicitZeros && source.explicitZeros.length > 0) {
    clone.explicitZeros = [...source.explicitZeros];
  }
  return clone;
}

/**
 * Dry run: does the destination already hold the source's bucket, and would the
 * copy collide with an existing row there? Reads the destination axis only.
 */
export async function planRowCopy(params: {
  dest: CopyDest;
  axisId: AxisId;
  source: ForecastRow;
  sourceBucketName: string;
}): Promise<RowCopyPlan> {
  const { dest, axisId, source, sourceBucketName } = params;
  const data = await fetchAxisData(dest.clientId, dest.year, dest.rfq, axisId);
  const bucket = data.buckets.find((b) => sameBucketName(b.name, sourceBucketName));
  const conflict =
    bucket?.rows.find((r) => isSameRowIdentity(r, source)) ?? null;
  return { bucketExists: !!bucket, conflict };
}

/**
 * Writes the copy. Re-reads the destination axis fresh (so a plan computed
 * earlier can't clobber a concurrent edit), places the cloned row into the
 * matching bucket (created when absent), and persists the whole BL side.
 *
 * `mode` only matters when a same-identity row exists:
 *   - "overwrite": replace that row's values in place (keeps its rowId);
 *   - "add": append a new line (used when duplicates are allowed, or no clash).
 */
export async function applyRowCopy(params: {
  dest: CopyDest;
  axisId: AxisId;
  source: ForecastRow;
  sourceBucketName: string;
  mode: CopyMode;
  userUid?: string;
}): Promise<void> {
  const { dest, axisId, source, sourceBucketName, mode, userUid } = params;

  const data = await fetchAxisData(dest.clientId, dest.year, dest.rfq, axisId);
  // Clone buckets/rows arrays so we mutate a local copy, not the fetch result.
  const buckets: ForecastBucket[] = data.buckets.map((b) => ({
    ...b,
    rows: [...b.rows],
  }));

  let target = buckets.find((b) => sameBucketName(b.name, sourceBucketName));
  if (!target) {
    target = newBucket(sourceBucketName.trim() || GENERAL_PROJECT_NAME);
    buckets.push(target);
  }

  const conflictIdx = target.rows.findIndex((r) => isSameRowIdentity(r, source));
  if (conflictIdx >= 0 && mode === "overwrite") {
    // Keep the existing row's id, replace everything else with the source.
    target.rows[conflictIdx] = cloneRowForCopy(source, target.rows[conflictIdx].rowId);
  } else {
    target.rows.push(cloneRowForCopy(source));
  }

  const merged: AxisData = { buckets, actuals: data.actuals };
  await saveAxisData(dest.clientId, dest.year, dest.rfq, axisId, merged, userUid, {
    touchedBL: true,
  });
}
