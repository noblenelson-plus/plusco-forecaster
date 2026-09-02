// components/forecaster/forecast-sheets-export-button.tsx
"use client";

/**
 * "Export to Sheets" for the forecast grid — replaces the old client-side CSV.
 *
 * Creates one Google spreadsheet with three tabs (BL Submission / MediaOcean /
 * MediaBox) via buildAxisSheetTabs + exportToNewSheetWithTabs, so the room can
 * collaborate on the numbers instead of passing a file around. The Google popup
 * must open from inside the click handler to survive popup blockers, so connect
 * is awaited in `run` rather than pre-warmed.
 */

import { useState } from "react";
import { AlertCircle, ExternalLink, Loader2, Sheet as SheetIcon } from "lucide-react";
import {
  exportToNewSheetWithTabs,
  SheetsUnavailableError,
} from "./table/table-export";
import { buildAxisSheetTabs } from "../../lib/format/forecast-sheets";
import type { MediaboxCSVTypeRow } from "../../lib/format/forecast-csv";
import type { AxisData, AxisConfig } from "../../lib/types/forecaster.types";

type Status =
  | { state: "idle" }
  | { state: "working" }
  | { state: "done"; url: string }
  | { state: "error"; message: string };

/** Spreadsheet file name: e.g. "Media Spend — Acme Corp · 2026 RFQ3". */
function buildTitle(
  config: AxisConfig,
  ctx: { clientName?: string; year?: number | null; rfqType?: string }
): string {
  const scope = [ctx.clientName, ctx.year, ctx.rfqType]
    .filter((v) => v != null && v !== "")
    .join(" · ");
  return scope ? `${config.title} — ${scope}` : config.title;
}

export default function ForecastSheetsExportButton({
  data,
  config,
  mediabox,
  context,
  disabled,
}: {
  data: AxisData;
  config: AxisConfig;
  mediabox?: MediaboxCSVTypeRow[];
  context: { clientName?: string; year?: number | null; rfqType?: string };
  disabled?: boolean;
}) {
  const [status, setStatus] = useState<Status>({ state: "idle" });

  const run = async () => {
    setStatus({ state: "working" });
    try {
      const tabs = buildAxisSheetTabs(data, config, mediabox);
      const url = await exportToNewSheetWithTabs({
        title: buildTitle(config, context),
        tabs,
      });
      setStatus({ state: "done", url });
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      const message =
        error instanceof SheetsUnavailableError
          ? error.message
          : error instanceof Error && error.message
            ? error.message
            : "Export failed. Please try again.";
      setStatus({ state: "error", message });
    }
  };

  if (status.state === "done") { return (<a href={status.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 hover:text-gray-900 transition-colors"><ExternalLink size={14} /> Open sheet</a>); }

  if (status.state === "error") {
    return (
      <button
        type="button"
        onClick={() => void run()}
        title={status.message}
        className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-red-700 border border-red-700 rounded-lg bg-white hover:bg-gray-50 transition-colors"
      >
        <AlertCircle size={14} />
        Export failed — retry
      </button>
    );
  }

  const working = status.state === "working";

  return (
    <button
      type="button"
      onClick={() => void run()}
      disabled={working || disabled}
      className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 hover:text-gray-900 disabled:opacity-50 transition-colors"
      title="Export BL Submission, MediaOcean and MediaBox to a new Google Sheet (3 tabs)"
    >
      {working ? (
        <Loader2 size={14} className="animate-spin" />
      ) : (
        <SheetIcon size={14} />
      )}
      {working ? "Exporting…" : "Export to Sheets"}
    </button>
  );
}