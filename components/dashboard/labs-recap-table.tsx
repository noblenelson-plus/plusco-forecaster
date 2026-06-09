// components/dashboard/labs-recap-table.tsx
"use client";

/**
 * Labs recap table — one row per media type tying together the planned media
 * budget, the Labs spend against it, the resulting share, the number of active
 * partners and a status (over the planned cap or not). A totals row closes it.
 */

import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import { MEDIA_TYPE_LABELS } from "../../lib/types/forecaster.types";
import { MEDIA_TYPE_COLORS } from "./charts/colors";
import { formatCompactMoney, formatPct } from "./charts/format";
import type { LabsPenetrationResult } from "../../lib/format/labs-penetration";

export default function LabsRecapTable({
  labs,
}: {
  labs: LabsPenetrationResult;
}) {
  const rows = labs.byType.filter(
    (t) => t.labsAnnual > 0 || t.plannedAnnual > 0
  );

  if (rows.length === 0) {
    return (
      <p className="py-8 text-center text-xs text-muted-foreground">
        No Labs or media spend to recap.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Media type</TableHead>
          <TableHead className="text-right">Planned media</TableHead>
          <TableHead className="text-right">Labs spend</TableHead>
          <TableHead className="text-right">Share</TableHead>
          <TableHead className="text-right">Partners</TableHead>
          <TableHead className="text-right">Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((t) => {
          const activePartners = t.partners.filter((p) => p.annual > 0).length;
          const share =
            t.coverage !== null && isFinite(t.coverage)
              ? formatPct(t.coverage)
              : t.labsAnnual > 0
                ? "—"
                : formatPct(0);
          return (
            <TableRow key={t.mediaType}>
              <TableCell>
                <span className="flex items-center gap-2 font-medium text-foreground">
                  <span
                    className="h-2.5 w-2.5 flex-shrink-0 rounded-sm"
                    style={{ backgroundColor: MEDIA_TYPE_COLORS[t.mediaType] }}
                  />
                  {MEDIA_TYPE_LABELS[t.mediaType]}
                </span>
              </TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">
                {formatCompactMoney(t.plannedAnnual)}
              </TableCell>
              <TableCell className="text-right tabular-nums text-foreground">
                {formatCompactMoney(t.labsAnnual)}
              </TableCell>
              <TableCell className="text-right tabular-nums text-foreground">
                {share}
              </TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">
                {activePartners}
              </TableCell>
              <TableCell className="text-right">
                {t.over ? (
                  <span className="font-medium text-red-500">Over cap</span>
                ) : t.labsAnnual > 0 ? (
                  <span className="text-emerald-600">Within cap</span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell className="font-semibold text-foreground">Total</TableCell>
          <TableCell className="text-right tabular-nums text-foreground">
            {formatCompactMoney(labs.totalPlanned)}
          </TableCell>
          <TableCell className="text-right tabular-nums text-foreground">
            {formatCompactMoney(labs.totalLabs)}
          </TableCell>
          <TableCell className="text-right tabular-nums text-foreground">
            {formatPct(labs.ratio)}
          </TableCell>
          <TableCell className="text-right" />
          <TableCell className="text-right text-muted-foreground">
            target {formatPct(labs.targetRatio)}
          </TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  );
}
