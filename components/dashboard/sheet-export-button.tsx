// components/dashboard/sheet-export-button.tsx
"use client";

/**
 * "Export to Sheets" for the dashboard detail tables — same idle/working/done/
 * error state machine as the forecast grid's export, styled with the shared
 * shadcn Button so it drops into the CardAction slot where "Download CSV" used
 * to live. Reuses the Bulk Edit Google transport via exportToNewSheet.
 *
 * The Google popup must open inside the click handler to survive popup
 * blockers, so connect is awaited in `run` rather than pre-warmed.
 */

import { useState } from "react";
import {
  AlertCircle,
  ExternalLink,
  Loader2,
  Sheet as SheetIcon,
} from "lucide-react";
import { Button } from "../ui/button";
import {
  exportToNewSheet,
  SheetsUnavailableError,
  type CellValue,
} from "../forecaster/table/table-export";

type Status =
  | { state: "idle" }
  | { state: "working" }
  | { state: "done"; url: string }
  | { state: "error"; message: string };

export default function SheetExportButton({
  title,
  sheetTitle,
  buildMatrix,
  disabled,
}: {
  /** Spreadsheet file name. */
  title: string;
  /** Tab name inside the file. Keep it short. */
  sheetTitle: string;
  /** Called on click to produce the sheet contents (header + body + optional footer). */
  buildMatrix: () => CellValue[][];
  disabled?: boolean;
}) {
  const [status, setStatus] = useState<Status>({ state: "idle" });

  const run = async () => {
    setStatus({ state: "working" });
    try {
      const url = await exportToNewSheet({
        title,
        sheetTitle,
        matrix: buildMatrix(),
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

  if (status.state === "done") {
    return (
      <Button variant="outline" size="sm" asChild>
        <a href={status.url} target="_blank" rel="noopener noreferrer">
          <ExternalLink />
          Open sheet
        </a>
      </Button>
    );
  }

  if (status.state === "error") {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => void run()}
        title={status.message}
        className="border-red-700 text-red-700"
      >
        <AlertCircle />
        Export failed — retry
      </Button>
    );
  }

  const working = status.state === "working";

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => void run()}
      disabled={working || disabled}
    >
      {working ? <Loader2 className="animate-spin" /> : <SheetIcon />}
      {working ? "Exporting…" : "Export to Sheets"}
    </Button>
  );
}
