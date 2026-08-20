// filepath: lib/types/partner-targets.types.ts

/**
 * Per-year partner media-spend targets + the Executive Summary goal lines —
 * the admin-editable source of truth behind the Executive Summary. Stored as
 * ONE Firestore document per year (`partner_targets/{year}`): the year-level
 * Labs-share target, the Exec goal lines, and the array of partner rows.
 * See lib/services/partner-targets-service.ts.
 */

/** The fixed set of deal types (a locked dropdown in the admin UI). */
export const DEAL_TYPES = [
  "Labs",
  "Labs - PBB",
  "Labs - SSP",
  "Labs - BRP",
  "Volume",
] as const;

export type DealType = (typeof DEAL_TYPES)[number];

/** One partner's target for a given year. */
export interface PartnerTarget {
  /** Stable row id (React key + row identity within the year). */
  id: string;
  /** Partner name, e.g. "Amazon", "Billups-OOH", "Corus". */
  partner: string;
  /** Deal type — constrained to DEAL_TYPES. */
  dealType: DealType;
  /** Whether this partner is in the Labs Forecaster 2.0 (the "yes" column). */
  inLabsForecaster2: boolean;
  /** Annual media spend target in CAD; null when not set (typical for Volume). */
  mediaSpendTarget: number | null;
}

/**
 * The Executive Summary goal lines for the year. The Labs *share* goal lives on
 * `totalLabsShareOfMediaTarget` (below); these are the goals that don't derive
 * from the partner rows. All null when not set.
 */
export interface ExecGoals {
  /** Total Labs spend goal in CAD (e.g. 116_500_000). */
  labsSpend: number | null;
  /** Meta total spend goal in CAD — a ceiling shown as "< $XXM". */
  metaSpend: number | null;
  /** Meta share of social goal as a 0..1 ratio (e.g. 0.49). */
  metaShareOfSocial: number | null;
  /** Billups share-of-eligible goal as a 0..1 ratio (e.g. 1.0 for 100%). */
  billupsShare: number | null;
}

/** An ExecGoals with everything unset. */
export const EMPTY_EXEC_GOALS: ExecGoals = {
  labsSpend: null,
  metaSpend: null,
  metaShareOfSocial: null,
  billupsShare: null,
};

/** All partner targets + goals for a single year (one Firestore doc, id = year). */
export interface PartnerTargetsYear {
  /** The year these targets apply to (also the Firestore document id). */
  year: number;
  /**
   * Portfolio-level Total Labs Share of Media target as a 0..1 ratio
   * (e.g. 0.25 for 25%). Null when not set.
   */
  totalLabsShareOfMediaTarget: number | null;
  /** Executive Summary goal lines (Labs spend, Meta spend + share, Billups share). */
  execGoals: ExecGoals;
  /** The partner rows. */
  partners: PartnerTarget[];
}
