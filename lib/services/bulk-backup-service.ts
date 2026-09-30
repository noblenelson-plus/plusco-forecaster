// lib/services/bulk-backup-service.ts

/**
 * Firestore service — "bulk_backups" collection (admin-only).
 *
 * Every Bulk Edit import / delete takes an automatic backup BEFORE it writes:
 * the exact stored value of each axis it is about to touch, per document. The
 * backup makes the operation undoable in one click, replacing the manual
 * "export a Bulk Data Backup first" step.
 *
 * Layout: `bulk_backups/{backupId}` is the header (who, when, status, counts);
 * `bulk_backups/{backupId}/snapshots/{snapId}` holds one touched document each
 * (`data_entries/…` or `annual_actuals/…`) with, per touched axis, its value
 * and `axisMeta` before the write plus fingerprints of the value before and
 * after. One doc per touched document keeps every write far below Firestore's
 * 1 MB document limit however large the import.
 *
 * Undo restores only sections that still hold what the operation wrote. A
 * section edited since (by a BL, another import…) is reported as a conflict
 * and skipped unless the admin explicitly chooses to overwrite it.
 */

import {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "../firebase";
import type { AxisId } from "../types/forecaster.types";
import type { MediaType, MonthlyMap } from "../types/common.types";
import type { RFQType } from "../types/rfq.types";
import { stableHash } from "../format/stable-hash";
import { syncRevenueCommission } from "./data-entry-service";

const COLLECTION = "bulk_backups";
const SNAPSHOTS = "snapshots";
/** Snapshot docs per write batch — keeps each batch well under the 10 MB cap. */
const BATCH_DOCS = 20;

export type BackupCollection = "data_entries" | "annual_actuals";
export type BackupKind = "IMPORT" | "DELETE";
export type BackupStatus = "PENDING" | "APPLIED" | "UNDONE";

/** One axis of one Firestore document a bulk operation is about to write. */
export interface BackupUnit {
  collection: BackupCollection;
  docId: string;
  axisId: AxisId;
  clientId: string;
  clientName: string;
  year: number;
  /** null for annual_actuals (not RFQ-scoped). */
  rfq: RFQType | null;
}

interface AxisSnapshot {
  /** Whether `axes.{axisId}` existed before the operation. */
  present: boolean;
  value?: unknown;
  metaPresent: boolean;
  meta?: unknown;
  beforeHash: string;
}

interface SnapshotDoc {
  collection: BackupCollection;
  docId: string;
  clientId: string;
  clientName: string;
  year: number;
  rfq: RFQType | null;
  axes: Partial<Record<AxisId, AxisSnapshot>>;
  /** Fingerprint of each axis right after the operation (set on finalize). */
  afterHash?: Partial<Record<AxisId, string>>;
}

export interface BackupHeader {
  backupId: string;
  kind: BackupKind;
  status: BackupStatus;
  createdAt: string;
  createdBy?: string;
  createdByEmail?: string;
  /** Free-text origin, e.g. the imported spreadsheet id. */
  source?: string;
  axes: AxisId[];
  years: number[];
  clientCount: number;
  docCount: number;
  sectionCount: number;
  /** Write errors reported by the operation itself. */
  errors: string[];
  undoneAt?: string;
  undoneBy?: string;
  undoneByEmail?: string;
  undoErrors?: string[];
}

export interface BackupActor {
  uid?: string;
  email?: string | null;
}

const snapKey = (c: BackupCollection, docId: string) => `${c}__${docId}`;

function groupUnits(units: BackupUnit[]): Map<string, { first: BackupUnit; axes: Set<AxisId> }> {
  const byDoc = new Map<string, { first: BackupUnit; axes: Set<AxisId> }>();
  for (const u of units) {
    const k = snapKey(u.collection, u.docId);
    const g = byDoc.get(k) ?? { first: u, axes: new Set<AxisId>() };
    g.axes.add(u.axisId);
    byDoc.set(k, g);
  }
  return byDoc;
}

async function readAxes(
  c: BackupCollection,
  docId: string
): Promise<{ exists: boolean; axes: Record<string, unknown>; axisMeta: Record<string, unknown> }> {
  const snap = await getDoc(doc(db, c, docId));
  if (!snap.exists()) return { exists: false, axes: {}, axisMeta: {} };
  const data = snap.data();
  return {
    exists: true,
    axes: (data.axes as Record<string, unknown>) ?? {},
    axisMeta: (data.axisMeta as Record<string, unknown>) ?? {},
  };
}

// ─── Create / finalize (called by the bulk operations) ──────────────────────

/**
 * Reads the live value of every unit and stores it as a PENDING backup. Throws
 * if anything fails — callers must abort the operation then, so nothing is
 * ever written without a backup.
 */
export async function createBackup(
  kind: BackupKind,
  units: BackupUnit[],
  actor: BackupActor,
  source?: string
): Promise<string> {
  const byDoc = groupUnits(units);
  const headerRef = doc(collection(db, COLLECTION));
  const backupId = headerRef.id;

  const snapshots: { key: string; data: SnapshotDoc }[] = await Promise.all(
    [...byDoc.entries()].map(async ([key, { first, axes }]) => {
      const live = await readAxes(first.collection, first.docId);
      const out: SnapshotDoc["axes"] = {};
      for (const axisId of axes) {
        const present = live.axes[axisId] !== undefined;
        const metaPresent = live.axisMeta[axisId] !== undefined;
        out[axisId] = {
          present,
          ...(present ? { value: live.axes[axisId] } : {}),
          metaPresent,
          ...(metaPresent ? { meta: live.axisMeta[axisId] } : {}),
          beforeHash: await stableHash(live.axes[axisId]),
        };
      }
      return {
        key,
        data: {
          collection: first.collection,
          docId: first.docId,
          clientId: first.clientId,
          clientName: first.clientName,
          year: first.year,
          rfq: first.rfq,
          axes: out,
        },
      };
    })
  );

  // Header first (PENDING), so a half-written backup is still listed.
  const header: Omit<BackupHeader, "backupId"> = {
    kind,
    status: "PENDING",
    createdAt: new Date().toISOString(),
    ...(actor.uid ? { createdBy: actor.uid } : {}),
    ...(actor.email ? { createdByEmail: actor.email } : {}),
    ...(source ? { source } : {}),
    axes: [...new Set(units.map((u) => u.axisId))],
    years: [...new Set(units.map((u) => u.year))].sort(),
    clientCount: new Set(units.map((u) => u.clientId)).size,
    docCount: byDoc.size,
    sectionCount: units.length,
    errors: [],
  };
  await setDoc(headerRef, header);

  for (let i = 0; i < snapshots.length; i += BATCH_DOCS) {
    const batch = writeBatch(db);
    for (const s of snapshots.slice(i, i + BATCH_DOCS)) {
      batch.set(doc(db, COLLECTION, backupId, SNAPSHOTS, s.key), s.data);
    }
    await batch.commit();
  }
  return backupId;
}

/**
 * Records the post-operation fingerprint of every backed-up axis (what undo
 * compares against) and marks the backup APPLIED with the operation's errors.
 */
export async function finalizeBackup(
  backupId: string,
  units: BackupUnit[],
  errors: string[]
): Promise<void> {
  const byDoc = groupUnits(units);
  const updates = await Promise.all(
    [...byDoc.entries()].map(async ([key, { first, axes }]) => {
      const live = await readAxes(first.collection, first.docId);
      const afterHash: Partial<Record<AxisId, string>> = {};
      for (const axisId of axes) afterHash[axisId] = await stableHash(live.axes[axisId]);
      return { key, afterHash };
    })
  );
  for (let i = 0; i < updates.length; i += BATCH_DOCS * 10) {
    const batch = writeBatch(db);
    for (const u of updates.slice(i, i + BATCH_DOCS * 10)) {
      batch.update(doc(db, COLLECTION, backupId, SNAPSHOTS, u.key), { afterHash: u.afterHash });
    }
    await batch.commit();
  }
  await updateDoc(doc(db, COLLECTION, backupId), { status: "APPLIED", errors });
}

// ─── History ─────────────────────────────────────────────────────────────────

export async function listBackups(max = 20): Promise<BackupHeader[]> {
  const snap = await getDocs(
    query(collection(db, COLLECTION), orderBy("createdAt", "desc"), limit(max))
  );
  return snap.docs.map((d) => ({ backupId: d.id, ...(d.data() as Omit<BackupHeader, "backupId">) }));
}

// ─── Undo ────────────────────────────────────────────────────────────────────

/**
 * restore   — still holds what the operation wrote → safe to put back.
 * unchanged — already equal to the backup (nothing to do).
 * conflict  — changed since the operation (or unverifiable) → skipped unless
 *             the admin opts to overwrite.
 */
export type UndoState = "restore" | "unchanged" | "conflict";

export interface UndoSection {
  snapKey: string;
  collection: BackupCollection;
  docId: string;
  clientId: string;
  clientName: string;
  year: number;
  rfq: RFQType | null;
  axisId: AxisId;
  state: UndoState;
  reason?: string;
}

export interface PreparedUndo {
  header: BackupHeader;
  sections: UndoSection[];
  /** Snapshot docs by key, for the commit. */
  snapshots: Map<string, SnapshotDoc>;
}

/** Compares each backed-up section with the live data. No write. */
export async function prepareUndo(backupId: string): Promise<PreparedUndo> {
  const headerSnap = await getDoc(doc(db, COLLECTION, backupId));
  if (!headerSnap.exists()) throw new Error("Backup not found.");
  const header = { backupId, ...(headerSnap.data() as Omit<BackupHeader, "backupId">) };

  const snapDocs = await getDocs(collection(db, COLLECTION, backupId, SNAPSHOTS));
  const snapshots = new Map<string, SnapshotDoc>();
  snapDocs.docs.forEach((d) => snapshots.set(d.id, d.data() as SnapshotDoc));

  const sections: UndoSection[] = [];
  await Promise.all(
    [...snapshots.entries()].map(async ([key, s]) => {
      const live = await readAxes(s.collection, s.docId);
      for (const [axisId, ax] of Object.entries(s.axes) as [AxisId, AxisSnapshot][]) {
        const current = await stableHash(live.axes[axisId]);
        const after = s.afterHash?.[axisId];
        let state: UndoState;
        let reason: string | undefined;
        if (current === ax.beforeHash) state = "unchanged";
        else if (after && current === after) state = "restore";
        else {
          state = "conflict";
          reason = after
            ? "Edited after the operation"
            : "The operation didn't finish recording — can't confirm who changed it";
        }
        sections.push({
          snapKey: key,
          collection: s.collection,
          docId: s.docId,
          clientId: s.clientId,
          clientName: s.clientName,
          year: s.year,
          rfq: s.rfq,
          axisId,
          state,
          ...(reason ? { reason } : {}),
        });
      }
    })
  );
  sections.sort(
    (a, b) =>
      a.clientName.localeCompare(b.clientName) ||
      a.year - b.year ||
      String(a.rfq ?? "").localeCompare(String(b.rfq ?? "")) ||
      a.axisId.localeCompare(b.axisId)
  );
  return { header, sections, snapshots };
}

export interface UndoResult {
  restored: number;
  skipped: number;
  commissionsRecalculated: number;
  errors: string[];
}

/**
 * Puts the backed-up value of every `restore` section back (plus `conflict`
 * ones when `overwriteConflicts`), then re-derives the Revenue commission of
 * every submission whose Media was restored. Re-running is safe: restored
 * sections read as `unchanged` next time.
 */
export async function commitUndo(
  prepared: PreparedUndo,
  opts: {
    overwriteConflicts: boolean;
    actor: BackupActor;
    /** clientId → commissionsConfig[year] rates, for the commission re-sync. */
    ratesOf: (clientId: string, year: number) => Partial<Record<MediaType, MonthlyMap>> | undefined;
  }
): Promise<UndoResult> {
  const errors: string[] = [];
  let restored = 0;
  let skipped = 0;
  const now = new Date().toISOString();

  // Sections to restore, grouped per document → one write per document.
  const byDoc = new Map<string, UndoSection[]>();
  for (const s of prepared.sections) {
    const take = s.state === "restore" || (s.state === "conflict" && opts.overwriteConflicts);
    if (!take) {
      if (s.state === "conflict") skipped++;
      continue;
    }
    const list = byDoc.get(s.snapKey) ?? [];
    list.push(s);
    byDoc.set(s.snapKey, list);
  }

  const commissionTargets = new Map<string, { clientId: string; year: number; rfq: RFQType }>();

  for (const [key, sections] of byDoc) {
    const snap = prepared.snapshots.get(key)!;
    const ref = doc(db, snap.collection, snap.docId);
    try {
      const exists = (await getDoc(ref)).exists();
      const stamps: Record<string, unknown> = {
        updatedAt: now,
        ...(snap.collection === "data_entries" ? { forecastEditedAt: now } : {}),
        ...(opts.actor.uid ? { lastModifiedBy: opts.actor.uid } : {}),
      };
      if (exists) {
        const update: Record<string, unknown> = { ...stamps };
        for (const s of sections) {
          const ax = snap.axes[s.axisId]!;
          update[`axes.${s.axisId}`] = ax.present ? ax.value : deleteField();
          update[`axisMeta.${s.axisId}`] = ax.metaPresent ? ax.meta : deleteField();
        }
        await updateDoc(ref, update);
      } else {
        // Deleted since — recreate it with only the sections that had data.
        const axes: Record<string, unknown> = {};
        const axisMeta: Record<string, unknown> = {};
        for (const s of sections) {
          const ax = snap.axes[s.axisId]!;
          if (ax.present) axes[s.axisId] = ax.value;
          if (ax.metaPresent) axisMeta[s.axisId] = ax.meta;
        }
        if (Object.keys(axes).length) {
          await setDoc(ref, {
            clientId: snap.clientId,
            year: snap.year,
            ...(snap.rfq ? { rfq: snap.rfq } : {}),
            axes,
            ...(Object.keys(axisMeta).length ? { axisMeta } : {}),
            createdAt: now,
            ...stamps,
          });
        }
      }
      restored += sections.length;
      if (
        snap.collection === "data_entries" &&
        snap.rfq &&
        sections.some((s) => s.axisId === "media" || s.axisId === "revenue")
      ) {
        commissionTargets.set(key, { clientId: snap.clientId, year: snap.year, rfq: snap.rfq });
      }
    } catch (err) {
      errors.push(
        `${snap.clientName} ${snap.year}${snap.rfq ? ` ${snap.rfq}` : ""}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // The Revenue commission is derived from Media — recompute it from the
  // restored data rather than trusting the snapshot's copy.
  let commissionsRecalculated = 0;
  for (const { clientId, year, rfq } of commissionTargets.values()) {
    try {
      await syncRevenueCommission(clientId, year, rfq, opts.ratesOf(clientId, year), opts.actor.uid);
      commissionsRecalculated++;
    } catch (err) {
      errors.push(`Commission sync ${clientId}/${year}/${rfq}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  await updateDoc(doc(db, COLLECTION, prepared.header.backupId), {
    status: "UNDONE",
    undoneAt: now,
    ...(opts.actor.uid ? { undoneBy: opts.actor.uid } : {}),
    ...(opts.actor.email ? { undoneByEmail: opts.actor.email } : {}),
    undoErrors: errors,
  });

  return { restored, skipped, commissionsRecalculated, errors };
}
