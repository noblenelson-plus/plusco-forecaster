// lib/format/actuals-theme.ts

/**
 * Per-source color theme for the actuals sections in the forecast grid, so
 * each data source reads at a glance:
 *   MediaOcean (Media/Labs actuals) → orange
 *   GAIA       (Revenue actuals)     → purple
 *   MediaBox   (synced section)      → blue (themed inline in its own component)
 * Unknown sources fall back to the original neutral grey.
 *
 * Flat Plus style: the section header is a solid color block with white text;
 * data rows stay neutral so the numbers remain easy to scan.
 *
 * Tailwind needs whole class strings to survive purging, so each theme spells
 * its classes out rather than composing them from a color name.
 */
export interface ActualsTheme {
  /** Section header row background + border. */
  headerRow: string;
  /** Section header label text color. */
  headerText: string;
  /** Lock icon color in the header. */
  lockIcon: string;
  /** Data-row background (with group-hover). */
  rowBg: string;
  /** Data-row label text color. */
  labelClass: string;
  /** Empty-state row background + border. */
  emptyRow: string;
}

const ORANGE: ActualsTheme = {
  headerRow: "bg-orange-500 border-y border-orange-500",
  headerText: "text-white",
  lockIcon: "text-orange-200",
  rowBg: "bg-gray-50 group-hover:bg-gray-100",
  labelClass: "text-orange-700",
  emptyRow: "bg-gray-50 border-b border-gray-100",
};

const PURPLE: ActualsTheme = {
  headerRow: "bg-purple-600 border-y border-purple-600",
  headerText: "text-white",
  lockIcon: "text-purple-300",
  rowBg: "bg-gray-50 group-hover:bg-gray-100",
  labelClass: "text-purple-700",
  emptyRow: "bg-gray-50 border-b border-gray-100",
};

const GRAY: ActualsTheme = {
  headerRow: "bg-gray-100 border-y border-gray-200",
  headerText: "text-gray-600",
  lockIcon: "text-gray-400",
  rowBg: "bg-gray-50 group-hover:bg-gray-100",
  labelClass: "text-gray-700",
  emptyRow: "bg-gray-50 border-b border-gray-100",
};

/** Pick the theme for an actuals source by its label (e.g. "MediaOcean"). */
export function actualsTheme(label: string | undefined): ActualsTheme {
  const k = (label ?? "").toLowerCase();
  if (k.includes("mediaocean")) return ORANGE;
  if (k.includes("gaia")) return PURPLE;
  return GRAY;
}
