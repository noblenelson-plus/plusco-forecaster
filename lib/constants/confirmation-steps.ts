// lib/constants/confirmation-steps.ts

/**
 * The fixed milestones a user ticks off in "BL Forecast Validation" on the
 * forecast page — they replace the old 12 calendar months. Ordered; `id` is the
 * stable value persisted per submission.
 *
 * Storage note: these ids are stored in the data_entries `readyMonths` field
 * (a legacy name kept so the field list in firestoreRules.txt doesn't change) —
 * it now holds confirmation-step ids, not month numbers.
 *
 * Order matters — the four "Mid-Quarter Validation" steps are distinguished by
 * their position between the RFQ deadlines, not by any displayed date.
 */
export interface ConfirmationStep {
  id: string;
  /** Full label — used in the dropdown and the CSV export. */
  label: string;
  /** Compact label — used for the recap table's column headers. */
  short: string;
}

export const CONFIRMATION_STEPS: ConfirmationStep[] = [
  { id: "rfq0",       label: "RFQ0 (Sept)",                  short: "RFQ0 · Sep" },
  { id: "mqv-2027q1", label: "Mid-Quarter Validation (Jan)", short: "MQV · Jan" },
  { id: "rfq1",       label: "RFQ1 (March)",                 short: "RFQ1 · Mar" },
  { id: "mqv-2027q2", label: "Mid-Quarter Validation (May)", short: "MQV · May" },
  { id: "rfq2",       label: "RFQ2 (June)",                  short: "RFQ2 · Jun" },
  { id: "mqv-2027q3", label: "Mid-Quarter Validation (Aug)", short: "MQV · Aug" },
  { id: "rfq3",       label: "RFQ3 (Sept)",                  short: "RFQ3 · Sep" },
  { id: "mqv-2027q4", label: "Mid-Quarter Validation (Nov)", short: "MQV · Nov" },
];

/** All step ids in order — used for the "All" shortcut. */
export const CONFIRMATION_STEP_IDS: string[] = CONFIRMATION_STEPS.map((s) => s.id);
