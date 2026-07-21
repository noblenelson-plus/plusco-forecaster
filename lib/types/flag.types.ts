// lib/types/flag.types.ts

/**
 * "Flags" — automatic warnings raised when a submission moves materially away
 * from the previous RFQ. They are computed live (pure, Firebase-free) from the
 * current working copy of the three axes and the previous submission's data;
 * see lib/flags/flag-rules.ts. A user reviews each flag and attaches a
 * justification (a note + an acknowledged mark) — stored per submission on the
 * data_entries doc (see FlagReview / data-entry-service.ts).
 */

import type { AxisId } from "./forecaster.types";

/** Every flag rule the engine can raise, in display order per axis. */
export type FlagRuleId =
  // Revenue — BL Submission vs the previous RFQ's Official Revenue, annual total.
  | "revenue-bl-submission-vs-official-annual"
  // Media — BL Input per channel, annual total, vs the previous RFQ.
  | "media-channel-variance-annual"
  // Labs — BL Input per partner, annual total, vs the previous RFQ.
  | "labs-partner-variance-annual";

/** How a rule decides it fired: a relative % gap or an absolute-dollar gap. */
export type FlagKind = "relative" | "absolute";

/**
 * One raised flag. `key` is stable across renders and edits — it identifies the
 * flag for its FlagReview (`${axis}:${ruleId}:${subject}`), so acknowledging a
 * flag survives recomputation as long as the same rule fires on the same
 * subject (month / channel / partner / "annual").
 */
export interface Flag {
  key: string;
  axis: AxisId;
  ruleId: FlagRuleId;
  /** Short subject label — e.g. a month ("Mar"), a channel ("Social"), a partner name. */
  title: string;
  /** The current submission's amount for this subject. */
  current: number;
  /** The previous RFQ's amount compared against. */
  reference: number;
  /** current − reference. */
  delta: number;
  /** Relative gap as a share of the reference (e.g. 0.25 = +25%); null when kind is absolute. */
  relative: number | null;
  kind: FlagKind;
  /** The tripped threshold — a fraction (0.20) for relative, dollars (100000) for absolute. */
  threshold: number;
}

/**
 * A user's review of a flag, stored under `flagReviews[flagKey]` on the
 * submission's data_entries doc. `acknowledged` records that the flag was seen
 * and accepted (the flag stays listed with a ✓); `note` is the free-text
 * justification. Editable by an assigned BL or admin even when the RFQ is locked
 * (mirrors the submission note carve-out in the security rules).
 */
export interface FlagReview {
  note: string;
  acknowledged: boolean;
  updatedAt?: string;
  updatedBy?: string; // User UID
}

export type FlagReviewMap = Record<string, FlagReview>;
