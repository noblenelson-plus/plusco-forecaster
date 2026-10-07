// lib/services/qa-health-service.ts

/**
 * Loads everything the QA page's Data Health checks need — the BigQuery
 * fingerprint (dashboard_meta/qa_fingerprint, written at sync time), the
 * synced MediaOcean collections, Forecaster clients and the configured Labs
 * partners — and runs the pure checks in lib/qa/health-checks.ts.
 *
 * Admin-only: the collections are read whole (admin scope), as on the
 * dashboard for an Admin.
 */

import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import { fetchAgencyScopedDocs } from "../dashboard/data/agency-scoped-query";
import { fetchAccessibleClients } from "./assignment-service";
import { fetchLabsPartners, getLabsPartnersForYear } from "./labs-partner-service";
import { runHealthChecks, type CheckResult, type QaFingerprint } from "../qa/health-checks";

/** The KPI year the fingerprint's labs/total columns refer to. */
const KPI_YEAR = 2026;
/** 2026 Deals values the Deal / Non-Deal split expects in Media Investments. */
const ALLOWED_DEAL_VALUES = ["#N/A", "Partner Deal"];
const ADMIN_SCOPE = { all: true, agencies: [] as string[], includesUnassigned: true };

export interface HealthRun {
  ranAt: Date;
  fingerprintAt: string | null;
  results: CheckResult[];
}

export async function runDataHealthChecks(): Promise<HealthRun> {
  const [fpSnap, syncSnap, kpiDocs, mixDocs, socialDocs, metaSnap, clients, partners] =
    await Promise.all([
      getDoc(doc(db, "dashboard_meta", "qa_fingerprint")),
      getDoc(doc(db, "dashboard_meta", "last_sync")),
      fetchAgencyScopedDocs("mo_kpi_by_client", ADMIN_SCOPE),
      fetchAgencyScopedDocs("mediaocean_investment_mix", ADMIN_SCOPE),
      fetchAgencyScopedDocs("social_partner_mix", ADMIN_SCOPE),
      getDocs(collection(db, "meta_social_output")),
      fetchAccessibleClients(null, true),
      fetchLabsPartners(),
    ]);

  const fingerprint = fpSnap.exists() ? (fpSnap.data() as QaFingerprint) : null;
  const lastFullSyncAt = syncSnap.exists()
    ? ((syncSnap.data().synced_at as string | undefined) ?? null)
    : null;

  // Partner families as the KPI SQL names them ("Billups-OOH" → BILLUPS).
  const labsFamilies = [
    ...new Set(
      getLabsPartnersForYear(partners, KPI_YEAR)
        .map((p) => p.name.split("-")[0].trim().toUpperCase())
        .filter(Boolean)
    ),
  ].sort();

  const results = runHealthChecks({
    fingerprint,
    lastFullSyncAt,
    kpiRows: kpiDocs.map((d) => ({ id: d.id, ...d.data() })),
    mixRows: mixDocs.map((d) => d.data()),
    socialRows: socialDocs.map((d) => d.data()),
    metaSocialDocs: metaSnap.size,
    forecasterClientIds: new Set(clients.map((c) => c.cl_id)),
    labsFamilies,
    allowedDealValues: ALLOWED_DEAL_VALUES,
  });

  return { ranAt: new Date(), fingerprintAt: fingerprint?.generatedAt ?? null, results };
}
