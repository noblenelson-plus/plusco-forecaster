// components/dashboard/charts/colors.ts

/**
 * Chart palette — fixed colors so a media type / revenue stream keeps the same
 * hue across every chart on the dashboard (donut, bars, legend). The yellow
 * accent (#f59e0b) matches the app's primary color.
 */

import type { MediaType } from "../../../lib/types/common.types";

export const MEDIA_TYPE_COLORS: Record<MediaType, string> = {
  social: "#f59e0b", // amber (digital)
  programmatic: "#6366f1", // indigo (digital)
  sem: "#10b981", // emerald (digital)
  digitalDirect: "#06b6d4", // cyan (digital)
  ooh: "#8b5cf6", // violet (traditional)
  print: "#ec4899", // pink (traditional)
  tv: "#ef4444", // red (traditional)
  radio: "#64748b", // slate (traditional)
};

export const REVENUE_STREAM_COLORS: Record<string, string> = {
  retainer: "#f59e0b",
  commission: "#6366f1",
  projectFees: "#10b981",
  productFees: "#06b6d4",
};

export const ACCENT = "#f59e0b"; // yellow-500
export const DIGITAL_COLOR = "#6366f1"; // indigo
export const TRADITIONAL_COLOR = "#cbd5e1"; // slate-300
export const TRACK_COLOR = "#f1f5f9"; // slate-100 (chart backgrounds)
