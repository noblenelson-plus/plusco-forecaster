// lib/hooks/use-forecaster-grid.ts

/**
 * Generic forecast-grid hook — shared by Media, Revenue and Labs.
 *
 * Responsibilities:
 *   — Load the AxisData for the selected triplet (global Zustand store)
 *   — Maintain a local working copy + dirty map (explicit Save)
 *   — Structure mutations: buckets and rows (per the AxisConfig)
 *   — Totals: row, bucket/month, grand total/month, actuals
 *   — Comparison: load a reference RFQ and match its rows (by bucket name +
 *     rowType, since IDs differ from one document to the next)
 *   — Save: a single Firestore write of the whole axis
 *
 * Permissions:
 *   — RFQ LOCKED → everything is read-only (BL and admin)
 *   — BL_INPUT editable by everyone while unlocked
 *   — ADMIN_INPUT (actuals) editable by admins only
 */

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../auth-context";
import { useUserProfile } from "./use-user-profile";
import { useForecastSelection } from "../stores/forecast-selection.store";
import {
  fetchAxisData,
  fetchAxisDataWithMeta,
  saveAxisData,
} from "../services/data-entry-service";
import {
  fetchAnnualActuals,
  fetchAnnualActualsWithMeta,
  saveAnnualActuals,
} from "../services/annual-actuals-service";
import { MONTHS, type MonthlyMap } from "../types/common.types";
import type { SetByTypeUpdate } from "../format/mediabox-paste";
import { resolveClosedMonths, type RFQType } from "../types/rfq.types";
import { useAutosave, type SaveStatus } from "./use-autosave";
import {
  type AxisConfig,
  type AxisData,
  type CellCoord,
  type ComparisonRef,
  type DirtyMap,
  type ForecastRow,
  type InputCategory,
  buildCellKey,
  detailExplicitZeros,
  detailMonthTotals,
  emptyAxisData,
  hasExplicitZero,
  newBucket,
  newDetail,
  newRow,
  rollUpActuals,
} from "../types/forecaster.types";

// ─── Pure computation helpers (exported — the grid also applies them to the
//     reference data for the totals variances) ───────────────────────────────

/** Annual total of a MonthlyMap. */
export function sumMonths(map: MonthlyMap): number {
  return MONTHS.reduce((acc, m) => acc + (map[m] ?? 0), 0);
}

/** Per-month totals of a set of rows. */
export function monthTotals(rows: ForecastRow[]): MonthlyMap {
  const totals: MonthlyMap = Object.fromEntries(MONTHS.map((m) => [m, 0]));
  rows.forEach((row) => {
    MONTHS.forEach((m) => {
      totals[m] += row.months[m] ?? 0;
    });
  });
  return totals;
}

/** Per-month totals of an axis's whole BL_INPUT (all buckets together). */
export function grandMonthTotals(data: AxisData): MonthlyMap {
  return monthTotals(data.buckets.flatMap((b) => b.rows));
}

/** Dependency-free deep copy — AxisData is plain JSON. */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Which sides (BL buckets / ADMIN actuals) differ between two snapshots. Drives
 *  the per-side "last updated" stamps so a save only times the side it changed. */
function diffSides(
  snapshot: AxisData,
  base: AxisData
): { bl: boolean; actuals: boolean } {
  return {
    bl: JSON.stringify(snapshot.buckets) !== JSON.stringify(base.buckets),
    actuals: JSON.stringify(snapshot.actuals) !== JSON.stringify(base.actuals),
  };
}

/** Reads the value at a coordinate in an AxisData (0 when absent). */
function getValueIn(data: AxisData, coord: CellCoord): number {
  if (coord.category === "ADMIN_INPUT") {
    const row = data.actuals.find((r) => r.rowId === coord.rowId);
    if (coord.detailId) {
      const detail = row?.details?.find((d) => d.detailId === coord.detailId);
      return detail?.months[coord.month] ?? 0;
    }
    return row?.months[coord.month] ?? 0;
  }
  const bucket = data.buckets.find((b) => b.bucketId === coord.bucketId);
  const row = bucket?.rows.find((r) => r.rowId === coord.rowId);
  return row?.months[coord.month] ?? 0;
}

/** Does the coordinate hold a deliberate 0? ADMIN_INPUT rows and their detail
 *  lines track explicit zeros (the flag lets a GAIA 0 override the BL Input),
 *  plus the BL row types listed in `blZeroTypes` (config.blExplicitZeroRowTypes,
 *  e.g. Revenue's Commission Overwrite). */
function isExplicitZeroIn(
  data: AxisData,
  coord: CellCoord,
  blZeroTypes: Set<string>
): boolean {
  if (coord.category !== "ADMIN_INPUT") {
    if (blZeroTypes.size === 0) return false;
    const bucket = data.buckets.find((b) => b.bucketId === coord.bucketId);
    const row = bucket?.rows.find((r) => r.rowId === coord.rowId);
    return (
      !!row && blZeroTypes.has(row.rowType) && hasExplicitZero(row, coord.month)
    );
  }
  const row = data.actuals.find((r) => r.rowId === coord.rowId);
  if (!row) return false;
  if (coord.detailId) {
    const detail = row.details?.find((d) => d.detailId === coord.detailId);
    return !!detail && hasExplicitZero(detail, coord.month);
  }
  return hasExplicitZero(row, coord.month);
}

/** Adds/removes a month in a row's (or detail's) explicitZeros set — the field
 *  is dropped entirely when empty, mirroring how an empty note is removed. */
function setRowExplicitZero(
  row: { explicitZeros?: number[] },
  month: number,
  explicit: boolean
) {
  const set = new Set(row.explicitZeros ?? []);
  if (explicit) set.add(month);
  else set.delete(month);
  if (set.size > 0) row.explicitZeros = [...set].sort((a, b) => a - b);
  else delete row.explicitZeros;
}

/** Re-derives a parent's months and explicit zeros from its detail lines
 *  (row = Σ details) after a detail edit. Mutates the working-copy row. */
function syncParentFromDetails(row: ForecastRow) {
  const details = row.details ?? [];
  row.months = detailMonthTotals(details);
  const zeros = detailExplicitZeros(details);
  if (zeros.length > 0) row.explicitZeros = zeros;
  else delete row.explicitZeros;
}

/** Has a committed cell write changed anything vs the clean snapshot — the
 *  value itself, or (for rows tracking explicit zeros) whether its 0 is
 *  deliberate? BL capability is resolved against the original snapshot; a row
 *  added this session isn't there, but adding it set structureDirty anyway. */
function cellDiffers(
  original: AxisData,
  coord: CellCoord,
  value: number | null,
  blZeroTypes: Set<string>
): boolean {
  let tracksZeros = coord.category === "ADMIN_INPUT";
  if (!tracksZeros && blZeroTypes.size > 0) {
    const bucket = original.buckets.find((b) => b.bucketId === coord.bucketId);
    const row = bucket?.rows.find((r) => r.rowId === coord.rowId);
    tracksZeros = !!row && blZeroTypes.has(row.rowType);
  }
  const explicit = value === 0 && tracksZeros;
  return (
    getValueIn(original, coord) !== (value ?? 0) ||
    isExplicitZeroIn(original, coord, blZeroTypes) !== explicit
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/** One channel row to write into a pasted campaign project. */
export interface CampaignChannelPaste {
  /** BL rowType code (e.g. "digitalDirect"); a free string, mapped to config where possible. */
  rowType: string;
  /** Display label for the row. */
  label: string;
  /** 12-month values (already converted to CAD). */
  months: MonthlyMap;
}

/** A MediaBox campaign to paste into BL submission as its own project. */
export interface CampaignProjectPaste {
  /** Campaign name -> BL project (bucket) name. */
  name: string;
  channels: CampaignChannelPaste[];
}

/** Summary of a pasteCampaignsAsProjects run, for the confirmation toast. */
export interface CampaignPasteResult {
  created: number;
  overwritten: number;
}

export interface UseForecasterGridResult {
  /** Is the client/year/RFQ triplet complete? The grid hides otherwise. */
  selectionReady: boolean;

  loading: boolean;
  saving: boolean;
  error: string;
  /** Autosave state for the toolbar indicator (debounced save runs on edit). */
  saveStatus: SaveStatus;
  /** Per-side last-save timestamps (ISO): BL_INPUT and ADMIN_INPUT (actuals). */
  lastUpdated: { bl?: string; actuals?: string };

  /** Locked RFQ → no editing, for anyone. */
  locked: boolean;
  /** Can the current user edit the actuals (ADMIN_INPUT)? */
  canEditActuals: boolean;
  /** Months (1–12) in a closed period for the selected RFQ — visual lock. */
  closedMonths: Set<number>;
  /** Can the current user edit cells in a closed period? (admins can) */
  canEditClosed: boolean;

  /** Current working copy. */
  data: AxisData;
  dirtyMap: DirtyMap;
  dirtyCount: number;
  hasChanges: boolean;

  // Cell editing. A null value clears the cell (0, not deliberate) while a
  // literal 0 on an ADMIN_INPUT row is recorded as an explicit zero — real
  // data that the Revenue BL-Submission priority honours over the BL Input.
  getCellValue: (coord: CellCoord) => number;
  setCellValue: (coord: CellCoord, value: number | null) => void;
  /** Batch write — one state + dirty-map update for many cells (paste, fill, spread). */
  setCells: (updates: { coord: CellCoord; value: number | null }[]) => void;
  /**
   * Add deltas onto BL_INPUT cells, targeting a row by (bucket, rowType) and
   * creating it if the project lacks that type. Used by the comparison panel
   * to distribute a media-type difference into projects across months.
   */
  addToCells: (
    updates: {
      bucketId: string;
      rowType: string;
      month: number;
      delta: number;
    }[]
  ) => void;
  /**
   * Set (replace) BL_INPUT cells, targeting a row by (bucket, rowType) and
   * creating it when the project lacks that type. Used by the "paste a
   * MediaBox / MediaOcean month into the BL" tool — each matched channel /
   * partner overwrites its BL row for that month. A null/0 value on an absent
   * row is a no-op (no empty row is created).
   */
  setCellsByType: (updates: SetByTypeUpdate[]) => void;

  // Structure
  addBucket: (name: string) => void;
  /**
   * Paste one or more MediaBox campaigns into BL submission, each as its own
   * project (bucket) named after the campaign, with one row per channel filled
   * across all 12 months. A campaign whose name already matches a project
   * overwrites that project's rows; the rest are created. No-op when locked.
   */
  pasteCampaignsAsProjects: (
    campaigns: CampaignProjectPaste[]
  ) => CampaignPasteResult;
  renameBucket: (bucketId: string, name: string) => void;
  removeBucket: (bucketId: string) => void;
  /** Reorder BL projects (buckets): A-Z / Z-A sort, or move one up/down. */
  sortBuckets: (dir: "asc" | "desc") => void;
  moveBucket: (bucketId: string, direction: "up" | "down") => void;
  /**
   * Mark (or clear) a BL bucket as non-commissionable — excludes its spend from
   * the commission base (computeCommission) while keeping it in every other
   * total. Persisted with the grid's explicit Save like any structure change.
   */
  setBucketNonCommissionable: (bucketId: string, value: boolean) => void;
  addRow: (bucketId: string, rowType: string) => void;
  removeRow: (bucketId: string, rowId: string) => void;
  /**
   * Set (or clear, when empty) the free-text note on a row. Targets a BL row by
   * (bucketId, rowId) or an actuals row by rowId with bucketId null. Persisted
   * with the grid's explicit Save like any structure change.
   */
  setRowNote: (
    category: InputCategory,
    bucketId: string | null,
    rowId: string,
    note: string
  ) => void;
  /**
   * Set (or clear, when empty) the catalog product linked to a BL row (Revenue's
   * "Product Fees" lines). Stores `productId` on the row; the row's label/type
   * stay the stream. Persisted with the grid's explicit Save.
   */
  setRowProduct: (
    bucketId: string,
    rowId: string,
    productId: string
  ) => void;
  /** Actuals (ADMIN_INPUT) — typed rows, no bucket. */
  addActualsRow: (rowType: string) => void;
  removeActualsRow: (rowId: string) => void;
  /** Detail lines (breakdown) on an actuals row — admin-only, like the row. */
  addActualsDetail: (rowId: string) => void;
  removeActualsDetail: (rowId: string, detailId: string) => void;
  setActualsDetailLevel: (
    rowId: string,
    detailId: string,
    index: number,
    value: string
  ) => void;
  /**
   * Set (or clear, when empty) the catalog product linked to an actuals row
   * (Revenue GAIA "Product Fees" roll-up) or one of its detail lines. Mirrors
   * setRowProduct for the ADMIN_INPUT side.
   */
  setActualsRowProduct: (rowId: string, productId: string) => void;
  setActualsDetailProduct: (
    rowId: string,
    detailId: string,
    productId: string
  ) => void;

  // Comparison — fixed base = the current RFQ's BL
  compareRef: ComparisonRef | null;
  setCompareRef: (ref: ComparisonRef | null) => void;
  /**
   * Reference AxisData (the live `data` when self-referencing the current RFQ,
   * the fetched doc otherwise). The comparison view aggregates it through
   * aggregateByType per `compareRef.side`. null while no comparison is active.
   */
  referenceData: AxisData | null;
  referenceLoading: boolean;

  // Persistence
  save: () => Promise<void>;
  discard: () => void;
}

/**
 * Optional behaviors, used by Revenue (Media/Labs pass nothing):
 *   — normalizeLoaded : post-process the fetched AxisData before it becomes the
 *     clean snapshot (e.g. seed Revenue's fixed rows so they aren't "dirty").
 *     Must be a stable reference (module-level function).
 *   — computedRows    : derived, read-only BL rows whose months are overlaid by
 *     rowType (e.g. the computed Commission row). They display, total, compare
 *     and save with the computed value, but are never editable nor dirty.
 *     Either a static array or a function of the live working copy — Revenue
 *     uses the function form so the Commission overlay can react to the axis's
 *     own Commission Overwrite lines. Must be a stable/memoized reference.
 */
export interface UseForecasterGridOptions {
  normalizeLoaded?: (data: AxisData) => AxisData;
  computedRows?:
    | { rowType: string; months: MonthlyMap }[]
    | ((data: AxisData) => { rowType: string; months: MonthlyMap }[]);
  /**
   * Called after a successful Save with the just-persisted data. Used by Media
   * to trigger the derived Revenue commission sync. Fire-and-forget — its work
   * runs outside the save's own loading state.
   */
  onSaved?: (data: AxisData) => void;
}

export function useForecasterGrid(
  config: AxisConfig,
  options?: UseForecasterGridOptions
): UseForecasterGridResult {
  const normalizeLoaded = options?.normalizeLoaded;
  const computedRows = options?.computedRows;
  // Latest onSaved kept in a ref so save() doesn't depend on its identity.
  const onSavedRef = useRef(options?.onSaved);
  onSavedRef.current = options?.onSaved;
  const { user } = useAuth();
  const { isAdmin } = useUserProfile();
  const { selectedClient, selectedYear, selectedRFQ } = useForecastSelection();

  const selectionReady = !!selectedClient && !!selectedYear && !!selectedRFQ;
  const locked = selectedRFQ?.status === "LOCKED";

  // BL row types tracking explicit zeros (config-driven — Revenue's Commission
  // Overwrite). ADMIN_INPUT rows always track them.
  const blZeroRowTypes = config.blExplicitZeroRowTypes;
  const blZeroTypes = useMemo(
    () => new Set(blZeroRowTypes ?? []),
    [blZeroRowTypes]
  );

  // Closed periods for the current RFQ + axis: per-month lock for BLs (admins
  // are never restricted). Independent of the RFQ's global lock. Resolved from
  // the admin-set per-axis override, falling back to the static default.
  const axisClosedMonths = selectedRFQ?.closedMonths?.[config.axisId];
  const closedMonths = useMemo(
    () =>
      new Set(
        selectedRFQ ? resolveClosedMonths(selectedRFQ, config.axisId) : []
      ),
    // axisClosedMonths is read inside resolveClosedMonths; listing it (plus the
    // RFQ type, which drives the default) keeps the memo correct.
    [selectedRFQ?.type, config.axisId, axisClosedMonths]
  );
  const canEditClosed = isAdmin;

  // Firestore snapshot (the "clean" state) + working copy
  const [original, setOriginal] = useState<AxisData>(emptyAxisData());
  const [data, setData] = useState<AxisData>(emptyAxisData());
  const [dirtyMap, setDirtyMap] = useState<DirtyMap>(new Map());
  const [structureDirty, setStructureDirty] = useState(false);

  // The context the loaded snapshot belongs to. Saves write here — not to the
  // current selection — so an autosave (or a flush triggered by switching
  // client/year/RFQ) always lands on the right doc even if the selection has
  // already moved on while the new data is still loading.
  const loadedCtxRef = useRef<{
    cl_id: string;
    year: number;
    rfqType: RFQType;
  } | null>(null);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // Per-side last-save timestamps for the loaded context (display only).
  const [lastUpdated, setLastUpdated] = useState<{
    bl?: string;
    actuals?: string;
  }>({});

  // Comparison — fixed base (the current RFQ's BL) vs reference (rfq, side)
  const [compareRef, setCompareRef] = useState<ComparisonRef | null>(null);
  const [fetchedReference, setFetchedReference] = useState<AxisData | null>(null);
  const [referenceLoading, setReferenceLoading] = useState(false);

  // ─── Loading the selected triplet ─────────────────────────────────────────

  useEffect(() => {
    if (!selectionReady) {
      setOriginal(emptyAxisData());
      setData(emptyAxisData());
      setDirtyMap(new Map());
      setStructureDirty(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError("");

    // BL buckets always come from the submission's data_entries doc. The
    // ADMIN_INPUT (actuals) comes from the annual_actuals doc for axes whose
    // source is annual (Media, Labs) — shared across the year's submissions —
    // and from the submission doc otherwise (Revenue's GAIA).
    Promise.all([
      fetchAxisDataWithMeta(
        selectedClient!.cl_id,
        selectedYear!,
        selectedRFQ!.type,
        config.axisId
      ),
      config.annualActuals
        ? fetchAnnualActualsWithMeta(
            selectedClient!.cl_id,
            selectedYear!,
            config.axisId
          )
        : Promise.resolve(null),
    ])
      .then(([axisRes, annualRes]) => {
        if (cancelled) return;
        const merged =
          annualRes !== null
            ? { ...axisRes.data, actuals: annualRes.rows }
            : axisRes.data;
        // Revenue seeds its fixed rows here so they belong to the clean
        // snapshot and never read as unsaved changes.
        const normalized = normalizeLoaded ? normalizeLoaded(merged) : merged;
        // ADMIN_INPUT roll-up: a row with detail lines derives its months from
        // them (row = Σ details). Applied before the clean snapshot so a doc
        // whose stored parent drifted from its details never reads as dirty.
        const rolled = {
          ...normalized,
          actuals: rollUpActuals(normalized.actuals),
        };
        setOriginal(rolled);
        setData(clone(rolled));
        setDirtyMap(new Map());
        setStructureDirty(false);
        // Per-side last-save stamps. Annual axes (Media, Labs) read the actuals
        // stamp from the shared annual doc; others (Revenue) from the submission
        // doc, alongside the BL stamp.
        setLastUpdated({
          bl: axisRes.meta.blUpdatedAt,
          actuals:
            annualRes !== null
              ? annualRes.updatedAt
              : axisRes.meta.actualsUpdatedAt,
        });
        loadedCtxRef.current = {
          cl_id: selectedClient!.cl_id,
          year: selectedYear!,
          rfqType: selectedRFQ!.type,
        };
      })
      .catch((err) => {
        if (!cancelled) {
          setError("Failed to load data: " + (err?.message ?? "Unknown error"));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      // Switching context (or unmounting) while edits are pending: persist them
      // to the doc they belong to before the new data overwrites the working
      // copy. Fire-and-forget — no state updates, since this view is moving on.
      flushOnSwitchRef.current();
    };
    // selectedRFQ.rfq_id is enough — the (lock) status is handled separately
  }, [
    selectionReady,
    selectedClient?.cl_id,
    selectedYear,
    selectedRFQ?.rfq_id,
    config.axisId,
    config.annualActuals,
    normalizeLoaded,
  ]);

  // Switching client invalidates any pending fetched reference. The default
  // comparison (previous submission) is applied by the page on context change,
  // so we don't clear compareRef here — clearing it would flash the panel empty.
  useEffect(() => {
    setFetchedReference(null);
  }, [selectedClient?.cl_id, selectedYear, selectedRFQ?.rfq_id]);

  // ─── Reference loading (cross-year, either side) ─────────────────────────
  // The reference is any submission of any year, on either side. We avoid a
  // fetch (and use the live working copy `effectiveData`) whenever the
  // reference resolves to data already in memory:
  //   — same submission (year + rfq match): the live BL/actuals working copy
  //   — annual-actuals axis, ADMIN side, same year: the year's annual actuals
  //     ARE the working copy's actuals (shared across the year's submissions)
  // so editing reflects in the comparison without a round-trip.

  const liveReference =
    !!compareRef &&
    compareRef.year === selectedYear &&
    (compareRef.rfq === selectedRFQ?.type ||
      (config.annualActuals && compareRef.side === "ADMIN_INPUT"));

  useEffect(() => {
    if (!selectionReady || !compareRef || liveReference) {
      setFetchedReference(null);
      return;
    }

    let cancelled = false;
    setReferenceLoading(true);

    // Annual MediaOcean of the reference year (rfq irrelevant) vs. a specific
    // submission's doc (BL buckets, or Revenue's GAIA actuals).
    const promise: Promise<AxisData> =
      config.annualActuals && compareRef.side === "ADMIN_INPUT"
        ? fetchAnnualActuals(
            selectedClient!.cl_id,
            compareRef.year,
            config.axisId
          ).then((rows) => ({ buckets: [], actuals: rows }))
        : fetchAxisData(
            selectedClient!.cl_id,
            compareRef.year,
            compareRef.rfq,
            config.axisId
          );

    promise
      .then((axisData) => {
        // Same ADMIN_INPUT roll-up as the working copy, so comparisons read the
        // derived parent values even on docs saved before the roll-up existed.
        if (!cancelled)
          setFetchedReference({
            ...axisData,
            actuals: rollUpActuals(axisData.actuals),
          });
      })
      .catch(() => {
        // An unavailable reference is not a blocking error — just disable it.
        if (!cancelled) setFetchedReference(null);
      })
      .finally(() => {
        if (!cancelled) setReferenceLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    selectionReady,
    compareRef?.year,
    compareRef?.rfq,
    compareRef?.side,
    liveReference,
    selectedClient?.cl_id,
    config.axisId,
    config.annualActuals,
  ]);

  // ─── Computed rows overlay (Revenue's Commission) ───────────────────────
  // Derived, read-only BL rows: their stored months are replaced by the
  // computed values so cells, totals, comparison base and Save all see them,
  // while the underlying `data` stays the user-editable working copy.

  // Resolve the function form against the live working copy (e.g. Revenue's
  // Commission overlay reacting to the Commission Overwrite lines).
  const resolvedComputedRows = useMemo(
    () =>
      (typeof computedRows === "function" ? computedRows(data) : computedRows) ??
      [],
    [computedRows, data]
  );

  const computedTypes = useMemo(
    () => new Set(resolvedComputedRows.map((c) => c.rowType)),
    [resolvedComputedRows]
  );

  const effectiveData: AxisData = useMemo(() => {
    if (resolvedComputedRows.length === 0) return data;
    const overlay = new Map(resolvedComputedRows.map((c) => [c.rowType, c.months]));
    let changed = false;
    const buckets = data.buckets.map((b) => {
      let rowsChanged = false;
      const rows = b.rows.map((r) => {
        const months = overlay.get(r.rowType);
        if (!months) return r;
        rowsChanged = true;
        return { ...r, months: { ...months } };
      });
      if (!rowsChanged) return b;
      changed = true;
      return { ...b, rows };
    });
    return changed ? { ...data, buckets } : data;
  }, [data, resolvedComputedRows]);

  // Is the coord a computed (read-only) BL row? Resolved by rowType.
  const isComputedCoord = useCallback(
    (coord: CellCoord) => {
      if (computedTypes.size === 0 || coord.category !== "BL_INPUT") return false;
      const bucket = data.buckets.find((b) => b.bucketId === coord.bucketId);
      const row = bucket?.rows.find((r) => r.rowId === coord.rowId);
      return !!row && computedTypes.has(row.rowType);
    },
    [computedTypes, data]
  );

  // Reference exposed to the UI: the live working copy (overlay included) when
  // the reference resolves to in-memory data (see `liveReference`), otherwise
  // the fetched doc. null while no comparison is active.
  const referenceData: AxisData | null = !compareRef
    ? null
    : liveReference
    ? effectiveData
    : fetchedReference;

  // ─── Cell editing ─────────────────────────────────────────────────────────

  const getCellValue = useCallback(
    (coord: CellCoord) => getValueIn(effectiveData, coord),
    [effectiveData]
  );

  // Can the current user edit this cell? Single guard applied to every write
  // path (typing, paste, fill, spread, distribute) — keeps BLs from writing
  // into a closed period or a computed row (commission).
  const isCoordEditable = useCallback(
    (coord: CellCoord) => {
      if (locked) return false;
      if (isComputedCoord(coord)) return false;
      if (coord.category === "ADMIN_INPUT") {
        if (!isAdmin) return false;
        // A parent row carrying detail lines is derived (row = Σ details) —
        // only its detail cells are editable.
        if (!coord.detailId) {
          const row = data.actuals.find((r) => r.rowId === coord.rowId);
          if (row?.details?.length) return false;
        }
        return true;
      }
      if (!canEditClosed && closedMonths.has(coord.month)) return false;
      return true;
    },
    [locked, isAdmin, canEditClosed, closedMonths, isComputedCoord, data]
  );

  const setCellValue = useCallback(
    (coord: CellCoord, value: number | null) => {
      if (!isCoordEditable(coord)) return;
      setData((prev) => {
        const next = clone(prev);
        if (coord.category === "ADMIN_INPUT") {
          const row = next.actuals.find((r) => r.rowId === coord.rowId);
          if (!row) return prev;
          if (coord.detailId) {
            const detail = row.details?.find((d) => d.detailId === coord.detailId);
            if (!detail) return prev;
            detail.months[coord.month] = value ?? 0;
            // A committed 0 is deliberate; a cleared cell (null) is no data.
            setRowExplicitZero(detail, coord.month, value === 0);
            // Keep the derived parent in sync (row = Σ details).
            syncParentFromDetails(row);
          } else {
            row.months[coord.month] = value ?? 0;
            // A committed 0 is deliberate (it overrides the BL Input on
            // Revenue); a cleared cell (null) is no data.
            setRowExplicitZero(row, coord.month, value === 0);
          }
        } else {
          const bucket = next.buckets.find((b) => b.bucketId === coord.bucketId);
          const row = bucket?.rows.find((r) => r.rowId === coord.rowId);
          if (!row) return prev;
          row.months[coord.month] = value ?? 0;
          // BL rows tracking explicit zeros (Commission Overwrite): a committed
          // 0 is deliberate; a cleared cell (null) is no data.
          if (blZeroTypes.has(row.rowType))
            setRowExplicitZero(row, coord.month, value === 0);
        }
        return next;
      });

      // Dirty when the cell differs from the clean snapshot; else drop the key.
      setDirtyMap((prev) => {
        const next = new Map(prev);
        const key = buildCellKey(coord);
        if (cellDiffers(original, coord, value, blZeroTypes))
          next.set(key, value ?? 0);
        else next.delete(key);
        return next;
      });
    },
    [original, isCoordEditable, blZeroTypes]
  );

  // Batch write — applies many cell updates in a single state + dirty-map pass.
  // Used by paste, fill (Ctrl+D / Ctrl+R) and the spread tool, which would
  // otherwise clone the whole AxisData once per cell. Updates targeting a cell
  // the user can't edit (closed period for a BL) are dropped up front.
  const setCells = useCallback(
    (rawUpdates: { coord: CellCoord; value: number | null }[]) => {
      const updates = rawUpdates.filter((u) => isCoordEditable(u.coord));
      if (updates.length === 0) return;
      setData((prev) => {
        const next = clone(prev);
        for (const { coord, value } of updates) {
          if (coord.category === "ADMIN_INPUT") {
            const row = next.actuals.find((r) => r.rowId === coord.rowId);
            if (!row) continue;
            if (coord.detailId) {
              const detail = row.details?.find(
                (d) => d.detailId === coord.detailId
              );
              if (detail) {
                detail.months[coord.month] = value ?? 0;
                // A committed 0 is deliberate; a cleared cell (null) is no data.
                setRowExplicitZero(detail, coord.month, value === 0);
                // Keep the derived parent in sync (row = Σ details).
                syncParentFromDetails(row);
              }
            } else {
              row.months[coord.month] = value ?? 0;
              // A committed 0 is deliberate; a cleared cell (null) is no data.
              setRowExplicitZero(row, coord.month, value === 0);
            }
          } else {
            const bucket = next.buckets.find(
              (b) => b.bucketId === coord.bucketId
            );
            const row = bucket?.rows.find((r) => r.rowId === coord.rowId);
            if (row) {
              row.months[coord.month] = value ?? 0;
              // BL rows tracking explicit zeros (Commission Overwrite): a
              // committed 0 is deliberate; a cleared cell (null) is no data.
              if (blZeroTypes.has(row.rowType))
                setRowExplicitZero(row, coord.month, value === 0);
            }
          }
        }
        return next;
      });

      setDirtyMap((prev) => {
        const next = new Map(prev);
        for (const { coord, value } of updates) {
          const key = buildCellKey(coord);
          if (cellDiffers(original, coord, value, blZeroTypes))
            next.set(key, value ?? 0);
          else next.delete(key);
        }
        return next;
      });
    },
    [original, isCoordEditable, blZeroTypes]
  );

  // Add deltas onto BL_INPUT cells, targeting a row by (bucket, rowType) rather
  // than by rowId, and creating the row when the project doesn't have that type
  // yet. Used by the comparison panel's "distribute difference" tool, which
  // pushes a media-type variance into one or several projects across months.
  // Several deltas for the same (bucket, rowType) resolve to one row — created
  // once, then accumulated.
  const addToCells = useCallback(
    (
      rawUpdates: {
        bucketId: string;
        rowType: string;
        month: number;
        delta: number;
      }[]
    ) => {
      // Drop deltas aimed at a closed period the user can't edit (BL).
      const updates = rawUpdates.filter((u) =>
        isCoordEditable({
          category: "BL_INPUT",
          bucketId: u.bucketId,
          rowId: null,
          month: u.month,
        })
      );
      if (updates.length === 0) return;

      const next = clone(data);
      let createdAny = false;
      const touched: { coord: CellCoord; value: number }[] = [];

      for (const u of updates) {
        const bucket = next.buckets.find((b) => b.bucketId === u.bucketId);
        if (!bucket) continue;
        let row = bucket.rows.find((r) => r.rowType === u.rowType);
        if (!row) {
          const label =
            config.rowTypeOptions.find((o) => o.value === u.rowType)?.label ??
            u.rowType;
          row = newRow(u.rowType, label);
          bucket.rows.push(row);
          createdAny = true;
        }
        row.months[u.month] = (row.months[u.month] ?? 0) + u.delta;
        touched.push({
          coord: {
            category: "BL_INPUT",
            bucketId: bucket.bucketId,
            rowId: row.rowId,
            month: u.month,
          },
          value: row.months[u.month],
        });
      }

      setData(next);
      setDirtyMap((prev) => {
        const nextMap = new Map(prev);
        for (const { coord, value } of touched) {
          const key = buildCellKey(coord);
          if (getValueIn(original, coord) !== value) nextMap.set(key, value);
          else nextMap.delete(key);
        }
        return nextMap;
      });
      if (createdAny) setStructureDirty(true);
    },
    [data, original, config, isCoordEditable]
  );

  // Set (replace) BL_INPUT cells, targeting a row by (bucket, rowType) like
  // addToCells but overwriting the month instead of accumulating. Powers the
  // "paste a MediaBox / MediaOcean month into the BL" tool: each matched channel
  // / partner value replaces the BL row's value for that month. A missing row is
  // created only for a non-zero value — never just to store an empty cell.
  // (Media / Labs, the only axes with a MediaBox/MediaOcean source, carry no
  // blExplicitZeroRowTypes, so a set 0 is a plain empty cell here.)
  const setCellsByType = useCallback(
    (rawUpdates: SetByTypeUpdate[]) => {
      // Drop updates aimed at a closed period the user can't edit (BL).
      const updates = rawUpdates.filter((u) =>
        isCoordEditable({
          category: "BL_INPUT",
          bucketId: u.bucketId,
          rowId: null,
          month: u.month,
        })
      );
      if (updates.length === 0) return;

      const next = clone(data);
      let createdAny = false;
      const touched: { coord: CellCoord; value: number }[] = [];

      for (const u of updates) {
        const bucket = next.buckets.find((b) => b.bucketId === u.bucketId);
        if (!bucket) continue;
        const value = u.value ?? 0;
        let row = bucket.rows.find((r) => r.rowType === u.rowType);
        if (!row) {
          // No point creating a row just to store an empty/zero value.
          if (value === 0) continue;
          const label =
            config.rowTypeOptions.find((o) => o.value === u.rowType)?.label ??
            u.rowType;
          row = newRow(u.rowType, label);
          bucket.rows.push(row);
          createdAny = true;
        }
        row.months[u.month] = value;
        touched.push({
          coord: {
            category: "BL_INPUT",
            bucketId: bucket.bucketId,
            rowId: row.rowId,
            month: u.month,
          },
          value,
        });
      }

      setData(next);
      setDirtyMap((prev) => {
        const nextMap = new Map(prev);
        for (const { coord, value } of touched) {
          const key = buildCellKey(coord);
          if (getValueIn(original, coord) !== value) nextMap.set(key, value);
          else nextMap.delete(key);
        }
        return nextMap;
      });
      if (createdAny) setStructureDirty(true);
    },
    [data, original, config, isCoordEditable]
  );

  // ─── Structure (buckets / rows) ─────────────────────────────────────────

  const pasteCampaignsAsProjects = useCallback(
    (campaigns: CampaignProjectPaste[]): CampaignPasteResult => {
      if (locked || campaigns.length === 0) {
        return { created: 0, overwritten: 0 };
      }

      // Count create-vs-overwrite from the current working copy first, so the
      // pure state updater below can be invoked twice (React strict mode) safely.
      const existing = new Set(
        data.buckets.map((b) => b.name.trim().toLowerCase())
      );
      let created = 0;
      let overwritten = 0;
      for (const c of campaigns) {
        const key = c.name.trim().toLowerCase();
        if (existing.has(key)) {
          overwritten++;
        } else {
          created++;
          existing.add(key);
        }
      }

      setData((prev) => {
        const buckets = prev.buckets.map((b) => ({ ...b }));
        const indexByName = new Map<string, number>(
          buckets.map((b, i) => [b.name.trim().toLowerCase(), i])
        );

        for (const camp of campaigns) {
          const rows: ForecastRow[] = camp.channels.map((ch) => {
            const row = newRow(ch.rowType, ch.label);
            row.months = { ...ch.months };
            return row;
          });
          const key = camp.name.trim().toLowerCase();
          const idx = indexByName.get(key);
          if (idx !== undefined) {
            // Overwrite: keep the project's id/name, replace its rows.
            buckets[idx] = { ...buckets[idx], rows };
          } else {
            const nb = newBucket(camp.name);
            nb.rows = rows;
            buckets.push(nb);
            indexByName.set(key, buckets.length - 1);
          }
        }

        return { ...prev, buckets };
      });

      setStructureDirty(true);
      return { created, overwritten };
    },
    [data, locked]
  );

  const addBucket = useCallback((name: string) => {
    setData((prev) => ({ ...prev, buckets: [...prev.buckets, newBucket(name)] }));
    setStructureDirty(true);
  }, []);

  const renameBucket = useCallback((bucketId: string, name: string) => {
    setData((prev) => ({
      ...prev,
      buckets: prev.buckets.map((b) =>
        b.bucketId === bucketId ? { ...b, name } : b
      ),
    }));
    setStructureDirty(true);
  }, []);
  const setBucketNonCommissionable = useCallback(
    (bucketId: string, value: boolean) => {
      setData((prev) => ({
        ...prev,
        buckets: prev.buckets.map((b) =>
          b.bucketId === bucketId ? { ...b, nonCommissionable: value } : b
        ),
      }));
      setStructureDirty(true);
    },
    []
  );

  const removeBucket = useCallback((bucketId: string) => {
    setData((prev) => ({
      ...prev,
      buckets: prev.buckets.filter((b) => b.bucketId !== bucketId),
    }));
    setStructureDirty(true);
    // Purge the dirty keys orphaned by this bucket
    setDirtyMap((prev) => {
      const next = new Map(prev);
      [...next.keys()].forEach((k) => {
        if (k.includes(`:${bucketId}:`)) next.delete(k);
      });
      return next;
    });
  }, []);

  const sortBuckets = useCallback((dir: "asc" | "desc") => {
    setData((prev) => {
      const sorted = [...prev.buckets].sort((a, b) =>
        dir === "asc"
          ? a.name.localeCompare(b.name)
          : b.name.localeCompare(a.name)
      );
      return { ...prev, buckets: sorted };
    });
    setStructureDirty(true);
  }, []);

  const moveBucket = useCallback(
    (bucketId: string, direction: "up" | "down") => {
      setData((prev) => {
        const i = prev.buckets.findIndex((b) => b.bucketId === bucketId);
        if (i === -1) return prev;
        const j = direction === "up" ? i - 1 : i + 1;
        if (j < 0 || j >= prev.buckets.length) return prev;
        const buckets = [...prev.buckets];
        [buckets[i], buckets[j]] = [buckets[j], buckets[i]];
        return { ...prev, buckets };
      });
      setStructureDirty(true);
    },
    []
  );

  const addRow = useCallback(
    (bucketId: string, rowType: string) => {
      const label =
        config.rowTypeOptions.find((o) => o.value === rowType)?.label ?? rowType;
      setData((prev) => ({
        ...prev,
        buckets: prev.buckets.map((b) => {
          if (b.bucketId !== bucketId) return b;
          if (
            !config.allowDuplicateRowTypes &&
            b.rows.some((r) => r.rowType === rowType)
          ) {
            return b; // duplicates forbidden — no-op
          }
          return { ...b, rows: [...b.rows, newRow(rowType, label)] };
        }),
      }));
      setStructureDirty(true);
    },
    [config]
  );

  const removeRow = useCallback((bucketId: string, rowId: string) => {
    setData((prev) => ({
      ...prev,
      buckets: prev.buckets.map((b) =>
        b.bucketId === bucketId
          ? { ...b, rows: b.rows.filter((r) => r.rowId !== rowId) }
          : b
      ),
    }));
    setStructureDirty(true);
    setDirtyMap((prev) => {
      const next = new Map(prev);
      [...next.keys()].forEach((k) => {
        if (k.includes(`:${rowId}:`)) next.delete(k);
      });
      return next;
    });
  }, []);

  // Row note — stored on the row, persisted at Save like a structure change.
  // An empty note removes the field (the button loses its tint and nothing
  // useless is written to Firestore).
  const setRowNote = useCallback(
    (
      category: InputCategory,
      bucketId: string | null,
      rowId: string,
      note: string
    ) => {
      const trimmed = note.trim();
      setData((prev) => {
        const next = clone(prev);
        const rows =
          category === "ADMIN_INPUT"
            ? next.actuals
            : next.buckets.find((b) => b.bucketId === bucketId)?.rows;
        const row = rows?.find((r) => r.rowId === rowId);
        if (!row) return prev;
        if (trimmed) row.note = trimmed;
        else delete row.note;
        return next;
      });
      setStructureDirty(true);
    },
    []
  );

  // Row product link (Revenue "Product Fees" lines) — stored on the row,
  // persisted at Save like a structure change. An empty productId removes the
  // field (mirrors how an empty note is dropped).
  const setRowProduct = useCallback(
    (bucketId: string, rowId: string, productId: string) => {
      const id = productId.trim();
      setData((prev) => {
        const next = clone(prev);
        const row = next.buckets
          .find((b) => b.bucketId === bucketId)
          ?.rows.find((r) => r.rowId === rowId);
        if (!row) return prev;
        if (id) row.productId = id;
        else delete row.productId;
        return next;
      });
      setStructureDirty(true);
    },
    []
  );

  // ─── Actuals (ADMIN_INPUT) — typed rows, no bucket ────────────────────────

  const addActualsRow = useCallback(
    (rowType: string) => {
      const label =
        config.rowTypeOptions.find((o) => o.value === rowType)?.label ?? rowType;
      setData((prev) => {
        if (
          !config.allowDuplicateRowTypes &&
          prev.actuals.some((r) => r.rowType === rowType)
        ) {
          return prev; // duplicates forbidden — no-op
        }
        return { ...prev, actuals: [...prev.actuals, newRow(rowType, label)] };
      });
      setStructureDirty(true);
    },
    [config]
  );

  const removeActualsRow = useCallback((rowId: string) => {
    setData((prev) => ({
      ...prev,
      actuals: prev.actuals.filter((r) => r.rowId !== rowId),
    }));
    setStructureDirty(true);
    setDirtyMap((prev) => {
      const next = new Map(prev);
      [...next.keys()].forEach((k) => {
        if (k.includes(`:${rowId}:`)) next.delete(k);
      });
      return next;
    });
  }, []);

  // ─── Actuals detail lines (breakdown of an ADMIN_INPUT row) ─────────────
  // Each detail carries free-text "levels" + its own 12-month budget. A parent
  // row with details derives its months from them (row = Σ details): its own
  // cells are read-only until the last detail is removed.

  const addActualsDetail = useCallback((rowId: string) => {
    setData((prev) => ({
      ...prev,
      actuals: prev.actuals.map((r) => {
        if (r.rowId !== rowId) return r;
        const details = r.details ?? [];
        // The first detail seeds with the row's current months (explicit zeros
        // included), so the roll-up taking over leaves the displayed total —
        // and the BL-Submission priority — unchanged.
        const detail =
          details.length === 0
            ? {
                ...newDetail(),
                months: { ...r.months },
                ...(r.explicitZeros?.length
                  ? { explicitZeros: [...r.explicitZeros] }
                  : {}),
                // Carry the parent's product link (Revenue Product Fees) onto
                // the first detail, so the roll-up's product survives the
                // switch to a detail breakdown.
                ...(r.productId ? { productId: r.productId } : {}),
              }
            : newDetail();
        // The product link now lives on the detail line(s); drop it from the
        // parent (each detail carries its own).
        const next = { ...r, details: [...details, detail] };
        if (details.length === 0) delete next.productId;
        return next;
      }),
    }));
    setStructureDirty(true);
  }, []);

  const removeActualsDetail = useCallback(
    (rowId: string, detailId: string) => {
      setData((prev) => ({
        ...prev,
        actuals: prev.actuals.map((r) => {
          if (r.rowId !== rowId) return r;
          const details = (r.details ?? []).filter(
            (d) => d.detailId !== detailId
          );
          const next = { ...r };
          // Drop the field entirely when the last detail goes — keeps the doc
          // clean and mirrors how an empty note is removed. The last roll-up
          // stays as the row's months, which become hand-editable again.
          if (details.length === 0) delete next.details;
          else {
            next.details = details;
            // Re-derive the parent from the remaining details.
            syncParentFromDetails(next);
          }
          return next;
        }),
      }));
      setStructureDirty(true);
      setDirtyMap((prev) => {
        const next = new Map(prev);
        [...next.keys()].forEach((k) => {
          if (k.includes(`:${detailId}:`)) next.delete(k);
        });
        return next;
      });
    },
    []
  );

  // Set one info field ("level") of a detail line. Persisted at Save like any
  // structure change.
  const setActualsDetailLevel = useCallback(
    (rowId: string, detailId: string, index: number, value: string) => {
      setData((prev) => {
        const next = clone(prev);
        const row = next.actuals.find((r) => r.rowId === rowId);
        const detail = row?.details?.find((d) => d.detailId === detailId);
        if (!detail) return prev;
        detail.levels[index] = value;
        return next;
      });
      setStructureDirty(true);
    },
    []
  );

  // Product link on an actuals row itself (Revenue Product Fees roll-up — used
  // only while the row has no detail breakdown). Mirrors setRowProduct; an empty
  // productId removes the field.
  const setActualsRowProduct = useCallback(
    (rowId: string, productId: string) => {
      const id = productId.trim();
      setData((prev) => {
        const next = clone(prev);
        const row = next.actuals.find((r) => r.rowId === rowId);
        if (!row) return prev;
        if (id) row.productId = id;
        else delete row.productId;
        return next;
      });
      setStructureDirty(true);
    },
    []
  );

  // Product link on an actuals detail line (Revenue Product Fees breakdown).
  const setActualsDetailProduct = useCallback(
    (rowId: string, detailId: string, productId: string) => {
      const id = productId.trim();
      setData((prev) => {
        const next = clone(prev);
        const detail = next.actuals
          .find((r) => r.rowId === rowId)
          ?.details?.find((d) => d.detailId === detailId);
        if (!detail) return prev;
        if (id) detail.productId = id;
        else delete detail.productId;
        return next;
      });
      setStructureDirty(true);
    },
    []
  );

  // ─── Persistence ──────────────────────────────────────────────────────────

  const hasChanges = dirtyMap.size > 0 || structureDirty;

  // Pure write — persists a snapshot to a given context with no React state
  // changes. Shared by the stateful save() and the fire-and-forget flush that
  // runs when the view switches context or unmounts mid-edit.
  const persist = useCallback(
    async (
      ctx: { cl_id: string; year: number; rfqType: RFQType },
      snapshot: AxisData,
      changes: { bl: boolean; actuals: boolean }
    ) => {
      if (config.annualActuals) {
        // Annual-actuals axis: BL buckets persist on the submission doc (actuals
        // cleared there to purge any legacy per-submission copy); the actuals go
        // to the shared annual doc. The annual write only fires when the actuals
        // actually changed — a BL never edits them (admin-only) and so never
        // triggers a write the security rules would reject.
        await saveAxisData(
          ctx.cl_id,
          ctx.year,
          ctx.rfqType,
          config.axisId,
          { buckets: snapshot.buckets, actuals: [] },
          user?.uid,
          { touchedBL: changes.bl, touchedActuals: false }
        );
        if (changes.actuals) {
          await saveAnnualActuals(
            ctx.cl_id,
            ctx.year,
            config.axisId,
            snapshot.actuals,
            user?.uid
          );
        }
      } else {
        // One doc holds BL + actuals (Revenue's GAIA); stamp each side that
        // changed so the two "last updated" times track independently.
        await saveAxisData(
          ctx.cl_id,
          ctx.year,
          ctx.rfqType,
          config.axisId,
          snapshot,
          user?.uid,
          { touchedBL: changes.bl, touchedActuals: changes.actuals }
        );
      }
    },
    [config.axisId, config.annualActuals, user?.uid]
  );

  const save = useCallback(async () => {
    const ctx = loadedCtxRef.current;
    if (!ctx || locked || !hasChanges) return;
    setSaving(true);
    setError("");
    const changes = diffSides(effectiveData, original);
    try {
      await persist(ctx, effectiveData, changes);
      setOriginal(clone(effectiveData));
      setDirtyMap(new Map());
      setStructureDirty(false);
      // Reflect the new save times locally so the indicator updates without a
      // refetch — only for the side(s) actually written.
      const now = new Date().toISOString();
      setLastUpdated((prev) => ({
        bl: changes.bl ? now : prev.bl,
        actuals: changes.actuals ? now : prev.actuals,
      }));
      onSavedRef.current?.(effectiveData);
    } catch (err: any) {
      setError("Failed to save: " + (err?.message ?? "Unknown error"));
    } finally {
      setSaving(false);
    }
  }, [locked, hasChanges, persist, effectiveData, original]);

  // Latest fire-and-forget flush — refreshed every render so the load effect's
  // cleanup (context switch / unmount) persists the most recent edits to the
  // doc they belong to, without touching state on a view that's going away.
  const flushOnSwitchRef = useRef<() => void>(() => {});
  flushOnSwitchRef.current = () => {
    const ctx = loadedCtxRef.current;
    if (!ctx || !hasChanges) return;
    void persist(ctx, effectiveData, diffSides(effectiveData, original)).catch(
      () => {}
    );
  };

  // Debounced autosave + leave-guards (tab hide, page unload). Disabled on a
  // locked RFQ, where nothing can become dirty anyway.
  const { status: saveStatus } = useAutosave({
    hasChanges,
    saving,
    error: !!error,
    save,
    disabled: locked,
  });

  const discard = useCallback(() => {
    setData(clone(original));
    setDirtyMap(new Map());
    setStructureDirty(false);
    setError("");
  }, [original]);

  return {
    selectionReady,
    loading,
    saving,
    error,
    saveStatus,
    lastUpdated,
    locked,
    canEditActuals: isAdmin && !locked,
    closedMonths,
    canEditClosed,
    data: effectiveData,
    dirtyMap,
    dirtyCount: dirtyMap.size,
    hasChanges,
    getCellValue,
    setCellValue,
    setCells,
    addToCells,
    setCellsByType,
    addBucket,
    pasteCampaignsAsProjects,
    renameBucket,
    removeBucket,
    sortBuckets,
    moveBucket,
    setBucketNonCommissionable,
    addRow,
    removeRow,
    setRowNote,
    setRowProduct,
    addActualsRow,
    removeActualsRow,
    addActualsDetail,
    removeActualsDetail,
    setActualsDetailLevel,
    setActualsRowProduct,
    setActualsDetailProduct,
    compareRef,
    setCompareRef,
    referenceData,
    referenceLoading,
    save,
    discard,
  };
}