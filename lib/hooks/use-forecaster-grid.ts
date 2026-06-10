// lib/hooks/use-forecaster-grid.ts

/**
 * Hook générique du grid de prévision — partagé par Media, Revenue et Labs.
 *
 * Responsabilités :
 *   — Charger l'AxisData du triplet sélectionné (store Zustand global)
 *   — Maintenir une copie de travail locale + dirty map (Save explicite)
 *   — Mutations de structure : buckets et rows (selon l'AxisConfig)
 *   — Totaux : ligne, bucket/mois, grand total/mois, actuals
 *   — Comparaison : charger un RFQ de référence, retrouver les lignes
 *     correspondantes (par nom de bucket + rowType, puisque les IDs
 *     diffèrent d'un document à l'autre)
 *   — Save : un seul write Firestore de l'axe complet
 *
 * Droits :
 *   — RFQ LOCKED → tout est read-only (BL et admin)
 *   — BL_INPUT éditable par tous si unlocked
 *   — ADMIN_INPUT (actuals) éditable seulement par les admins
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
  emptyAxisData,
  newBucket,
  newRow,
} from "../types/forecaster.types";

// ─── Helpers de calcul purs (exportés — le grid les applique aussi
//     aux données de référence pour les variances de totaux) ─────────────────

/** Total annuel d'une MonthlyMap. */
export function sumMonths(map: MonthlyMap): number {
  return MONTHS.reduce((acc, m) => acc + (map[m] ?? 0), 0);
}

/** Totaux par mois d'un ensemble de lignes. */
export function monthTotals(rows: ForecastRow[]): MonthlyMap {
  const totals: MonthlyMap = Object.fromEntries(MONTHS.map((m) => [m, 0]));
  rows.forEach((row) => {
    MONTHS.forEach((m) => {
      totals[m] += row.months[m] ?? 0;
    });
  });
  return totals;
}

/** Totaux par mois de tout le BL_INPUT d'un axe (tous buckets confondus). */
export function grandMonthTotals(data: AxisData): MonthlyMap {
  return monthTotals(data.buckets.flatMap((b) => b.rows));
}

/** Deep copy sans dépendance — les AxisData sont du JSON pur. */
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

/** Lit la valeur d'une coordonnée dans un AxisData (0 si absente). */
function getValueIn(data: AxisData, coord: CellCoord): number {
  if (coord.category === "ADMIN_INPUT") {
    const row = data.actuals.find((r) => r.rowId === coord.rowId);
    return row?.months[coord.month] ?? 0;
  }
  const bucket = data.buckets.find((b) => b.bucketId === coord.bucketId);
  const row = bucket?.rows.find((r) => r.rowId === coord.rowId);
  return row?.months[coord.month] ?? 0;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface UseForecasterGridResult {
  /** Le triplet client/année/RFQ est-il complet ? Sinon le grid ne s'affiche pas. */
  selectionReady: boolean;

  loading: boolean;
  saving: boolean;
  error: string;
  /** Autosave state for the toolbar indicator (debounced save runs on edit). */
  saveStatus: SaveStatus;
  /** Per-side last-save timestamps (ISO): BL_INPUT and ADMIN_INPUT (actuals). */
  lastUpdated: { bl?: string; actuals?: string };

  /** RFQ verrouillé → aucune édition, pour personne. */
  locked: boolean;
  /** L'utilisateur peut-il éditer les actuals (ADMIN_INPUT) ? */
  canEditActuals: boolean;
  /** Mois (1–12) en période fermée pour le RFQ sélectionné — verrou visuel. */
  closedMonths: Set<number>;
  /** L'utilisateur peut-il éditer les cellules en période fermée ? (admins oui) */
  canEditClosed: boolean;

  /** Copie de travail courante. */
  data: AxisData;
  dirtyMap: DirtyMap;
  dirtyCount: number;
  hasChanges: boolean;

  // Édition de cellules
  getCellValue: (coord: CellCoord) => number;
  setCellValue: (coord: CellCoord, value: number) => void;
  /** Batch write — one state + dirty-map update for many cells (paste, fill, spread). */
  setCells: (updates: { coord: CellCoord; value: number }[]) => void;
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

  // Structure
  addBucket: (name: string) => void;
  renameBucket: (bucketId: string, name: string) => void;
  removeBucket: (bucketId: string) => void;
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
  /** Actuals (ADMIN_INPUT) — lignes typées, sans bucket. */
  addActualsRow: (rowType: string) => void;
  removeActualsRow: (rowId: string) => void;

  // Comparaison — base fixe = BL du RFQ courant
  compareRef: ComparisonRef | null;
  setCompareRef: (ref: ComparisonRef | null) => void;
  /**
   * AxisData de référence (live `data` si auto-référence sur le RFQ courant,
   * sinon le doc chargé). La vue de comparaison l'agrège via aggregateByType
   * selon `compareRef.side`. null tant qu'aucune comparaison n'est active.
   */
  referenceData: AxisData | null;
  referenceLoading: boolean;

  // Persistance
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
 */
export interface UseForecasterGridOptions {
  normalizeLoaded?: (data: AxisData) => AxisData;
  computedRows?: { rowType: string; months: MonthlyMap }[];
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

  // Snapshot Firestore (état "propre") + copie de travail
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

  // Comparaison — base fixe (BL du RFQ courant) vs référence (rfq, side)
  const [compareRef, setCompareRef] = useState<ComparisonRef | null>(null);
  const [fetchedReference, setFetchedReference] = useState<AxisData | null>(null);
  const [referenceLoading, setReferenceLoading] = useState(false);

  // ─── Chargement du triplet sélectionné ──────────────────────────────────

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
        setOriginal(normalized);
        setData(clone(normalized));
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
    // selectedRFQ.rfq_id suffit — le statut (lock) est géré à part
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
        if (!cancelled) setFetchedReference(axisData);
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

  const computedTypes = useMemo(
    () => new Set((computedRows ?? []).map((c) => c.rowType)),
    [computedRows]
  );

  const effectiveData: AxisData = useMemo(() => {
    if (!computedRows || computedRows.length === 0) return data;
    const overlay = new Map(computedRows.map((c) => [c.rowType, c.months]));
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
  }, [data, computedRows]);

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

  // ─── Édition de cellules ────────────────────────────────────────────────

  const getCellValue = useCallback(
    (coord: CellCoord) => getValueIn(effectiveData, coord),
    [effectiveData]
  );

  // Une cellule est-elle modifiable par l'utilisateur courant ? Garde unique
  // appliquée à tous les chemins d'écriture (saisie, coller, remplir, spread,
  // distribution) — empêche les BL d'écrire dans une période fermée ou dans une
  // ligne calculée (commission).
  const isCoordEditable = useCallback(
    (coord: CellCoord) => {
      if (locked) return false;
      if (isComputedCoord(coord)) return false;
      if (coord.category === "ADMIN_INPUT") return isAdmin;
      if (!canEditClosed && closedMonths.has(coord.month)) return false;
      return true;
    },
    [locked, isAdmin, canEditClosed, closedMonths, isComputedCoord]
  );

  const setCellValue = useCallback(
    (coord: CellCoord, value: number) => {
      if (!isCoordEditable(coord)) return;
      setData((prev) => {
        const next = clone(prev);
        if (coord.category === "ADMIN_INPUT") {
          const row = next.actuals.find((r) => r.rowId === coord.rowId);
          if (!row) return prev;
          row.months[coord.month] = value;
        } else {
          const bucket = next.buckets.find((b) => b.bucketId === coord.bucketId);
          const row = bucket?.rows.find((r) => r.rowId === coord.rowId);
          if (!row) return prev;
          row.months[coord.month] = value;
        }
        return next;
      });

      // Dirty si différent du snapshot original ; sinon on nettoie la clé
      setDirtyMap((prev) => {
        const next = new Map(prev);
        const key = buildCellKey(coord);
        if (getValueIn(original, coord) !== value) next.set(key, value);
        else next.delete(key);
        return next;
      });
    },
    [original, isCoordEditable]
  );

  // Batch write — applies many cell updates in a single state + dirty-map pass.
  // Used by paste, fill (Ctrl+D / Ctrl+R) and the spread tool, which would
  // otherwise clone the whole AxisData once per cell. Updates targeting a cell
  // the user can't edit (closed period for a BL) are dropped up front.
  const setCells = useCallback(
    (rawUpdates: { coord: CellCoord; value: number }[]) => {
      const updates = rawUpdates.filter((u) => isCoordEditable(u.coord));
      if (updates.length === 0) return;
      setData((prev) => {
        const next = clone(prev);
        for (const { coord, value } of updates) {
          if (coord.category === "ADMIN_INPUT") {
            const row = next.actuals.find((r) => r.rowId === coord.rowId);
            if (row) row.months[coord.month] = value;
          } else {
            const bucket = next.buckets.find(
              (b) => b.bucketId === coord.bucketId
            );
            const row = bucket?.rows.find((r) => r.rowId === coord.rowId);
            if (row) row.months[coord.month] = value;
          }
        }
        return next;
      });

      setDirtyMap((prev) => {
        const next = new Map(prev);
        for (const { coord, value } of updates) {
          const key = buildCellKey(coord);
          if (getValueIn(original, coord) !== value) next.set(key, value);
          else next.delete(key);
        }
        return next;
      });
    },
    [original, isCoordEditable]
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

  // ─── Structure (buckets / rows) ─────────────────────────────────────────

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

  const removeBucket = useCallback((bucketId: string) => {
    setData((prev) => ({
      ...prev,
      buckets: prev.buckets.filter((b) => b.bucketId !== bucketId),
    }));
    setStructureDirty(true);
    // Purge des dirty keys orphelines de ce bucket
    setDirtyMap((prev) => {
      const next = new Map(prev);
      [...next.keys()].forEach((k) => {
        if (k.includes(`:${bucketId}:`)) next.delete(k);
      });
      return next;
    });
  }, []);

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
            return b; // doublon interdit — no-op
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

  // Note d'une ligne — stockée sur la row, persistée au Save comme une
  // modification de structure. Une note vide retire le champ (le bouton se
  // décolore et rien d'inutile n'est écrit dans Firestore).
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

  // ─── Actuals (ADMIN_INPUT) — lignes typées, sans bucket ─────────────────

  const addActualsRow = useCallback(
    (rowType: string) => {
      const label =
        config.rowTypeOptions.find((o) => o.value === rowType)?.label ?? rowType;
      setData((prev) => {
        if (
          !config.allowDuplicateRowTypes &&
          prev.actuals.some((r) => r.rowType === rowType)
        ) {
          return prev; // doublon interdit — no-op
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

  // ─── Persistance ────────────────────────────────────────────────────────

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
    addBucket,
    renameBucket,
    removeBucket,
    addRow,
    removeRow,
    setRowNote,
    addActualsRow,
    removeActualsRow,
    compareRef,
    setCompareRef,
    referenceData,
    referenceLoading,
    save,
    discard,
  };
}