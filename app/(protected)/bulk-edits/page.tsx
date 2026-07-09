// app/(protected)/bulk-edits/page.tsx
"use client";

/**
 * Bulk Edit (admin-only) — export forecast data to a Google Sheet, edit it
 * there, then import it back with a QA + add/replace review. Reuses the
 * single-submission services so commission re-sync and "last updated" stamps
 * behave exactly like the per-client editing page.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import PageHeader from "../../../components/_shared/page-header";
import GoogleConnect from "../../../components/bulk-edit/google-connect";
import ExportPanel from "../../../components/bulk-edit/export-panel";
import ImportPanel from "../../../components/bulk-edit/import-panel";
import { useUserProfile } from "../../../lib/hooks/use-user-profile";
import { useAuth } from "../../../lib/auth-context";
import {
  type BulkReference,
  loadBulkReference,
} from "../../../lib/services/bulk-import-service";
import { isConnected } from "../../../lib/services/google-sheets-service";

export default function BulkEditsPage() {
  const router = useRouter();
  const { isAdmin, loading: profileLoading } = useUserProfile();
  const { user } = useAuth();

  const [reference, setReference] = useState<BulkReference | null>(null);
  const [refLoading, setRefLoading] = useState(true);
  const [refError, setRefError] = useState("");
  // Lazy init reflects an existing in-session Google grant without an effect.
  const [connected, setConnected] = useState(() => isConnected());
  // Bumped after a successful import so panels can reset/reflect fresh data.
  const [, setImportNonce] = useState(0);

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
        title="Bulk Edits"
        description="Export to Google Sheets, edit in bulk, and import back across all axes."
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
          <>
            <ExportPanel reference={reference} connected={connected} />
            <ImportPanel
              reference={reference}
              connected={connected}
              userUid={user?.uid}
              onImported={() => setImportNonce((n) => n + 1)}
            />
          </>
        )}
      </div>
    </div>
  );
}
