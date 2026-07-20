// components/dashboard/charts/colors.ts

/**
 * Chart palette — fixed colors so a media type / revenue stream keeps the same
 * hue across every chart on the dashboard (donut, bars, legend). All hues come
 * from the Plus Company brand palette (Brand Guidelines 2024, "Plus colors" /
 * "Plus infographic").
 */

import type { MediaType } from "../../../lib/types/common.types";
import type { ProductStatus } from "../../../lib/types/product.types";

// Plus Company brand palette.
export const PLUS = {
  pink: "#f2739e",
  lightPink: "#f7b0c9",
  green: "#4db04f",
  yellow: "#ffc929",
  red: "#f54236",
  lightBlue: "#abebf2",
  blue: "#66d9e5",
  purple: "#594a99",
  black: "#000000",
} as const;

export const MEDIA_TYPE_COLORS: Record<MediaType, string> = {
  social: PLUS.yellow, // digital
  programmatic: PLUS.purple, // digital
  sem: PLUS.green, // digital
  digitalDirect: PLUS.blue, // digital
  ooh: PLUS.pink, // traditional
  print: PLUS.lightPink, // traditional
  tv: PLUS.red, // traditional
  radio: PLUS.lightBlue, // traditional
};

export const REVENUE_STREAM_COLORS: Record<string, string> = {
  retainer: PLUS.yellow,
  commission: PLUS.purple,
  commissionOverwrite: PLUS.pink,
  projectFees: PLUS.green,
  productFees: PLUS.blue,
  accrual: PLUS.lightPink,
  // Official Revenue single line — the emerald source-of-truth hue.
  official: PLUS.green,
};

/** Product pipeline statuses — same hues as the Product grid's status chips
 *  (blue → yellow → green pipeline, red for Rejected). */
export const PRODUCT_STATUS_COLORS: Record<ProductStatus, string> = {
  IDENTIFIED_PROSPECT: PLUS.blue,
  PITCHED_TO_CLIENT: PLUS.yellow,
  APPROVED: PLUS.green,
  REJECTED: PLUS.red,
};

/** Cycling palette for ad-hoc categorical breakdowns (regions, business leads). */
export const CATEGORICAL_COLORS = [
  PLUS.yellow,
  PLUS.purple,
  PLUS.green,
  PLUS.blue,
  PLUS.pink,
  PLUS.red,
  PLUS.lightBlue,
  PLUS.lightPink,
];

export const ACCENT = PLUS.yellow;
export const DIGITAL_COLOR = PLUS.purple;
export const TRADITIONAL_COLOR = PLUS.lightPink;
export const TRACK_COLOR = "#f1f5f9"; // slate-100 (chart backgrounds)
export const LABS_COLOR = PLUS.purple; // Labs spend
export const NEUTRAL_FILL = "#e2e8f0"; // slate-200 — "other / remainder" segments
export const POSITIVE_COLOR = PLUS.green; // best / favorable
export const NEGATIVE_COLOR = PLUS.red; // worst / unfavorable
