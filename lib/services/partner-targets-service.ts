// filepath: lib/services/partner-targets-service.ts

/**
 * Firestore access for the per-year partner targets + Exec goals
 * (`partner_targets/{year}`). One document per year, mirroring currency-service:
 * a real-time subscription, a one-shot read, an upsert (setDoc keyed by year),
 * and a delete. Components and hooks call this service rather than touching
 * Firestore directly.
 */

import {
  collection,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  onSnapshot,
  Unsubscribe,
} from "firebase/firestore";
import { db } from "../firebase";
import {
  DEAL_TYPES,
  EMPTY_EXEC_GOALS,
  type ExecGoals,
  type PartnerTargetsYear,
  type PartnerTarget,
  type DealType,
} from "../types/partner-targets.types";

const COLLECTION = "partner_targets";

// ─── Reads ────────────────────────────────────────────────────────────────────

/**
 * Subscribe to every year's targets in real time, sorted by year (most recent
 * first). The collection is tiny (one doc per year), so we sort in memory.
 */
export function subscribeToPartnerTargets(
  onData: (years: PartnerTargetsYear[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, COLLECTION),
    (snap) => {
      const years = snap.docs.map((d) => normalizeYear(d.data()));
      years.sort((a, b) => b.year - a.year);
      onData(years);
    },
    (err) => onError?.(err)
  );
}

/** One-shot read of a single year's targets (document id = year). */
export async function fetchPartnerTargetsForYear(
  year: number
): Promise<PartnerTargetsYear | undefined> {
  const snap = await getDoc(doc(db, COLLECTION, String(year)));
  return snap.exists() ? normalizeYear(snap.data()) : undefined;
}

// ─── Writes ───────────────────────────────────────────────────────────────────

/**
 * Create or update a whole year's targets (upsert; the document id is the year,
 * so a year always has exactly one targets doc). Validates the shape before
 * writing so a malformed row or goal can't reach Firestore.
 */
export async function setPartnerTargetsForYear(
  data: PartnerTargetsYear
): Promise<void> {
  if (!Number.isInteger(data.year) || data.year < 2020 || data.year > 2100) {
    throw new Error("Year must be an integer between 2020 and 2100.");
  }

  const share = data.totalLabsShareOfMediaTarget;
  if (share !== null && (!Number.isFinite(share) || share < 0 || share > 1)) {
    throw new Error(
      "Total Labs Share of Media target must be a ratio between 0 and 1 (or empty)."
    );
  }

  if (!Array.isArray(data.partners)) {
    throw new Error("Partners must be a list.");
  }

  const goals = validateGoals(data.execGoals ?? EMPTY_EXEC_GOALS);

  const allowed = new Set<string>(DEAL_TYPES);
  const partners: PartnerTarget[] = data.partners.map((p, i) => {
    const partner = (p.partner ?? "").toString().trim();
    if (partner === "") {
      throw new Error(`Row ${i + 1}: partner name is required.`);
    }
    if (!allowed.has(p.dealType)) {
      throw new Error(`Row ${i + 1} (${partner}): invalid deal type.`);
    }
    const target = p.mediaSpendTarget;
    if (target !== null && (!Number.isFinite(target) || target < 0)) {
      throw new Error(
        `Row ${i + 1} (${partner}): media spend target must be a positive number (or empty).`
      );
    }
    return {
      id: (p.id ?? "").toString() || makePartnerRow().id,
      partner,
      dealType: p.dealType,
      inLabsForecaster2: Boolean(p.inLabsForecaster2),
      mediaSpendTarget: target ?? null,
    };
  });

  const payload: PartnerTargetsYear = {
    year: data.year,
    totalLabsShareOfMediaTarget: share ?? null,
    execGoals: goals,
    partners,
  };

  await setDoc(doc(db, COLLECTION, String(data.year)), payload);
}

/** Delete a whole year's targets. */
export async function deletePartnerTargetsYear(year: number): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, String(year)));
}

// ─── In-memory + factory helpers ──────────────────────────────────────────────

/** Find a year's targets in a loaded list, or undefined. */
export function getPartnerTargetsForYear(
  years: PartnerTargetsYear[],
  year: number
): PartnerTargetsYear | undefined {
  return years.find((y) => y.year === year);
}

/** A fresh, empty partner row with a stable id. */
export function makePartnerRow(
  partial: Partial<PartnerTarget> = {}
): PartnerTarget {
  return {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `row_${Math.random().toString(36).slice(2)}_${Date.now()}`,
    partner: partial.partner ?? "",
    dealType: (partial.dealType ?? "Labs") as DealType,
    inLabsForecaster2: partial.inLabsForecaster2 ?? false,
    mediaSpendTarget: partial.mediaSpendTarget ?? null,
  };
}

/** An empty targets document for a brand-new year. */
export function emptyPartnerTargetsYear(year: number): PartnerTargetsYear {
  return {
    year,
    totalLabsShareOfMediaTarget: null,
    execGoals: { ...EMPTY_EXEC_GOALS },
    partners: [],
  };
}

// ─── Internal ─────────────────────────────────────────────────────────────────

/** Coerce one raw value to a finite number, or null. */
function toNumOrNull(v: unknown): number | null {
  if (v === null || v === undefined || !Number.isFinite(Number(v))) return null;
  return Number(v);
}

/** Validate the Exec goals (shares are 0..1 ratios; spends are >= 0). */
function validateGoals(g: ExecGoals): ExecGoals {
  const spend = (label: string, v: number | null): number | null => {
    if (v !== null && (!Number.isFinite(v) || v < 0)) {
      throw new Error(`${label} must be a positive number (or empty).`);
    }
    return v ?? null;
  };
  const ratio = (label: string, v: number | null): number | null => {
    if (v !== null && (!Number.isFinite(v) || v < 0 || v > 1)) {
      throw new Error(`${label} must be a ratio between 0 and 1 (or empty).`);
    }
    return v ?? null;
  };
  return {
    labsSpend: spend("Labs spend goal", g.labsSpend),
    metaSpend: spend("Meta spend goal", g.metaSpend),
    metaShareOfSocial: ratio("Meta share goal", g.metaShareOfSocial),
    billupsShare: ratio("Billups share goal", g.billupsShare),
  };
}

/** Coerce a raw Firestore goals object into a well-formed ExecGoals. */
function normalizeGoals(raw: unknown): ExecGoals {
  const g = (raw ?? {}) as Record<string, unknown>;
  return {
    labsSpend: toNumOrNull(g.labsSpend),
    metaSpend: toNumOrNull(g.metaSpend),
    metaShareOfSocial: toNumOrNull(g.metaShareOfSocial),
    billupsShare: toNumOrNull(g.billupsShare),
  };
}

/** Coerce a raw Firestore doc into a well-formed PartnerTargetsYear. */
function normalizeYear(raw: unknown): PartnerTargetsYear {
  const data = (raw ?? {}) as Record<string, unknown>;
  const year = Number(data.year);
  const share = toNumOrNull(data.totalLabsShareOfMediaTarget);
  const partnersRaw = Array.isArray(data.partners) ? data.partners : [];
  const allowed = new Set<string>(DEAL_TYPES);

  const partners: PartnerTarget[] = partnersRaw.map((p) => {
    const row = (p ?? {}) as Record<string, unknown>;
    const dealType = allowed.has(String(row.dealType))
      ? (String(row.dealType) as DealType)
      : "Labs";
    return {
      id: (row.id ?? "").toString() || makePartnerRow().id,
      partner: (row.partner ?? "").toString(),
      dealType,
      inLabsForecaster2: Boolean(row.inLabsForecaster2),
      mediaSpendTarget: toNumOrNull(row.mediaSpendTarget),
    };
  });

  return {
    year: Number.isFinite(year) ? year : 0,
    totalLabsShareOfMediaTarget: share,
    execGoals: normalizeGoals(data.execGoals),
    partners,
  };
}
