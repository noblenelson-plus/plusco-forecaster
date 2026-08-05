// components/forecaster/sections/labs-eligibility-table.tsx
"use client";

/**
 * Labs eligibility table for the Forecaster dashboard's Labs section.
 *
 * Lists every in-scope client × Labs partner (for the selected year) where the
 * client is NOT eligible — one row per ineligible pair. Eligibility lives on the
 * client (`Labs_Eligibility`, sparse: absent = eligible) and is read through
 * `isEligibleForPartner`, so this reflects exactly what the Clients drawer shows.
 *
 * Scope: the currently filtered clients, narrowed to the focused client when one
 * is selected in the Client detail table — so clicking a client surfaces just
 * that client's ineligibilities.
 *
 * Built on the shared ChartCard + table styling so it matches the Partners /
 * Channels tables around it, and exports to Sheets from the card header.
 *
 * Purely client-config driven: independent of RFQ and forecast figures.
 */

import { useEffect, useMemo, useState } from "react";
import { Ban } from "lucide-react";
import ChartCard from "../../dashboard/charts/chart-card";
import ExportSheetButton from "../table/export-sheet-button";
import type { TableColumn } from "../table/table-column.types";
import { subscribeToLabsPartners, getLabsPartnersForYear } from "../../../lib/services/labs-partner-service";
import { isEligibleForPartner } from "../../../lib/format/client";
import { useAccessibleClients } from "../../../lib/hooks/use-accessible-clients";
import type { LabsPartner } from "../../../lib/types/labs.types";

interface EligibilityRow {
  key: string;
  clientName: string;
  partnerName: string;
}

/** Three text columns; also the export shape (no totals row). */
const EXPORT_COLUMNS: TableColumn<EligibilityRow, Record<string, never>>[] = [
  {
    id: "client",
    label: "Client",
    group: "Eligibility",
    kind: "text",
    align: "left",
    raw: (r) => r.clientName,
    display: (r) => r.clientName,
  },
  {
    id: "partner",
    label: "Labs Partner",
    group: "Eligibility",
    kind: "text",
    align: "left",
    raw: (r) => r.partnerName,
    display: (r) => r.partnerName,
  },
  {
    id: "eligibility",
    label: "Eligibility",
    group: "Eligibility",
    kind: "text",
    align: "right",
    raw: () => "No",
    display: () => "No",
  },
];

export default function LabsEligibilityTable({
  year,
  scopedClientIds,
  focusedClientId,
}: {
  year: number | null;
  scopedClientIds: string[];
  focusedClientId: string | null;
}) {
  const { clients } = useAccessibleClients();

  const [partners, setPartners] = useState<LabsPartner[]>([]);
  useEffect(() => {
    const unsubscribe = subscribeToLabsPartners(setPartners);
    return () => unsubscribe();
  }, []);

  const rows = useMemo<EligibilityRow[]>(() => {
    if (year === null) return [];
    const yearPartners = getLabsPartnersForYear(partners, year);
    if (yearPartners.length === 0) return [];

    const clientById = new Map(clients.map((c) => [c.cl_id, c]));
    // Focused client narrows the list; otherwise all in-scope clients.
    const ids = focusedClientId ? [focusedClientId] : scopedClientIds;

    const out: EligibilityRow[] = [];
    for (const id of ids) {
      const client = clientById.get(id);
      if (!client) continue;
      for (const partner of yearPartners) {
        if (!isEligibleForPartner(client, partner.partnerId)) {
          out.push({
            key: `${id}:${partner.partnerId}`,
            clientName: client.CL_Name,
            partnerName: partner.name,
          });
        }
      }
    }

    out.sort(
      (a, b) =>
        a.clientName.localeCompare(b.clientName) ||
        a.partnerName.localeCompare(b.partnerName)
    );
    return out;
  }, [year, partners, clients, scopedClientIds, focusedClientId]);

  const yearLabel = year !== null ? `${year}` : "—";
  const subtitle =
    rows.length > 0 ? `${rows.length} not eligible · ${yearLabel}` : `Not eligible · ${yearLabel}`;

  return (
    <ChartCard
      title="Labs Eligibility"
      subtitle={subtitle}
      icon={Ban}
      action={
        rows.length > 0 ? (
          <ExportSheetButton
            columns={EXPORT_COLUMNS}
            rows={rows}
            totals={{}}
            includeTotals={false}
            title={`Labs Eligibility — Not eligible (${yearLabel})`}
            sheetTitle="Labs Eligibility"
          />
        ) : undefined
      }
    >
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Every in-scope client is eligible for all Labs partners in {yearLabel}.
        </p>
      ) : (
        <div className="max-h-40 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card">
              <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                <th className="py-2 pr-3 text-left font-medium">Client</th>
                <th className="py-2 px-3 text-left font-medium">Labs Partner</th>
                <th className="py-2 pl-3 text-right font-medium">Eligibility</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-b border-border/60">
                  <td className="py-2 pr-3 text-left text-foreground">{row.clientName}</td>
                  <td className="py-2 px-3 text-left text-muted-foreground">{row.partnerName}</td>
                  <td className="py-2 pl-3 text-right">
                    <span className="inline-block bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">
                      No </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ChartCard>
  );
}

