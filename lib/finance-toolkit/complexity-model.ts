// filepath: lib/finance-toolkit/complexity-model.ts

/**
 * Finance Toolkit · Staffing — what explains how many hours a client takes
 * per $1M of media. Ordinary least squares on the comparable clients, fitted
 * in the browser from the same data the tab shows, so the findings always
 * match the table and anyone can redo them in a sheet (LINEST on the export).
 *
 *   y  = ln(client hours per $1M of media)
 *   x  = ln(media spend in $M), digital share (0–1), and the complexity
 *        measures from Finance_Toolkit.staffing_campaign_complexity:
 *        ln(campaigns per $1M), ln(avg tactics / publishers / media types per campaign)
 *
 * Logs because the effects are proportional: a coefficient b on ln(x) means
 * doubling x changes hours per $1M by 2^b (b = 0.2 → +15%).
 */

import type { StaffingRow } from "./staffing";

export type Predictor = "lnSpend" | "digital" | "lnCampaignsPerM" | "lnTacticsPerCampaign" | "lnPublishersPerCampaign" | "lnMediaTypesPerCampaign";

export const PREDICTOR_LABEL: Record<Predictor, string> = {
  lnSpend: "Size (media spend)",
  digital: "Digital share",
  lnCampaignsPerM: "Campaigns per $1M",
  lnTacticsPerCampaign: "Tactics per campaign",
  lnPublishersPerCampaign: "Publishers per campaign",
  lnMediaTypesPerCampaign: "Media types per campaign",
};

export const MODELS: { id: string; label: string; predictors: Predictor[] }[] = [
  { id: "base", label: "Size and digital share", predictors: ["lnSpend", "digital"] },
  { id: "campaigns", label: "+ campaigns per $1M", predictors: ["lnSpend", "digital", "lnCampaignsPerM"] },
  { id: "tactics", label: "+ tactics per campaign", predictors: ["lnSpend", "digital", "lnTacticsPerCampaign"] },
  { id: "publishers", label: "+ publishers per campaign", predictors: ["lnSpend", "digital", "lnPublishersPerCampaign"] },
  { id: "mediaTypes", label: "+ media types per campaign", predictors: ["lnSpend", "digital", "lnMediaTypesPerCampaign"] },
  {
    id: "all",
    label: "+ all four complexity measures",
    predictors: ["lnSpend", "digital", "lnCampaignsPerM", "lnTacticsPerCampaign", "lnPublishersPerCampaign", "lnMediaTypesPerCampaign"],
  },
];

/** The model used for "expected hours": size, digital share and campaigns per $1M. */
export const CHOSEN_MODEL = "campaigns";

export interface Fit {
  id: string;
  label: string;
  predictors: Predictor[];
  /** Intercept first, then one per predictor. */
  coef: number[];
  /** Coefficient ÷ standard error; |t| ≥ 2 is a reliable effect. */
  t: number[];
  r2: number;
  adjR2: number;
  n: number;
}

export interface ComplexityAnalysis {
  fits: Fit[];
  chosen: Fit;
  /** Client id → expected hours per $1M under the chosen model. */
  expected: Map<string, number>;
}

function features(r: StaffingRow): Record<Predictor, number> | null {
  const c = r.client;
  const cc = c.campaignComplexity;
  if (!cc || cc.campaigns < 1 || c.spend <= 0 || !r.hoursPerMillion) return null;
  const spendM = c.spend / 1e6;
  return {
    lnSpend: Math.log(spendM),
    digital: c.digitalSpend / c.spend,
    lnCampaignsPerM: Math.log(cc.campaigns / spendM),
    lnTacticsPerCampaign: Math.log(Math.max(cc.avgTactics, 1)),
    lnPublishersPerCampaign: Math.log(Math.max(cc.avgPublishers, 1)),
    lnMediaTypesPerCampaign: Math.log(Math.max(cc.avgMediaTypes, 1)),
  };
}

/** Solves A·x = b (Gauss-Jordan with partial pivoting) and returns x and A⁻¹. */
function solve(A: number[][], b: number[]): { x: number[]; inv: number[][] } {
  const n = A.length;
  const M = A.map((row, i) => [...row, b[i], ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    const d = M[c][c];
    for (let k = 0; k < M[c].length; k++) M[c][k] /= d;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c];
      for (let k = 0; k < M[r].length; k++) M[r][k] -= f * M[c][k];
    }
  }
  return { x: M.map((row) => row[n]), inv: M.map((row) => row.slice(n + 1)) };
}

function fit(rows: { y: number; f: Record<Predictor, number> }[], model: (typeof MODELS)[number]): Fit {
  const X = rows.map((r) => [1, ...model.predictors.map((p) => r.f[p])]);
  const y = rows.map((r) => r.y);
  const p = X[0].length;
  const XtX = Array.from({ length: p }, (_, i) => Array.from({ length: p }, (_, j) => X.reduce((a, row) => a + row[i] * row[j], 0)));
  const Xty = Array.from({ length: p }, (_, i) => X.reduce((a, row, n) => a + row[i] * y[n], 0));
  const { x: coef, inv } = solve(XtX, Xty);
  const yhat = X.map((row) => row.reduce((a, v, i) => a + v * coef[i], 0));
  const mean = y.reduce((a, v) => a + v, 0) / y.length;
  const ssr = y.reduce((a, v, i) => a + (v - yhat[i]) ** 2, 0);
  const sst = y.reduce((a, v) => a + (v - mean) ** 2, 0);
  const n = y.length;
  const r2 = sst === 0 ? 0 : 1 - ssr / sst;
  const s2 = ssr / Math.max(1, n - p);
  return {
    id: model.id,
    label: model.label,
    predictors: model.predictors,
    coef,
    t: coef.map((b, i) => b / Math.sqrt(s2 * inv[i][i])),
    r2,
    adjR2: 1 - ((1 - r2) * (n - 1)) / Math.max(1, n - p),
    n,
  };
}

/** Fits every model on the comparable clients with MediaBox campaigns; null when too few. */
export function analyzeComplexity(rows: StaffingRow[]): ComplexityAnalysis | null {
  const data = rows
    .filter((r) => r.comparable)
    .map((r) => ({ id: r.client.id, y: Math.log(r.hoursPerMillion ?? 0), f: features(r) }))
    .filter((d): d is { id: string; y: number; f: Record<Predictor, number> } => d.f !== null && Number.isFinite(d.y));
  if (data.length < 20) return null;
  const fits = MODELS.map((m) => fit(data, m));
  const chosen = fits.find((f) => f.id === CHOSEN_MODEL)!;
  const expected = new Map<string, number>();
  for (const r of rows) {
    const f = features(r);
    if (!f) continue;
    const lnY = chosen.coef[0] + chosen.predictors.reduce((a, p, i) => a + chosen.coef[i + 1] * f[p], 0);
    expected.set(r.client.id, Math.exp(lnY));
  }
  return { fits, chosen, expected };
}

/** "Doubling X changes hours per $1M by …" for a log predictor; per +10 points for digital share. */
export function effectLabel(p: Predictor, b: number): string {
  if (p === "digital") {
    const pctChange = Math.exp(b * 0.1) - 1;
    return `${pctChange >= 0 ? "+" : "−"}${Math.abs(pctChange * 100).toFixed(0)}% for every 10 more points of digital`;
  }
  const pctChange = Math.pow(2, b) - 1;
  return `${pctChange >= 0 ? "+" : "−"}${Math.abs(pctChange * 100).toFixed(0)}% when it doubles`;
}
