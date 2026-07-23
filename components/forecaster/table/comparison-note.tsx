// components/forecaster/table/comparison-note.tsx
"use client";

/**
 * Caption naming the submissions a table is comparing.
 *
 * Reads the two selection stores directly rather than taking props, so it can
 * be dropped under any Forecaster table without threading context through.
 *
 * The variance columns are meaningless without knowing which two rounds
 * produced them — this is the label that makes a screenshot of the table
 * self-explanatory in a deck.
 */

import { useForecastSelection } from "../../../lib/stores/forecast-selection.store";
import { useComparisonSelection } from "../../../lib/stores/comparison-selection.store";
import { RFQ_TYPES, type RFQ } from "../../../lib/types/rfq.types";

/** "2026 RFQ2" — uses the display label, so FINAL reads as "Final". */
function submissionLabel(rfq: RFQ | null, year: number | null): string | null {
  if (!rfq) return null;
  const type = RFQ_TYPES.find((t) => t.value === rfq.type)?.label ?? rfq.type;
  return `${year ?? rfq.year} ${type}`;
}
/**
 * Submission labels for the current selection. Shared with export filenames so
 * a sheet is named after the same rounds the caption reports.
 */
export function useSubmissionLabels(): {
  primary: string | null;
  comparison: string | null;
} {
  const { selectedYear, selectedRFQ } = useForecastSelection();
  const { comparisonYear, comparisonRFQ } = useComparisonSelection();

  return {
    primary: submissionLabel(selectedRFQ, selectedYear),
    comparison: submissionLabel(comparisonRFQ, comparisonYear),
  };
}
export default function ComparisonNote({
  className = "",
}: {
  className?: string;
}) {
  const { selectedYear, selectedRFQ } = useForecastSelection();
  const { comparisonYear, comparisonRFQ } = useComparisonSelection();

  const primary = submissionLabel(selectedRFQ, selectedYear);
  const comparison = submissionLabel(comparisonRFQ, comparisonYear);

  // Without a primary submission the table has no data to caption.
  if (!primary) return null;

  return (
    <p className={`text-xs text-muted-foreground ${className}`}>
      {comparison ? (
        <>
          Comparing{" "}
          <span className="font-semibold text-foreground">{primary}</span> vs{" "}
          <span className="font-semibold text-foreground">{comparison}</span>.
        </>
      ) : (
        <>
          Showing <span className="font-semibold text-foreground">{primary}</span> — no comparison selected.
        </>
      )}
    </p>
  );
}