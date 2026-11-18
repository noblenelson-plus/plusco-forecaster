// lib/programmatic/programmatic.types.ts

/**
 * Programmatic (preview): programmatic spend by DSP × client × month × Plus
 * media partner, built by scripts/build-programmatic-preview.mjs and stored in
 * Firestore `programmatic_preview` (meta + rows_NNN docs).
 */

export type ProgDsp = "DV360" | "Amazon" | "TTD" | "Yahoo" | "Quantcast" | "StackAdapt";

/** The naming tab's local media category; UNMAPPED = no Plus partner found. */
export type LocalCategory = "LOCAL" | "FOREIGN" | "HYBRID" | "UNKNOWN" | "UNMAPPED";

export interface ProgRow {
  dsp: ProgDsp;
  /** "YYYY-MM" */
  month: string;
  /** MIR client name (PLUSCO_CLIENT_NAME), or "(unmapped) <advertiser>". */
  client: string;
  /** Plus media partner (naming tab), or "(unmapped)". */
  partner: string;
  local: LocalCategory;
  /** Partner name when mapped, else the DSP's own publisher / site / deal label. */
  publisher: string;
  dealType: string;
  /** Which file / table the row came from. */
  source: string;
  /** How the partner was found (order code, SDF deal mapping, alias…) or "none". */
  mappedBy: string;
  spendCad: number;
  impressions: number;
}

/** MIR booked DSP spend (NET_ORDERED_CAD), the coverage reference. */
export interface MirRow {
  dsp: ProgDsp;
  month: string;
  client: string;
  mirCad: number;
}

export interface ProgrammaticPreviewData {
  generatedAt: string;
  year: number;
  months: string[];
  usdRate: number | null;
  usdBasis: string | null;
  rows: ProgRow[];
  mir: MirRow[];
}
