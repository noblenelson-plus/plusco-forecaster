// app/(protected)/report-center/page.tsx
"use client";

/**
 * Report Center (admin-only) — generates read-only Google Sheet reports, one
 * card per report type. Unlike Bulk Edits, these sheets are one-way snapshots
 * shaped for analysis (they never import back). New report types are added as
 * cards below, each backed by a builder in lib/services/report-service.ts.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import PageHeader from "../../../components/_shared/page-header";
import GoogleConnect from "../../../components/bulk-edit/google-connect";
import GeneralForecastReport from "../../../components/report-center/general-forecast-report";
import { useUserProfile } from "../../../lib/hooks/use-user-profile";
import {
  type BulkReference,
  loadBulkReference,
} from "../../../lib/services/bulk-import-service";
import { isConnected } from "../../../lib/services/google-sheets-service";

export default function ReportCenterPage() {
  const router = useRouter();
  const { isAdmin, loading: profileLoading } = useUserProfile();

  const [reference, setReference] = useState<BulkReference | null>(null);
  const [refLoading, setRefLoading] = useState(true);
  const [refError, setRefError] = useState("");
  // Lazy init reflects an existing in-session Google grant without an effect.
  const [connected, setConnected] = useState(() => isConnected());

  // Guard — redirect non-admins.
  useEffect(() => {
    if (!profileLoading && !isAdmin) router.replace("/");
  }, [isAdmin, profileLoading, router]);

  // Load reference data (clients, RFQs, labs partners) once.
  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    (async () => {
      setRefLoading(true);
      setRefError("");
      try {
        const ref = await loadBulkReference();
        if (!cancelled) setReference(ref);
      } catch (err) {
        if (!cancelled)
          setRefError(err instanceof Error ? err.message : "Failed to load data.");
      } finally {
        if (!cancelled) setRefLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  if (profileLoading) return null;
  if (!isAdmin) return null;

  return (
    <div>
      <PageHeader
        title="Report Center"
        description="Generate read-only Google Sheet reports from the forecast data."
        actions={<GoogleConnect connected={connected} onConnectedChange={setConnected} />}
      />

      <div className="p-6 max-w-5xl mx-auto space-y-6">
        {refLoading && (
          <div className="flex items-center gap-2 text-sm text-gray-500 py-10 justify-center">
            <Loader2 size={16} className="animate-spin" /> Loading clients & submissions…
          </div>
        )}

        {refError && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {refError}
          </div>
        )}

        {reference && !refLoading && (
          <GeneralForecastReport reference={reference} connected={connected} />
        )}
      </div>
    </div>
  );
}
