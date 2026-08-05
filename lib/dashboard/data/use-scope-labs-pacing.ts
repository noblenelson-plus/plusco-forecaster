// lib/dashboard/data/use-scope-labs-pacing.ts
"use client";

/**
 * Labs pacing — per-partner Target vs Booked for the whole dashboard scope, read
 * directly (one pass per in-scope client). Returns both the aggregated
 * partner × GM-pod cells and the per client × partner detail (for the flag
 * table).
 *
 * Per client (rowType is the partnerId on both sides):
 *   - Target = the BL forecast (labs `buckets` rows) for the selected Year/RFQ.
 *   - Booked = the MIR actuals, read from the separate annual_actuals doc
 *     (annual / RFQ-independent), NOT the per-submission data_entry.
 *
 * Currency + month handling mirror the rest of the dashboard.
 */

import { useEffect, useState } from "react";
import { fetchAxisData } from "../../services/data-entry-service";
import { fetchAnnualActuals } from "../../services/annual-actuals-service";
import type { AxisData, ForecastRow } from "../../types/forecaster.types";
import type { RFQType } from "../../types/rfq.types";
import type { MonthlyMap } from "../../types/common.types";
import type { Currency } from "../../types/client.types";

/** One partner × GM-pod cell's Target vs Booked (already currency-converted). */
export interface LabsPacingCell {
  partnerId: string;
  gmPod: string;
  target: number;
  booked: number;
}

/** One client × partner detail row (already currency-converted). */
export interface LabsPacingDetailCell {
  clientId: string;
  partnerId: string;
  target: number;
  booked: number;
}

export interface UseScopeLabsPacingParams {
  scopedClientIds: string[];
  year: number | null;
  rfq: RFQType | null;
  /** clientId → currency, to know which clients to convert. */
  currencyByClient: Record<string, Currency>;
  /** clientId → GM pod label, to break Target/Booked down by pod. */
  gmPodByClient: Record<string, string>;
  /** USD→CAD rate (undefined/1 in USD view). */
  usdToCad?: number;
  /** Selected months (1–12); empty = whole year. */
  selMonths: number[];
}

/** Sum a monthly map over the selected months (all months when none selected). */
function sumMonths(months: MonthlyMap, selMonths: number[]): number {
  if (selMonths.length === 0) {
    let total = 0;
    for (const v of Object.values(months)) total += Number(v) || 0;
    return total;
  }
  let total = 0;
  for (const m of selMonths) total += Number(months[m]) || 0;
  return total;
}

/** Sum rows into a partnerId → total map (rowType is the partnerId). */
function totalsByPartner(rows: ForecastRow[], selMonths: number[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const row of rows) {
    const pid = row.rowType;
    out.set(pid, (out.get(pid) ?? 0) + sumMonths(row.months, selMonths));
  }
  return out;
}

/** Flatten a labs axis's BL bucket rows. */
function bucketRows(axis: AxisData): ForecastRow[] {
  return axis.buckets.flatMap((b) => b.rows);
}

export function useScopeLabsPacing({
  scopedClientIds,
  year,
  rfq,
  currencyByClient,
  gmPodByClient,
  usdToCad,
  selMonths,
}: UseScopeLabsPacingParams): {
  cells: LabsPacingCell[];
  detail: LabsPacingDetailCell[];
  loading: boolean;
} {
  const [cells, setCells] = useState<LabsPacingCell[]>([]);
  const [detail, setDetail] = useState<LabsPacingDetailCell[]>([]);
  const [loading, setLoading] = useState(false);

  const idsKey = scopedClientIds.join(",");
  const monthsKey = selMonths.join(",");
  const ready = year !== null && rfq !== null && idsKey !== "";

  useEffect(() => {
    if (!ready) return;

    const ids = idsKey.split(",");
    const months = monthsKey ? monthsKey.split(",").map(Number) : [];

    let cancelled = false;

    const rate = (clientId: string) =>
      currencyByClient[clientId] === "USD" ? usdToCad ?? 1 : 1;

    void (async () => {
      setLoading(true);

      // "partnerId\u0000gmPod" → accumulated Target/Booked.
      const acc = new Map<string, LabsPacingCell>();
      const bump = (
        partnerId: string,
        gmPod: string,
        key: "target" | "booked",
        value: number
      ) => {
        const mapKey = `${partnerId}\u0000${gmPod}`;
        const cur = acc.get(mapKey) ?? { partnerId, gmPod, target: 0, booked: 0 };
        cur[key] += value;
        acc.set(mapKey, cur);
      };

      const perClientDetail = await Promise.all(
        ids.map(async (clientId) => {
          const labs = await fetchAxisData(clientId, year!, rfq!, "labs");
          // Labs MIR actuals live in the separate annual_actuals doc (annual /
          // RFQ-independent), NOT on the per-submission data_entry.
          const actualsRows = await fetchAnnualActuals(clientId, year!, "labs");
          const factor = rate(clientId);
          const gmPod = gmPodByClient[clientId] ?? "—";

          const target = totalsByPartner(bucketRows(labs), months);
          const booked = totalsByPartner(actualsRows, months);

          for (const [pid, v] of target) bump(pid, gmPod, "target", v * factor);
          for (const [pid, v] of booked) bump(pid, gmPod, "booked", v * factor);

          // One detail row per partner this client touches.
          const pids = new Set([...target.keys(), ...booked.keys()]);
          const rows: LabsPacingDetailCell[] = [];
          for (const pid of pids) {
            rows.push({
              clientId,
              partnerId: pid,
              target: (target.get(pid) ?? 0) * factor,
              booked: (booked.get(pid) ?? 0) * factor,
            });
          }
          return rows;
        })
      );

      if (cancelled) return;

      const aggregated = [...acc.values()].filter(
        (c) => c.target !== 0 || c.booked !== 0
      );
      const detailRows = perClientDetail
        .flat()
        .filter((d) => d.target !== 0 || d.booked !== 0);

      setCells(aggregated);
      setDetail(detailRows);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [ready, idsKey, monthsKey, year, rfq, usdToCad, currencyByClient, gmPodByClient]);

  return {
    cells: ready ? cells : [],
    detail: ready ? detail : [],
    loading: ready && loading,
  };
}