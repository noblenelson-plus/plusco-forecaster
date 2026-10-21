// components/forecaster/copy-to-submission-modal.tsx
"use client";

/**
 * "Copy to my submission" — the one structured way to copy reference data
 * (ticked MediaBox or MediaOcean rows) into the BL submission. One dialog, two
 * required choices made together:
 *
 *   1. Destination — into one existing project, or split by campaign (one
 *      project per campaign, matched by name; a missing one is created). The
 *      campaign → project mapping is previewed before confirming.
 *   2. Period — which months to copy. None are ticked at first: the user must
 *      pick them (a shortcut ticks every month with data).
 *
 * The outcome is planned live (lib/format/reference-copy) so the dialog always
 * says what happens to the data already in the submission: copied values
 * replace (never add to) the matching cells, and every filled cell that would
 * change is listed with its current and new value. It also reports channels
 * that match no BL row type or are skipped on purpose. Confirming writes the plan
 * through grid.applyReferencePaste — one undoable step, then autosaved.
 */

import { useMemo, useState } from "react";
import { ArrowRight, ClipboardPaste, FolderPlus, X } from "lucide-react";
import type { AxisConfig } from "../../lib/types/forecaster.types";
import type { UseForecasterGridResult } from "../../lib/hooks/use-forecaster-grid";
import {
  monthsWithData,
  planReferenceCopy,
  type CopyDestination,
  type ReferenceLeaf,
} from "../../lib/format/reference-copy";
import { MONTHS } from "../../lib/types/common.types";
import { showForecastToast } from "../../lib/format/toast";
import {
  CopyMonthPicker,
  CopyOverwritePreview,
  money,
  plural,
} from "./copy-plan-sections";

export default function CopyToSubmissionModal({
  sourceLabel,
  leaves,
  config,
  grid,
  onClose,
  onCopied,
}: {
  /** "MediaBox" or the actuals label ("MediaOcean"). */
  sourceLabel: string;
  /** The ticked leaves, resolved to their values. */
  leaves: ReferenceLeaf[];
  config: AxisConfig;
  grid: UseForecasterGridResult;
  onClose: () => void;
  /** After a successful copy (the grid clears the ticked rows). */
  onCopied: () => void;
}) {
  const buckets = grid.data.buckets;
  const bucketNoun = config.bucketLabel.toLowerCase();
  const typeNoun = config.rowTypeLabel.toLowerCase();

  // Months the user may write: closed periods are read-only for non-admins.
  const isMonthOpen = (m: number) => grid.canEditClosed || !grid.closedMonths.has(m);
  const dataMonths = useMemo(() => monthsWithData(leaves), [leaves]);

  const [kind, setKind] = useState<CopyDestination["kind"]>(
    buckets.length > 0 ? "project" : "split"
  );
  const [bucketId, setBucketId] = useState<string>(buckets[0]?.bucketId ?? "");
  // No month is preselected: the user chooses what to copy on purpose.
  const [months, setMonths] = useState<Set<number>>(() => new Set());

  const destination: CopyDestination | null =
    kind === "split"
      ? { kind: "split" }
      : buckets.some((b) => b.bucketId === bucketId)
        ? { kind: "project", bucketId }
        : null;

  const chosenMonths = MONTHS.filter((m) => months.has(m) && isMonthOpen(m));

  const plan = useMemo(
    () =>
      destination
        ? planReferenceCopy({
            leaves,
            months: chosenMonths,
            destination,
            buckets,
            rowTypeOptions: config.rowTypeOptions,
          })
        : null,
    // `destination`/`chosenMonths` are rebuilt each render; key on their parts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [leaves, kind, bucketId, months, buckets, config.rowTypeOptions, grid.closedMonths, grid.canEditClosed]
  );

  const selectedTotal = leaves.reduce(
    (acc, l) => acc + MONTHS.reduce((s, m) => s + (l.months[m] ?? 0), 0),
    0
  );
  const campaignCount = new Set(leaves.map((l) => l.campaign)).size;

  const canCopy = !!plan && plan.cellCount > 0 && !grid.locked;
  const overwriting = (plan?.overwrittenCells ?? 0) > 0;

  function confirm() {
    if (!plan || !canCopy) return;
    const { created, cells } = grid.applyReferencePaste(plan.projects);
    const parts = [
      `Copied ${sourceLabel} → ${plural(plan.projects.length, bucketNoun)}`,
      plural(cells, "cell"),
    ];
    if (created) parts.push(`${created} created`);
    if (plan.overwrittenCells) parts.push(`${plan.overwrittenCells} overwritten`);
    if (plan.unmatched.length) parts.push(`${plan.unmatched.length} unmatched`);
    showForecastToast(parts.join(" · "), plan.unmatched.length ? "warning" : "success");
    onCopied();
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Copy to my submission"
        className="w-full max-w-lg bg-white shadow-2xl flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gray-900 px-5 py-4 flex items-start justify-between flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-white">Copy to my submission</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {plural(leaves.length, "row")} from {sourceLabel} ·{" "}
              {plural(campaignCount, "campaign")} · {money(selectedTotal)} for the year
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 text-gray-400 hover:bg-gray-800 hover:text-white transition-colors flex-shrink-0"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 flex-1 overflow-y-auto space-y-5">
          {/* 1. Destination */}
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              1 · Where should it go?
            </h3>

            <label
              className={`flex items-start gap-2 select-none ${
                buckets.length === 0 ? "opacity-50" : "cursor-pointer"
              }`}
            >
              <input
                type="radio"
                name="copy-destination"
                checked={kind === "project"}
                disabled={buckets.length === 0}
                onChange={() => setKind("project")}
                className="mt-0.5 accent-gray-900"
              />
              <span className="flex-1 text-sm text-gray-700">
                Into one {bucketNoun}
                <span className="block text-xs text-gray-400">
                  Everything ticked is summed by {typeNoun} into a single {bucketNoun}.
                </span>
                {kind === "project" &&
                  buckets.length > 0 &&
                  (buckets.length > 1 ? (
                    <select
                      value={bucketId}
                      onChange={(e) => setBucketId(e.target.value)}
                      className="mt-1.5 w-full px-3 py-2 text-sm border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-yellow-400 cursor-pointer"
                    >
                      {buckets.map((b) => (
                        <option key={b.bucketId} value={b.bucketId}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="mt-1 block text-xs font-medium text-gray-900">
                      → {buckets[0].name}
                    </span>
                  ))}
              </span>
            </label>

            <label className="flex items-start gap-2 cursor-pointer select-none">
              <input
                type="radio"
                name="copy-destination"
                checked={kind === "split"}
                onChange={() => setKind("split")}
                className="mt-0.5 accent-gray-900"
              />
              <span className="flex-1 text-sm text-gray-700">
                Split by campaign
                <span className="block text-xs text-gray-400">
                  One {bucketNoun} per campaign, matched by name — a {bucketNoun} is
                  created for any campaign that has none yet.
                </span>
              </span>
            </label>

            {/* Split mapping preview */}
            {kind === "split" && plan && plan.projects.length > 0 && (
              <ul className="ml-6 border border-gray-200 divide-y divide-gray-100 text-xs max-h-40 overflow-y-auto">
                {plan.projects.map((p) => (
                  <li key={p.bucketId ?? `new:${p.name}`} className="flex items-center gap-2 px-3 py-1.5">
                    <span className="min-w-0 flex-1 truncate text-gray-700" title={p.campaigns.join(", ")}>
                      {p.campaigns.join(", ")}
                    </span>
                    <ArrowRight size={12} className="flex-shrink-0 text-gray-300" />
                    {p.bucketId ? (
                      <span className="max-w-[45%] truncate font-medium text-gray-900" title={p.name}>
                        {p.name}
                      </span>
                    ) : (
                      <span className="flex max-w-[45%] items-center gap-1 font-medium text-gray-900">
                        <FolderPlus size={12} className="flex-shrink-0" />
                        <span className="truncate" title={p.name}>{p.name}</span>
                        <span className="flex-shrink-0 bg-green-500 px-1 text-[10px] font-semibold text-white">
                          will be created
                        </span>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* 2. Period */}
          <CopyMonthPicker
            step={2}
            months={months}
            onChange={setMonths}
            dataMonths={dataMonths}
            isMonthOpen={isMonthOpen}
            emptyHint="No data in the ticked rows this month (copying it clears the cells)"
          />

          {/* Outcome + warnings */}
          {plan && (
            <section className="space-y-2 text-xs">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                3 · What happens to your existing data?
              </h3>
              <p className="text-gray-600">
                Copied amounts <strong className="text-gray-900">replace</strong> what is
                already in the chosen months for the matching {typeNoun}s — they are
                not added on top. Other months, {typeNoun}s and {bucketNoun}s are left
                as they are.
              </p>
              <CopyOverwritePreview
                plan={plan}
                hasMonths={chosenMonths.length > 0}
                bucketLabel={config.bucketLabel}
                rowTypeLabel={config.rowTypeLabel}
              />
              {plan.unmatched.length > 0 && (
                <p className="text-gray-600">
                  <strong className="text-gray-900">
                    {plural(plan.unmatched.length, typeNoun)} not copied
                  </strong>{" "}
                  — no matching BL {typeNoun}: {plan.unmatched.join(", ")}.
                </p>
              )}
              {plan.skipped.length > 0 && (
                <p className="text-gray-500">
                  Skipped on purpose (catch-all, not a BL {typeNoun}):{" "}
                  {plan.skipped.join(", ")}.
                </p>
              )}
              {plan.noCampaignLeaves > 0 && (
                <p className="text-gray-600">
                  {plural(plan.noCampaignLeaves, "ticked row")} without a campaign
                  can&apos;t be split — use “Into one {bucketNoun}” to copy{" "}
                  {plan.noCampaignLeaves === 1 ? "it" : "them"}.
                </p>
              )}
              {plan.cellCount === 0 ? (
                <p className="text-gray-500">
                  {chosenMonths.length === 0
                    ? "Pick the months to copy (step 2)."
                    : "Nothing to copy with these choices."}
                </p>
              ) : (
                <p className="text-gray-500">
                  {plural(plan.cellCount, "cell")} will be written
                  {plan.createdProjects > 0 &&
                    `, ${plural(plan.createdProjects, `new ${bucketNoun}`)}`}
                  . Changes save automatically; Undo reverts the whole copy.
                </p>
              )}
            </section>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-end gap-3 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={confirm}
            disabled={!canCopy}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${
              overwriting
                ? "bg-red-500 text-white hover:bg-red-600"
                : "bg-yellow-400 text-gray-900 hover:bg-yellow-500"
            }`}
          >
            <ClipboardPaste size={14} />
            {overwriting
              ? `Copy & replace ${plural(plan!.overwrittenCells, "cell")}`
              : "Copy"}
          </button>
        </div>
      </div>
    </div>
  );
}
