// components/forecaster/product-year-rollover.tsx
"use client";

/**
 * Admin roll-over of the Product pipeline into the next year: copies every
 * client's entries (status, timing, note) from one year into the following
 * one, so Business Leads start the new year from last year's pipeline.
 *
 * Preview first (no writes), then copy. A client that already has entries in
 * the target year is skipped, never overwritten; the target year is re-read
 * right before writing so entries added since the preview are respected.
 * Carried notes keep their "From {year}" tag, like the per-client copy.
 */

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Check, Copy, Loader2 } from "lucide-react";
import {
  fetchAllProductTrackingForYear,
  writeProductTrackingCopies,
} from "../../lib/services/product-tracking-service";
import { getRFQYears, subscribeToRFQs } from "../../lib/services/rfq-service";
import { useReadableClients } from "../../lib/hooks/use-readable-clients";
import {
  planProductYearCopy,
  type ProductYearCopyPlan,
} from "../../lib/format/product-copy";
import type { RFQ } from "../../lib/types/rfq.types";

async function buildPlan(fromYear: number): Promise<ProductYearCopyPlan> {
  const [source, target] = await Promise.all([
    fetchAllProductTrackingForYear(fromYear),
    fetchAllProductTrackingForYear(fromYear + 1),
  ]);
  return planProductYearCopy(source, target, fromYear, fromYear + 1);
}

export default function ProductYearRollover() {
  const { clients } = useReadableClients();
  const nameById = useMemo(
    () => new Map(clients.map((c) => [c.cl_id, c.CL_Name ?? c.cl_id])),
    [clients]
  );

  // Source years: the RFQ years plus the current calendar year.
  const [rfqs, setRFQs] = useState<RFQ[]>([]);
  useEffect(() => subscribeToRFQs(setRFQs), []);
  const currentYear = new Date().getFullYear();
  const years = useMemo(
    () => [...new Set([...getRFQYears(rfqs), currentYear])].sort((a, b) => b - a),
    [rfqs, currentYear]
  );

  const [fromYear, setFromYear] = useState(currentYear);
  const [plan, setPlan] = useState<ProductYearCopyPlan | null>(null);
  const [busy, setBusy] = useState<"preview" | "copy" | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState<string | null>(null);

  const toYear = fromYear + 1;

  const pickYear = (y: number) => {
    setFromYear(y);
    setPlan(null);
    setDone(null);
    setError("");
  };

  const preview = async () => {
    setBusy("preview");
    setError("");
    setDone(null);
    try {
      setPlan(await buildPlan(fromYear));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read the product tracking.");
    } finally {
      setBusy(null);
    }
  };

  const copy = async () => {
    setBusy("copy");
    setError("");
    try {
      // Re-plan against fresh data: a BL may have started the target year.
      const fresh = await buildPlan(fromYear);
      await writeProductTrackingCopies(fresh.toYear, fresh.copies);
      setDone(
        `Copied ${fresh.entryCount} entr${fresh.entryCount === 1 ? "y" : "ies"} for ` +
          `${fresh.copies.length} client${fresh.copies.length === 1 ? "" : "s"} into ${fresh.toYear}` +
          (fresh.skipped.length
            ? ` — ${fresh.skipped.length} already had ${fresh.toYear} entries and were left as is.`
            : ".")
      );
      setPlan(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The copy failed.");
    } finally {
      setBusy(null);
    }
  };

  const names = (ids: string[]) =>
    ids.map((id) => nameById.get(id) ?? id).sort((a, b) => a.localeCompare(b));

  return (
    <div className="mt-8 bg-white border border-gray-200 rounded-xl p-4 space-y-3">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          <CalendarDays size={15} />
          Copy the pipeline into next year
        </h2>
        <p className="mt-1 text-xs text-gray-500">
          Copies every client&apos;s Product entries (status, timing, note) from one
          year into the next. Clients that already have entries in the target year
          are skipped. Business Leads can also do this per client with{" "}
          <em>Copy from {"{year}"}</em> on the Product tab.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-gray-500">From</span>
        <select
          value={fromYear}
          onChange={(e) => pickYear(Number(e.target.value))}
          disabled={busy !== null}
          className="px-2 py-1.5 border border-gray-200 rounded-lg bg-white text-gray-900"
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <span className="text-gray-500">into</span>
        <span className="px-2 py-1.5 font-semibold text-gray-900">{toYear}</span>
        <button
          type="button"
          onClick={preview}
          disabled={busy !== null}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {busy === "preview" && <Loader2 size={13} className="animate-spin" />}
          Preview
        </button>
      </div>

      {error && (
        <div className="px-3 py-2 text-sm text-white bg-red-500 rounded-lg">{error}</div>
      )}
      {done && (
        <div className="flex items-center gap-2 px-3 py-2 text-sm text-white bg-green-500 rounded-lg">
          <Check size={14} />
          {done}
        </div>
      )}

      {plan && (
        <div className="space-y-2 text-sm">
          {plan.copies.length === 0 ? (
            <p className="text-gray-600">
              Nothing to copy — no client has {plan.fromYear} entries with an empty{" "}
              {plan.toYear}.
            </p>
          ) : (
            <>
              <p className="text-gray-900">
                <strong>{plan.copies.length}</strong> client
                {plan.copies.length === 1 ? "" : "s"} ·{" "}
                <strong>{plan.entryCount}</strong> entr
                {plan.entryCount === 1 ? "y" : "ies"} will be copied into {plan.toYear}.
              </p>
              <details className="text-xs text-gray-600">
                <summary className="cursor-pointer">Clients to copy</summary>
                <p className="mt-1">{names(plan.copies.map((c) => c.clientId)).join(", ")}</p>
              </details>
            </>
          )}
          {plan.skipped.length > 0 && (
            <details className="text-xs text-gray-600">
              <summary className="cursor-pointer">
                {plan.skipped.length} client{plan.skipped.length === 1 ? "" : "s"} already
                {plan.skipped.length === 1 ? " has" : " have"} {plan.toYear} entries — skipped
              </summary>
              <p className="mt-1">{names(plan.skipped).join(", ")}</p>
            </details>
          )}
          {plan.copies.length > 0 && (
            <button
              type="button"
              onClick={copy}
              disabled={busy !== null}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-900 bg-yellow-400 rounded-lg hover:bg-yellow-500 disabled:opacity-50"
            >
              {busy === "copy" ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Copy size={13} />
              )}
              Copy into {plan.toYear}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
