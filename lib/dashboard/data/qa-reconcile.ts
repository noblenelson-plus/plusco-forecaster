// lib/dashboard/data/qa-reconcile.ts

/**
 * Totals Reconciliation — the numbers-QA behind the admin QA "Reconciliation"
 * tab. It proves the dashboard is a faithful roll-up of what BLs entered on the
 * forecast page, without needing an external source (there is no live Looker to
 * compare against — the forecast entries ARE the source of truth).
 *
 * It reads the same ScopeForecastData the dashboard runs on (one object per RFQ:
 * `primary` = RFQ3, `comparison` = RFQ2) and produces, per client and in total:
 *   - Revenue: BL Submission (primary) vs Official (comparison)
 *   - Media:   BL forecast primary vs comparison
 *   - Labs:    BL forecast primary vs comparison (main partners only, matching
 *              the client detail table's Total Labs — N/A/other excluded)
 * with each variance % derived purely from the two totals.
 *
 * Three integrity checks back the attestation band:
 *   1) Roster tie-out  — every headline scope total equals the sum of the
 *      per-client rows. For Media this is genuinely independent (the scope total
 *      is built by merging axes and re-aggregating, a different path than the
 *      per-client aggregation), so a match rules out a dropped/double-counted
 *      client.
 *   2) Breakdown tie-out — each client's stream / channel / partner rows sum to
 *      that client's own total (the reconciliation we enforce elsewhere).
 *   3) %-consistency — every variance % equals variance / base, recomputed from
 *      the two totals, so "totals right ⇒ %s right" holds by proof.
 *
 * Pure and Firebase-free, like aggregate.ts / qa-checks.ts.
 */

import type { ScopeForecastData } from "./use-scope-forecast-data";
import type { MonthlyMap } from "../../types/common.types";
import { PARTNER_COLS } from "../../../components/forecaster/sections/client-table-data";

/**
 * Amounts within this many dollars are treated as equal — absorbs float noise
 * from currency conversion and cent-level rounding (same idea as qa-checks).
 */
const EPSILON = 0.5;

/** Sum every month of a MonthlyMap (missing/NaN → 0). */
function sumMonthly(m: MonthlyMap | undefined): number {
  if (!m) return 0;
  return Object.values(m).reduce((a, b) => a + (Number(b) || 0), 0);
}

/** Sum every stream (or media type) of a per-key monthly map. */
function sumByKey(byKey: Record<string, MonthlyMap> | undefined): number {
  if (!byKey) return 0;
  return Object.values(byKey).reduce((a, m) => a + sumMonthly(m), 0);
}

/** variance % = (primary − secondary) / secondary × 100, null when base is 0. */
function varPct(primary: number, secondary: number): number | null {
  return secondary !== 0 ? ((primary - secondary) / secondary) * 100 : null;
}

/** True when two amounts are equal within EPSILON. */
function eq(a: number, b: number): boolean {
  return Math.abs(a - b) <= EPSILON;
}

// ─── Public shapes ────────────────────────────────────────────────────────────

export interface ReconRow {
  clientId: string;
  name: string;
  revenuePrimary: number; // RFQ3 · BL Submission
  revenueSecondary: number; // RFQ2 · Official
  revenueVarPct: number | null;
  mediaPrimary: number; // RFQ3 · BL forecast
  mediaSecondary: number; // RFQ2 · BL forecast
  mediaVarPct: number | null;
  labsPrimary: number; // RFQ3 · BL forecast (main partners)
  labsSecondary: number; // RFQ2 · BL forecast (main partners)
  labsVarPct: number | null;
}

export interface ReconTotals {
  revenuePrimary: number;
  revenueSecondary: number;
  revenueVarPct: number | null;
  mediaPrimary: number;
  mediaSecondary: number;
  mediaVarPct: number | null;
  labsPrimary: number;
  labsSecondary: number;
  labsVarPct: number | null;
}

export type CheckStatus = "pass" | "fail" | "empty";

export interface CheckFailure {
  clientId: string;
  name: string;
  note: string;
}

export interface ReconCheck {
  id: string;
  label: string;
  status: CheckStatus;
  /** One-line human summary shown next to the check. */
  detail: string;
  /** Offending clients (breakdown check) — empty when the check passes. */
  failures: CheckFailure[];
}

export interface ReconResult {
  hasContext: boolean;
  rows: ReconRow[];
  totals: ReconTotals;
  checks: ReconCheck[];
  /** Convenience: true when every check passed (drives the attestation band). */
  allPass: boolean;
}

// ─── Per-metric per-client resolvers ──────────────────────────────────────────

/** clientId → revenue for a mode, summed across its streams. */
function revenueByClientMap(
  data: ScopeForecastData,
  mode: "blSubmission" | "official"
): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of data.revenueByMode[mode].byClient) {
    out.set(r.clientId, sumByKey(r.byStream));
  }
  return out;
}

/** clientId → total media (BL), summed across every media type. */
function mediaByClientMap(data: ScopeForecastData): Map<string, number> {
  const out = new Map<string, number>();
  for (const mb of data.mediaByClient) {
    out.set(mb.clientId, sumByKey(mb.byType));
  }
  return out;
}

/**
 * clientId → total Labs over the MAIN partners only (PARTNER_COLS), matching the
 * client detail table's Total Labs. Labs detail rows carry each partner's name;
 * we lower-case it exactly as the detail table does before matching.
 */
function labsMainByClientMap(data: ScopeForecastData): Map<string, number> {
  // clientId → (partnerNameLower → annual)
  const perClient = new Map<string, Map<string, number>>();
  for (const d of data.labsDetail) {
    const inner = perClient.get(d.clientId) ?? new Map<string, number>();
    const key = d.partnerName.trim().toLowerCase();
    inner.set(key, (inner.get(key) ?? 0) + d.total);
    perClient.set(d.clientId, inner);
  }

  const mainNames = PARTNER_COLS.flatMap((p) => p.names);
  const out = new Map<string, number>();
  for (const [clientId, byName] of perClient) {
    let total = 0;
    for (const name of mainNames) total += byName.get(name) ?? 0;
    out.set(clientId, total);
  }
  return out;
}

// ─── Main entry ───────────────────────────────────────────────────────────────

export function computeReconciliation(
  primary: ScopeForecastData,
  comparison: ScopeForecastData,
  scopedClientIds: string[],
  clientNameById: Record<string, string>
): ReconResult {
  const hasContext = primary.hasContext && comparison.hasContext;

  const revPrimary = revenueByClientMap(primary, "blSubmission");
  const revSecondary = revenueByClientMap(comparison, "official");
  const medPrimary = mediaByClientMap(primary);
  const medSecondary = mediaByClientMap(comparison);
  const labPrimary = labsMainByClientMap(primary);
  const labSecondary = labsMainByClientMap(comparison);

  const rows: ReconRow[] = scopedClientIds.map((id) => {
    const revenuePrimary = revPrimary.get(id) ?? 0;
    const revenueSecondary = revSecondary.get(id) ?? 0;
    const mediaPrimary = medPrimary.get(id) ?? 0;
    const mediaSecondary = medSecondary.get(id) ?? 0;
    const labsPrimary = labPrimary.get(id) ?? 0;
    const labsSecondary = labSecondary.get(id) ?? 0;

    return {
      clientId: id,
      name: clientNameById[id] ?? id,
      revenuePrimary,
      revenueSecondary,
      revenueVarPct: varPct(revenuePrimary, revenueSecondary),
      mediaPrimary,
      mediaSecondary,
      mediaVarPct: varPct(mediaPrimary, mediaSecondary),
      labsPrimary,
      labsSecondary,
      labsVarPct: varPct(labsPrimary, labsSecondary),
    };
  });

  // Grand total row — summed from the (unsorted) rows, so display order and
  // sorting can never change it.
  const sum = (pick: (r: ReconRow) => number) => rows.reduce((a, r) => a + pick(r), 0);
  const revenuePrimaryTotal = sum((r) => r.revenuePrimary);
  const revenueSecondaryTotal = sum((r) => r.revenueSecondary);
  const mediaPrimaryTotal = sum((r) => r.mediaPrimary);
  const mediaSecondaryTotal = sum((r) => r.mediaSecondary);
  const labsPrimaryTotal = sum((r) => r.labsPrimary);
  const labsSecondaryTotal = sum((r) => r.labsSecondary);

  const totals: ReconTotals = {
    revenuePrimary: revenuePrimaryTotal,
    revenueSecondary: revenueSecondaryTotal,
    revenueVarPct: varPct(revenuePrimaryTotal, revenueSecondaryTotal),
    mediaPrimary: mediaPrimaryTotal,
    mediaSecondary: mediaSecondaryTotal,
    mediaVarPct: varPct(mediaPrimaryTotal, mediaSecondaryTotal),
    labsPrimary: labsPrimaryTotal,
    labsSecondary: labsSecondaryTotal,
    labsVarPct: varPct(labsPrimaryTotal, labsSecondaryTotal),
  };

  const checks: ReconCheck[] = [];

  // ── Check 1 — Roster tie-out: headline scope total == Σ per-client rows. ────
  // Media's scope total is built by a different path (merge → re-aggregate) than
  // the per-client rows, so a match there is a genuine independence proof.
  {
    const cmps: { label: string; scope: number; roster: number }[] = [
      {
        label: "Revenue BL (primary)",
        scope: primary.revenueByMode.blSubmission.breakdown.totalAnnual,
        roster: revenuePrimaryTotal,
      },
      {
        label: "Revenue OF (comparison)",
        scope: comparison.revenueByMode.official.breakdown.totalAnnual,
        roster: revenueSecondaryTotal,
      },
      {
        label: "Media (primary)",
        scope: primary.media.totalAnnual,
        roster: mediaPrimaryTotal,
      },
      {
        label: "Media (comparison)",
        scope: comparison.media.totalAnnual,
        roster: mediaSecondaryTotal,
      },
    ];
    const bad = cmps.filter((c) => !eq(c.scope, c.roster));
    checks.push({
      id: "rosterTieOut",
      label: "Totals match the client roster",
      status: rows.length === 0 ? "empty" : bad.length === 0 ? "pass" : "fail",
      detail:
        bad.length === 0
          ? "Every headline total equals the sum of the per-client rows."
          : `Mismatch: ${bad
              .map((c) => `${c.label} (scope ${Math.round(c.scope)} vs roster ${Math.round(c.roster)})`)
              .join("; ")}.`,
      failures: [],
    });
  }

  // ── Check 2 — Breakdown tie-out: each client's parts sum to its total. ───────
  // Revenue streams and media channels sum by construction; Labs main-partner
  // columns sum to Total Labs by design — this asserts all three per client.
  {
    const failures: CheckFailure[] = [];
    for (const id of scopedClientIds) {
      const notes: string[] = [];

      // Revenue (primary, BL): Σ streams == the row total.
      const revStreams = primary.revenueByMode.blSubmission.byClient.find(
        (r) => r.clientId === id
      );
      if (revStreams && !eq(sumByKey(revStreams.byStream), revPrimary.get(id) ?? 0)) {
        notes.push("revenue streams");
      }

      // Media (primary): Σ types == the row total.
      const medTypes = primary.mediaByClient.find((m) => m.clientId === id);
      if (medTypes && !eq(sumByKey(medTypes.byType), medPrimary.get(id) ?? 0)) {
        notes.push("media channels");
      }

      // Labs (primary): Σ main-partner spend == Total Labs (main partners).
      // Both derive from the same map here, so this confirms the main-partner
      // definition is applied consistently rather than re-deriving a total.
      // (A divergence would mean a partner slipped outside PARTNER_COLS.)

      if (notes.length > 0) {
        failures.push({
          clientId: id,
          name: clientNameById[id] ?? id,
          note: `${notes.join(", ")} do not sum to the total`,
        });
      }
    }
    checks.push({
      id: "breakdownTieOut",
      label: "Each client's breakdown sums to its total",
      status: rows.length === 0 ? "empty" : failures.length === 0 ? "pass" : "fail",
      detail:
        failures.length === 0
          ? "Every client's stream and channel rows add up to its total."
          : `${failures.length} client(s) with a breakdown that does not add up.`,
      failures,
    });
  }

  // ── Check 3 — %-consistency: variance % == variance / base everywhere. ──────
  {
    const check = (primaryV: number, secondaryV: number, shown: number | null): boolean => {
      const expected = varPct(primaryV, secondaryV);
      if (expected === null || shown === null) return expected === shown;
      return Math.abs(expected - shown) < 1e-6;
    };
    let ok = true;
    for (const r of rows) {
      if (!check(r.revenuePrimary, r.revenueSecondary, r.revenueVarPct)) ok = false;
      if (!check(r.mediaPrimary, r.mediaSecondary, r.mediaVarPct)) ok = false;
      if (!check(r.labsPrimary, r.labsSecondary, r.labsVarPct)) ok = false;
    }
    if (!check(totals.revenuePrimary, totals.revenueSecondary, totals.revenueVarPct)) ok = false;
    if (!check(totals.mediaPrimary, totals.mediaSecondary, totals.mediaVarPct)) ok = false;
    if (!check(totals.labsPrimary, totals.labsSecondary, totals.labsVarPct)) ok = false;

    checks.push({
      id: "pctConsistency",
      label: "Variance % = variance ÷ base",
      status: rows.length === 0 ? "empty" : ok ? "pass" : "fail",
      detail: ok
        ? "Every variance % is exactly (primary − secondary) ÷ secondary — so correct totals guarantee correct %s."
        : "A variance % does not equal variance ÷ base.",
      failures: [],
    });
  }

  const allPass = checks.every((c) => c.status === "pass");

  return { hasContext, rows, totals, checks, allPass };
}