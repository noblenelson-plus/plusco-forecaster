// filepath: lib/finance-toolkit/client-links.ts

/**
 * Finance Toolkit ↔ Forecaster client link. A Forecaster client's
 * `CL_GAIA_Number` values are Maconomy client numbers, so each Maconomy
 * account (FtClient.number) maps exactly to the Forecaster client that lists
 * it — no name matching. That link brings the Forecaster attributes the
 * Maconomy exports don't carry: BU-region and GM pod (read live, so an edit
 * on the Clients page applies here at once).
 *
 * GAIA values may carry a split suffix ("211293-A") or name a range of two
 * numbers ("218255-218288"); both forms resolve to the plain number(s).
 * Pure: no Firebase, no React.
 */

import type { Client } from "../types";

export interface ClientLink {
  /** Forecaster client id and name. */
  clId: string;
  name: string;
  region: string;
  gmPod: string;
}

/** "211293-A" → ["211293"], "218255-218288" → ["218255", "218288"], " 217061 " → ["217061"]. */
export function gaiaNumbers(raw: string): string[] {
  return raw
    .split(/[-–\s,/]+/)
    .map((p) => p.trim())
    .filter((p) => /^\d{5,}$/.test(p));
}

/** Maconomy client number → the Forecaster client that lists it (first one wins on a duplicate). */
export function buildClientLinks(clients: Pick<Client, "cl_id" | "CL_Name" | "CL_GAIA_Number" | "CL_Business_Unit_Region" | "GM_Pod">[]): Map<string, ClientLink> {
  const out = new Map<string, ClientLink>();
  for (const c of clients) {
    for (const raw of c.CL_GAIA_Number ?? []) {
      for (const n of gaiaNumbers(String(raw))) {
        if (!out.has(n)) out.set(n, { clId: c.cl_id, name: c.CL_Name, region: c.CL_Business_Unit_Region ?? "", gmPod: c.GM_Pod ?? "" });
      }
    }
  }
  return out;
}

/** Filter value for an account with no Forecaster client (or an empty attribute). */
export const NOT_LINKED = "__none__";
