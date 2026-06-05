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

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth-context";
import { useUserProfile } from "./use-user-profile";
import { useForecastSelection } from "../stores/forecast-selection.store";
import { fetchAxisData, saveAxisData } from "../services/data-entry-service";
import { MONTHS, type MonthlyMap } from "../types/common.types";
import type { RFQType } from "../types/rfq.types";
import {
  type AxisConfig,
  type AxisData,
  type CellCoord,
  type DirtyMap,
  type ForecastBucket,
  type ForecastRow,
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

/** Lit la valeur d'une coordonnée dans un AxisData (0 si absente). */
function getValueIn(data: AxisData, coord: CellCoord): number {
  if (coord.category === "ADMIN_INPUT") {
    return data.actuals[coord.month] ?? 0;
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

  /** RFQ verrouillé → aucune édition, pour personne. */
  locked: boolean;
  /** L'utilisateur peut-il éditer les actuals (ADMIN_INPUT) ? */
  canEditActuals: boolean;

  /** Copie de travail courante. */
  data: AxisData;
  dirtyMap: DirtyMap;
  dirtyCount: number;
  hasChanges: boolean;

  // Édition de cellules
  getCellValue: (coord: CellCoord) => number;
  setCellValue: (coord: CellCoord, value: number) => void;

  // Structure
  addBucket: (name: string) => void;
  renameBucket: (bucketId: string, name: string) => void;
  removeBucket: (bucketId: string) => void;
  addRow: (bucketId: string, rowType: string) => void;
  removeRow: (bucketId: string, rowId: string) => void;

  // Comparaison
  compareRfq: RFQType | null;
  setCompareRfq: (rfq: RFQType | null) => void;
  referenceData: AxisData | null;
  referenceLoading: boolean;
  /** Ligne correspondante dans le RFQ de référence (par nom + type). */
  findReferenceRow: (bucketName: string, rowType: string) => ForecastRow | null;
  /** Bucket correspondant dans la référence (par nom). */
  findReferenceBucket: (bucketName: string) => ForecastBucket | null;

  // Persistance
  save: () => Promise<void>;
  discard: () => void;
}

export function useForecasterGrid(config: AxisConfig): UseForecasterGridResult {
  const { user } = useAuth();
  const { isAdmin } = useUserProfile();
  const { selectedClient, selectedYear, selectedRFQ } = useForecastSelection();

  const selectionReady = !!selectedClient && !!selectedYear && !!selectedRFQ;
  const locked = selectedRFQ?.status === "LOCKED";

  // Snapshot Firestore (état "propre") + copie de travail
  const [original, setOriginal] = useState<AxisData>(emptyAxisData());
  const [data, setData] = useState<AxisData>(emptyAxisData());
  const [dirtyMap, setDirtyMap] = useState<DirtyMap>(new Map());
  const [structureDirty, setStructureDirty] = useState(false);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Comparaison
  const [compareRfq, setCompareRfq] = useState<RFQType | null>(null);
  const [referenceData, setReferenceData] = useState<AxisData | null>(null);
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

    fetchAxisData(
      selectedClient!.cl_id,
      selectedYear!,
      selectedRFQ!.type,
      config.axisId
    )
      .then((axisData) => {
        if (cancelled) return;
        setOriginal(axisData);
        setData(clone(axisData));
        setDirtyMap(new Map());
        setStructureDirty(false);
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
    };
    // selectedRFQ.rfq_id suffit — le statut (lock) est géré à part
  }, [
    selectionReady,
    selectedClient?.cl_id,
    selectedYear,
    selectedRFQ?.rfq_id,
    config.axisId,
  ]);

  // Changer de triplet invalide la comparaison en cours
  useEffect(() => {
    setCompareRfq(null);
    setReferenceData(null);
  }, [selectedClient?.cl_id, selectedYear, selectedRFQ?.rfq_id]);

  // ─── Chargement du RFQ de référence ─────────────────────────────────────

  useEffect(() => {
    if (!selectionReady || !compareRfq) {
      setReferenceData(null);
      return;
    }

    let cancelled = false;
    setReferenceLoading(true);

    fetchAxisData(selectedClient!.cl_id, selectedYear!, compareRfq, config.axisId)
      .then((axisData) => {
        if (!cancelled) setReferenceData(axisData);
      })
      .catch(() => {
        // Référence indisponible ≠ erreur bloquante : on désactive juste
        if (!cancelled) setReferenceData(null);
      })
      .finally(() => {
        if (!cancelled) setReferenceLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectionReady, compareRfq, selectedClient?.cl_id, selectedYear, config.axisId]);

  // ─── Édition de cellules ────────────────────────────────────────────────

  const getCellValue = useCallback(
    (coord: CellCoord) => getValueIn(data, coord),
    [data]
  );

  const setCellValue = useCallback(
    (coord: CellCoord, value: number) => {
      setData((prev) => {
        const next = clone(prev);
        if (coord.category === "ADMIN_INPUT") {
          next.actuals[coord.month] = value;
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
    [original]
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

  // ─── Comparaison : correspondances par nom + type ───────────────────────

  const findReferenceBucket = useCallback(
    (bucketName: string): ForecastBucket | null => {
      if (!referenceData) return null;
      return (
        referenceData.buckets.find(
          (b) => b.name.trim().toLowerCase() === bucketName.trim().toLowerCase()
        ) ?? null
      );
    },
    [referenceData]
  );

  const findReferenceRow = useCallback(
    (bucketName: string, rowType: string): ForecastRow | null => {
      const bucket = findReferenceBucket(bucketName);
      return bucket?.rows.find((r) => r.rowType === rowType) ?? null;
    },
    [findReferenceBucket]
  );

  // ─── Persistance ────────────────────────────────────────────────────────

  const hasChanges = dirtyMap.size > 0 || structureDirty;

  const save = useCallback(async () => {
    if (!selectionReady || locked || !hasChanges) return;
    setSaving(true);
    setError("");
    try {
      await saveAxisData(
        selectedClient!.cl_id,
        selectedYear!,
        selectedRFQ!.type,
        config.axisId,
        data,
        user?.uid
      );
      setOriginal(clone(data));
      setDirtyMap(new Map());
      setStructureDirty(false);
    } catch (err: any) {
      setError("Failed to save: " + (err?.message ?? "Unknown error"));
    } finally {
      setSaving(false);
    }
  }, [
    selectionReady,
    locked,
    hasChanges,
    selectedClient,
    selectedYear,
    selectedRFQ,
    config.axisId,
    data,
    user?.uid,
  ]);

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
    locked,
    canEditActuals: isAdmin && !locked,
    data,
    dirtyMap,
    dirtyCount: dirtyMap.size,
    hasChanges,
    getCellValue,
    setCellValue,
    addBucket,
    renameBucket,
    removeBucket,
    addRow,
    removeRow,
    compareRfq,
    setCompareRfq,
    referenceData,
    referenceLoading,
    findReferenceRow,
    findReferenceBucket,
    save,
    discard,
  };
}