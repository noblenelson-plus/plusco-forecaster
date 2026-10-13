// lib/format/mediabox-paste.ts

/**
 * Channel → BL row-type matching for reference data (MediaBox media types /
 * LABS partners, MediaOcean channels) copied into the BL Input — the single
 * source of the aliases and skip list used by "Copy to my submission"
 * (lib/format/reference-copy.ts).
 *
 * Firebase-free — plain data in, plain answers out.
 */

import type { RowTypeOption } from "../types/forecaster.types";

/** Normalize a label/value for tolerant comparison (trim + lowercase). */
function norm(s: string): string {
  return s.trim().toLowerCase();
}

/** Stricter key: lowercase alphanumerics only ("Digital-Direct" = "Digital Direct"). */
function alnum(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Source display names that don't match any BL media-type label/value but map
 * to a known BL rowType code. Keyed by the normalized (`norm`) source label.
 * The one alias map — add new aliases here.
 */
export const MEDIA_LABEL_ALIASES: Record<string, string> = {
  "paid search": "sem",
};

/**
 * Source channels that are a catch-all bucket in MediaBox/MediaOcean, not a BL
 * media type — so they're skipped on copy rather than pasted as a "NOT
 * CONFIGURED" row. (Genuinely unmapped channels are NOT listed here: those still
 * surface as unmatched, so real mapping gaps get noticed and fixed.)
 */
export const SKIP_CHANNELS = new Set(["other"]);

/** True when a source channel label should be skipped entirely on copy. */
export function isSkippedChannel(label: string): boolean {
  return SKIP_CHANNELS.has(norm(label));
}

/**
 * Resolve a source label to a BL row type. A source line carries a display
 * label ("Social", a LABS partner name) or, for MediaOcean, the BL rowType
 * itself; a BL row is keyed by rowType value (the MediaType enum, or a
 * partnerId). Match order: the option's `value` (the stored key), its `label`
 * (the display name — LABS partners are labelled by name), a known alias, then
 * the same three ignoring spaces and punctuation. Returns null when nothing
 * matches, so the caller can surface the dropped line.
 */
export function resolveRowType(
  options: RowTypeOption[],
  sourceLabel: string
): string | null {
  const target = norm(sourceLabel);
  if (!target) return null;
  const byValue = options.find((o) => norm(o.value) === target);
  if (byValue) return byValue.value;
  const byLabel = options.find((o) => norm(o.label) === target);
  if (byLabel) return byLabel.value;

  const loose = alnum(sourceLabel);
  const aliasCode =
    MEDIA_LABEL_ALIASES[target] ??
    Object.entries(MEDIA_LABEL_ALIASES).find(([k]) => alnum(k) === loose)?.[1];
  if (aliasCode) {
    const byAlias = options.find((o) => norm(o.value) === norm(aliasCode));
    if (byAlias) return byAlias.value;
  }

  if (!loose) return null;
  const byLoose = options.find(
    (o) => alnum(o.value) === loose || alnum(o.label) === loose
  );
  return byLoose ? byLoose.value : null;
}
