// filepath: components/forecaster/sections/investment-kpis-client-detail.tsx
"use client";

/**
 * CLIENT DETAIL panel (MediaOcean → Investment KPIs).
 *
 * Mirrors the Looker behaviour where a few extra fields appear only once the
 * filters narrow to a SINGLE client. It shows:
 *   - Billups-OOH / Billups-Print eligibility — LIVE from the `clients`
 *     collection + `labs_partners` (via isEligibleForPartner), so it always
 *     reflects the current toggle in the Clients drawer, never a stale snapshot.
 *   - Meta Share Trend + Scenario Mapping — from the synced KPI snapshot row.
 *
 * Renders nothing unless exactly one client is in scope (`row` is non-null).
 *
 * Client match: the KPI row has no forecaster id, only PLUSCO_CLIENT_ID (which
 * for this per-client table is the forecaster id) and CLIENT_NAME. We try, in
 * order: cl_id, MediaBox id, then case-insensitive name — first hit wins. If
 * nothing matches we say so rather than showing a wrong Yes/No.
 */

import { useEffect, useMemo, useState } from "react";
import { UserRound } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "../../ui/card";
import {
  subscribeToLabsPartners,
  getLabsPartnersForYear,
} from "../../../lib/services/labs-partner-service";
import { isEligibleForPartner } from "../../../lib/format/client";
import { useAccessibleClients } from "../../../lib/hooks/use-accessible-clients";
import type { LabsPartner } from "../../../lib/types/labs.types";
import type { Client } from "../../../lib/types/client.types";
import type { KpiByClientRow } from "../../../lib/dashboard/data/use-mo-kpi-by-client";

// Eligibility is per-year; this section is the RFQ3 / 2026 snapshot. Kept as a
// single constant so it's trivial to change when the MediaOcean top bar lands.
const ELIGIBILITY_YEAR = 2026;

function matchClient(clients: Client[], row: KpiByClientRow): Client | null {
  const id = (row.PLUSCO_CLIENT_ID ?? "").toString().trim();
  const name = (row.CLIENT_NAME ?? "").toString().trim().toLowerCase();

  if (id) {
    const byId = clients.find((c) => c.cl_id === id);
    if (byId) return byId;
    const byMediaBox = clients.find((c) =>
      (c.CL_MediaBox_IDs ?? []).includes(id)
    );
    if (byMediaBox) return byMediaBox;
  }
  if (name) {
    const byName = clients.find(
      (c) => c.CL_Name.trim().toLowerCase() === name
    );
    if (byName) return byName;
  }
  return null;
}

function textOf(v: unknown): string {
  const s = (v ?? "").toString().trim();
  return s === "" ? "—" : s;
}

function EligibilityBadge({
  label,
  status,
}: {
  label: string;
  status: boolean | null | "loading";
}) {
  let text: string;
  let cls: string;
  if (status === "loading") {
    text = "Checking…";
    cls = "border-border text-muted-foreground";
  } else if (status === null) {
    text = "Unknown";
    cls = "border-border text-muted-foreground";
  } else if (status) {
    text = "Eligible";
    cls = "border-emerald-500 text-emerald-600";
  } else {
    text = "Not eligible";
    cls = "border-border text-muted-foreground";
  }
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={`inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}
      >
        {text}
      </span>
    </div>
  );
}

export default function InvestmentKpisClientDetail({
  row,
}: {
  row: KpiByClientRow | null;
}) {
  const { clients, loading: clientsLoading } = useAccessibleClients();
  const [partners, setPartners] = useState<LabsPartner[]>([]);

  useEffect(() => {
    const unsubscribe = subscribeToLabsPartners(setPartners);
    return () => unsubscribe();
  }, []);

  const detail = useMemo(() => {
    if (!row) return null;

    const client = matchClient(clients, row);
    const yearPartners = getLabsPartnersForYear(partners, ELIGIBILITY_YEAR);
    const findPartner = (name: string): LabsPartner | null =>
      yearPartners.find(
        (p) => p.name.trim().toLowerCase() === name.toLowerCase()
      ) ?? null;

    const eligibility = (
      partner: LabsPartner | null
    ): boolean | null | "loading" => {
      if (clientsLoading) return "loading";
      if (!client || !partner) return null;
      return isEligibleForPartner(client, partner.partnerId);
    };

    return {
      name: textOf(row.CLIENT_NAME),
      matched: client !== null,
      oohEligible: eligibility(findPartner("Billups-OOH")),
      printEligible: eligibility(findPartner("Billups-Print")),
      metaShareTrend: textOf(row["meta_share_trend"]),
      scenarioMapping: textOf(row["scenario_meta_mapping"]),
    };
  }, [row, clients, clientsLoading, partners]);

  if (!detail) return null;

  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex items-center gap-2">
          <UserRound size={16} className="flex-shrink-0 text-primary" />
          <div>
            <CardTitle>Client detail · {detail.name}</CardTitle>
            <CardDescription className="mt-0.5">
              Eligibility is live from the Clients page ({ELIGIBILITY_YEAR}); Meta
              Share Trend and Scenario Mapping are from the KPI snapshot.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <EligibilityBadge label="Billups-OOH" status={detail.oohEligible} />
          <EligibilityBadge label="Billups-Print" status={detail.printEligible} />
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Meta Share Trend</span>
            <span className="text-sm font-medium text-foreground">
              {detail.metaShareTrend}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Scenario Mapping</span>
            <span className="text-sm font-medium text-foreground">
              {detail.scenarioMapping}
            </span>
          </div>
        </div>
        {!detail.matched && (
          <p className="mt-3 text-xs text-muted-foreground">
            Couldn&apos;t match this client to a Clients record, so eligibility
            can&apos;t be shown. (The name may differ between MediaOcean and the
            forecaster.)
          </p>
        )}
      </CardContent>
    </Card>
  );
}
