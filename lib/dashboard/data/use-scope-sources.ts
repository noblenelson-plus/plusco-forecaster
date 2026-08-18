// filepath: lib/dashboard/data/use-scope-sources.ts
"use client";

/**
 * Small lists that drive the scope pickers on the raw data pages (MIR, Billing).
 *
 * The raw collections are huge, so we do NOT scan them for distinct scope values.
 * Instead we read the small existing collections the app already maintains:
 *   - clients  (226 docs) -> client names from CL_Name; business leads from
 *                            CL_Business_Lead (deduped)
 *   - agencies (4 docs)   -> agency names from `name`
 *
 * Region is NOT sourced here: MIR and Billing store the region under different
 * field names (BU_REGION vs PLUSCO_BU_REGION), so each page derives its region
 * list from that page's data. (Agencies/clients/leads share values across both.)
 *
 * The chosen value becomes the equality filter against the raw collection's
 * scope field. Values are expected to match the raw table's values (same upstream
 * source); if a scope returns zero rows, a name-mismatch is the first suspect.
 */

import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../firebase";

export interface ScopeSources {
  clients: string[];
  agencies: string[];
  businessLeads: string[];
  loading: boolean;
  error: string | null;
}

function uniqSorted(values: (string | null | undefined)[]): string[] {
  const set = new Set<string>();
  for (const v of values) {
    const s = (v ?? "").toString().trim();
    if (s !== "") set.add(s);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

export function useScopeSources(): ScopeSources {
  const [clients, setClients] = useState<string[]>([]);
  const [agencies, setAgencies] = useState<string[]>([]);
  const [businessLeads, setBusinessLeads] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [clientSnap, agencySnap] = await Promise.all([
          getDocs(collection(db, "clients")),
          getDocs(collection(db, "agencies")),
        ]);
        if (cancelled) return;

        const clientNames: string[] = [];
        const leadNames: string[] = [];
        clientSnap.docs.forEach((d) => {
          const data = d.data() as Record<string, unknown>;
          clientNames.push((data.CL_Name ?? "").toString());
          leadNames.push((data.CL_Business_Lead ?? "").toString());
        });
        const agencyNames = agencySnap.docs.map((d) => {
          const data = d.data() as Record<string, unknown>;
          return (data.name ?? "").toString();
        });

        setClients(uniqSorted(clientNames));
        setAgencies(uniqSorted(agencyNames));
        setBusinessLeads(uniqSorted(leadNames));
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error ? e.message : "Failed to load scope lists."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { clients, agencies, businessLeads, loading, error };
}
