// filepath: app/(protected)/admin/finance-toolkit/page.tsx
"use client";

/**
 * Admin — Finance Toolkit (sample for review). Staffing, cost and
 * profitability from Finance's Maconomy exports, in three tabs: Hours Report
 * Portal, Account Profitability and New Business Targets Calculator.
 *
 * Admin-only, like the other admin pages: non-admins are redirected. The
 * toolkit (and its static dataset) is loaded with a dynamic import only once
 * the admin check passes, so other users' browsers never request it. This is
 * UX gating, not a security boundary: the data chunk is a static file on
 * Hosting. Move the data behind Firestore/Storage rules before this goes to
 * production for a wider audience.
 */

import { useEffect } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useUserProfile } from "../../../../lib/hooks/use-user-profile";
import PageHeader from "../../../../components/_shared/page-header";

const FinanceToolkit = dynamic(() => import("../../../../components/finance-toolkit/finance-toolkit"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center gap-2 py-24 text-gray-400">
      <Loader2 size={18} className="animate-spin" />
      <span className="text-sm">Loading Finance Toolkit…</span>
    </div>
  ),
});

export default function FinanceToolkitPage() {
  const { isAdmin, loading } = useUserProfile();
  const router = useRouter();

  // Guard — redirect non-admins.
  useEffect(() => {
    if (!loading && !isAdmin) router.replace("/");
  }, [isAdmin, loading, router]);

  if (loading || !isAdmin) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-400">
        <Loader2 size={18} className="animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Finance Toolkit"
        description="Where our time goes, what each account earns after staffing, and how to staff new business."
        actions={
          <span className="bg-gray-900 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-yellow-400">Sample · Admins only</span>
        }
      />
      <FinanceToolkit />
    </div>
  );
}
