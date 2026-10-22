// components/forecaster/copy-to-labs-modal.tsx
"use client";

/**
 * "Copy to Labs" — ticked Media Spend BL lines → the Labs BL of the same
 * submission (e.g. an OOH line → Billups-OOH, campaign by campaign). Same
 * layout as "Copy to my submission", three choices:
 *
 *   1. Labs partner + share — per media type ticked: one of the year's
 *      partners of that media type (admin → Labs), preselected when there is
 *      only one, and the % of its Media amounts copied (100% by default). A
 *      media type with no partner is flagged "not a Labs channel" and skipped.
 *   2. Destination — the same project as in Media Spend (matched by name, a
 *      missing Labs project is created), or one existing Labs project.
 *   3. Period — which months to copy (none ticked at first).
 *
 * Planned live (lib/format/media-to-labs); copied amounts replace the matching
 * Labs cells, and every filled cell that would change is listed first.
 * Confirming writes through labsGrid.applyReferencePaste — one undoable step
 * on the Labs tab, then autosaved.
 */

import { useMemo, useState } from "react";
import { ArrowRight, Ban, ClipboardPaste, FolderPlus, X } from "lucide-react";
import type { AxisConfig } from "../../lib/types/forecaster.types";
import type { UseForecasterGridResult } from "../../lib/hooks/use-forecaster-grid";
import type { LabsPartner } from "../../lib/types/labs.types";
import {
  groupByMediaType,
  planMediaToLabs,
  type LabsDestination,
  type MediaLine,
} from "../../lib/format/media-to-labs";
import { MONTHS } from "../../lib/types/common.types";
import { showForecastToast } from "../../lib/format/toast";
import {
  CopyMonthPicker,
  CopyOverwritePreview,
  money,
  plural,
} from "./copy-plan-sections";

export default function CopyToLabsModal({
  lines,
  partners,
  labsConfig,
  labsGrid,
  onClose,
  onCopied,
}: {
  /** The ticked Media lines. */
  lines: MediaLine[];
  /** The year's Labs partners. */
  partners: LabsPartner[];
  labsConfig: AxisConfig;
  labsGrid: UseForecasterGridResult;
  onClose: () => void;
  /** After a successful copy (clears the ticked lines, shows the Labs tab). */
  onCopied: () => void;
}) {
  const buckets = labsGrid.data.buckets;
  const groups = useMemo(() => groupByMediaType(lines, partners), [lines, partners]);
  const labsGroups = groups.filter((g) => g.partners.length > 0);
  const notLabsGroups = groups.filter((g) => g.partners.length === 0);

  // One partner per media type — preselected when the type has only one.
  const [partnerFor, setPartnerFor] = useState<Record<string, string | undefined>>(() =>
    Object.fromEntries(
      groups.map((g) => [g.mediaType, g.partners.length === 1 ? g.partners[0].partnerId : undefined])
    )
  );
  const [kind, setKind] = useState<LabsDestination["kind"]>("same");
  const [bucketId, setBucketId] = useState<string>(buckets[0]?.bucketId ?? "");
  // Share per media type, as typed (absent = "100").
  const [shareText, setShareText] = useState<Record<string, string>>({});
  const [months, setMonths] = useState<Set<number>>(() => new Set());

  // Months the user may write in Labs: closed periods are read-only for non-admins.
  const isMonthOpen = (m: number) => labsGrid.canEditClosed || !labsGrid.closedMonths.has(m);
  const dataMonths = useMemo(
    () => MONTHS.filter((m) => lines.some((l) => (l.months[m] ?? 0) !== 0)),
    [lines]
  );
  const chosenMonths = MONTHS.filter((m) => months.has(m) && isMonthOpen(m));

  const parseShare = (mediaType: string) =>
    Number((shareText[mediaType] ?? "100").replace(",", "."));
  const isShareValid = (v: number) => Number.isFinite(v) && v > 0 && v <= 100;
  const shareFor = Object.fromEntries(labsGroups.map((g) => [g.mediaType, parseShare(g.mediaType)]));
  const shareValid = labsGroups.every((g) => isShareValid(shareFor[g.mediaType]));

  const destination: LabsDestination | null =
    kind === "same"
      ? { kind: "same" }
      : buckets.some((b) => b.bucketId === bucketId)
        ? { kind: "project", bucketId }
        : null;
  const missingPartner = labsGroups.filter((g) => !partnerFor[g.mediaType]);

  const plan = useMemo(
    () =>
      destination && shareValid
        ? planMediaToLabs({
            groups,
            partnerFor,
            shareFor,
            months: chosenMonths,
            destination,
            buckets,
            rowTypeOptions: labsConfig.rowTypeOptions,
          })
        : null,
    // `destination`/`chosenMonths` are rebuilt each render; key on their parts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [groups, partnerFor, shareText, months, kind, bucketId, buckets, labsConfig.rowTypeOptions, labsGrid.closedMonths, labsGrid.canEditClosed]
  );

  const selectedTotal = lines.reduce(
    (acc, l) => acc + MONTHS.reduce((s, m) => s + (l.months[m] ?? 0), 0),
    0
  );
  const projectCount = new Set(lines.map((l) => l.project)).size;

  const canCopy =
    !!plan && plan.cellCount > 0 && missingPartner.length === 0 && !labsGrid.locked;
  const overwriting = (plan?.overwrittenCells ?? 0) > 0;

  function confirm() {
    if (!plan || !canCopy) return;
    const { created, cells } = labsGrid.applyReferencePaste(plan.projects);
    const parts = [
      `Copied Media Spend → Labs (${plural(plan.projects.length, "project")})`,
      plural(cells, "cell"),
    ];
    if (created) parts.push(`${created} created`);
    if (plan.overwrittenCells) parts.push(`${plan.overwrittenCells} overwritten`);
    if (plan.notLabsLines) parts.push(`${plural(plan.notLabsLines, "line")} not Labs`);
    showForecastToast(parts.join(" · "), plan.notLabsLines ? "warning" : "success");
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
        aria-label="Copy to Labs"
        className="w-full max-w-lg bg-white shadow-2xl flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gray-900 px-5 py-4 flex items-start justify-between flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-white">Copy to Labs</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {plural(lines.length, "Media line")} · {plural(projectCount, "project")} ·{" "}
              {money(selectedTotal)} for the year
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
          {/* 1. Partner per media type */}
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              1 · Which Labs partner, and how much?
            </h3>
            {labsGroups.length > 0 && (
              <p className="text-xs text-gray-400">
                The % is the share of each Media amount copied, month by month.
              </p>
            )}
            {labsGroups.length > 0 && (
              <ul className="border border-gray-200 divide-y divide-gray-100">
                {labsGroups.map((g) => (
                  <li key={g.mediaType} className="flex items-center gap-2 px-3 py-2 text-sm">
                    <span className="w-28 flex-shrink-0 font-medium text-gray-900">
                      {g.label}
                      <span className="block text-[11px] font-normal text-gray-400">
                        {plural(g.lines.length, "line")}
                      </span>
                    </span>
                    <ArrowRight size={12} className="flex-shrink-0 text-gray-300" />
                    {g.partners.length === 1 ? (
                      <span className="min-w-0 flex-1 truncate font-medium text-gray-900">
                        {g.partners[0].name}
                        {g.partners[0].description && (
                          <span className="ml-1 text-xs italic font-normal text-gray-400">
                            {g.partners[0].description}
                          </span>
                        )}
                      </span>
                    ) : (
                      <select
                        value={partnerFor[g.mediaType] ?? ""}
                        onChange={(e) =>
                          setPartnerFor((prev) => ({
                            ...prev,
                            [g.mediaType]: e.target.value || undefined,
                          }))
                        }
                        className="min-w-0 flex-1 px-2 py-1.5 text-sm border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-yellow-400 cursor-pointer"
                      >
                        <option value="">Pick a {g.label} partner…</option>
                        {g.partners.map((p) => (
                          <option key={p.partnerId} value={p.partnerId}>
                            {p.name}
                            {p.description ? ` — ${p.description}` : ""}
                          </option>
                        ))}
                      </select>
                    )}
                    <label className="flex flex-shrink-0 items-center gap-1 text-xs text-gray-500">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={shareText[g.mediaType] ?? "100"}
                        onChange={(e) =>
                          setShareText((prev) => ({ ...prev, [g.mediaType]: e.target.value }))
                        }
                        aria-label={`Share of the ${g.label} amounts`}
                        className={`w-14 px-2 py-1.5 text-right text-sm tabular-nums text-gray-900 border bg-white focus:outline-none focus:ring-2 focus:ring-yellow-400 ${
                          isShareValid(shareFor[g.mediaType]) ? "border-gray-200" : "border-red-500"
                        }`}
                      />
                      %
                    </label>
                  </li>
                ))}
              </ul>
            )}
            {!shareValid && (
              <p className="text-xs text-red-600">
                Enter a share above 0 and up to 100% for each media type.
              </p>
            )}
            {notLabsGroups.length > 0 && (
              <div className="space-y-1 bg-yellow-400 px-3 py-2 text-xs text-gray-900">
                <p className="flex items-start gap-2">
                  <Ban size={13} className="mt-0.5 flex-shrink-0" />
                  <strong>
                    Not a Labs channel — won&apos;t be copied (no Labs partner for this
                    media type this year):
                  </strong>
                </p>
                <ul className="ml-5 list-disc">
                  {notLabsGroups.map((g) => (
                    <li key={g.mediaType}>
                      {g.label} ·{" "}
                      {g.lines.map((l) => l.project).join(", ")}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          {labsGroups.length > 0 && (
            <>
              {/* 2. Destination */}
              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  2 · Into which Labs project?
                </h3>
                <label className="flex items-start gap-2 cursor-pointer select-none">
                  <input
                    type="radio"
                    name="labs-destination"
                    checked={kind === "same"}
                    onChange={() => setKind("same")}
                    className="mt-0.5 accent-gray-900"
                  />
                  <span className="flex-1 text-sm text-gray-700">
                    Same project as in Media Spend
                    <span className="block text-xs text-gray-400">
                      Matched by name — a Labs project is created for any project that
                      has none yet.
                    </span>
                  </span>
                </label>
                <label
                  className={`flex items-start gap-2 select-none ${
                    buckets.length === 0 ? "opacity-50" : "cursor-pointer"
                  }`}
                >
                  <input
                    type="radio"
                    name="labs-destination"
                    checked={kind === "project"}
                    disabled={buckets.length === 0}
                    onChange={() => setKind("project")}
                    className="mt-0.5 accent-gray-900"
                  />
                  <span className="flex-1 text-sm text-gray-700">
                    Into one Labs project
                    <span className="block text-xs text-gray-400">
                      Every ticked line is summed by partner into a single project.
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

                {/* Project mapping preview */}
                {kind === "same" && plan && plan.projects.length > 0 && (
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

              {/* 3. Period */}
              <CopyMonthPicker
                step={3}
                months={months}
                onChange={setMonths}
                dataMonths={dataMonths}
                isMonthOpen={isMonthOpen}
                emptyHint="No Media amount in the ticked lines this month (copying it clears the Labs cells)"
              />

              {/* Outcome */}
              {plan && (
                <section className="space-y-2 text-xs">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                    4 · What happens to your existing Labs data?
                  </h3>
                  <p className="text-gray-600">
                    Copied amounts <strong className="text-gray-900">replace</strong> what
                    Labs already holds in the chosen months for the chosen partners —
                    they are not added on top. Other months, partners and projects are
                    left as they are.
                  </p>
                  <CopyOverwritePreview
                    plan={plan}
                    hasMonths={chosenMonths.length > 0}
                    bucketLabel={labsConfig.bucketLabel}
                    rowTypeLabel={labsConfig.rowTypeLabel}
                  />
                  {missingPartner.length > 0 ? (
                    <p className="text-gray-500">
                      Pick a partner for {missingPartner.map((g) => g.label).join(", ")} (step 1).
                    </p>
                  ) : plan.cellCount === 0 ? (
                    <p className="text-gray-500">
                      {chosenMonths.length === 0
                        ? "Pick the months to copy (step 3)."
                        : "Nothing to copy with these choices."}
                    </p>
                  ) : (
                    <p className="text-gray-500">
                      {plural(plan.cellCount, "Labs cell")} will be written
                      {plan.createdProjects > 0 &&
                        `, ${plural(plan.createdProjects, "new project")}`}
                      . Changes save automatically; Undo on the Labs tab reverts the
                      whole copy.
                    </p>
                  )}
                </section>
              )}
            </>
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
              : "Copy to Labs"}
          </button>
        </div>
      </div>
    </div>
  );
}
