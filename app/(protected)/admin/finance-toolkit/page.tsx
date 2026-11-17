// filepath: app/(protected)/admin/finance-toolkit/page.tsx
"use client";

/**
 * Finance Toolkit (in progress). Staffing, cost and profitability from
 * Finance's Maconomy exports, in three tabs: Hours Report Portal, Account
 * Profitability and New Business Targets Calculator.
 *
 * Restricted to the named viewers in lib/finance-toolkit/access.ts (not every
 * admin) until it is complete; everyone else is redirected home. The dataset
 * is not in any bundle: the page downloads it from /api/finance-toolkit-data,
 * which verifies the sign-in token and checks the same list server-side, then
 * hands it to the model (data-holder.ts) before loading the toolkit UI.
 */

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "../../../../lib/auth-context";
import { canViewFinanceToolkit } from "../../../../lib/finance-toolkit/access";
import { setFinanceToolkitData } from "../../../../lib/finance-toolkit/data-holder";
import type { FinanceToolkitData } from "../../../../lib/finance-toolkit/finance-toolkit.types";
import PageHeader from "../../../../components/_shared/page-header";

function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-24 text-gray-400">
      <Loader2 size={18} className="animate-spin" />
      {label && <span className="text-sm">{label}</span>}
    </div>
  );
}

// Loaded only after the dataset is in the holder (model.ts reads it on load).
const FinanceToolkit = dynamic(() => import("../../../../components/finance-toolkit/finance-toolkit"), {
  ssr: false,
  loading: () => <Spinner label="Loading Finance Toolkit…" />,
});

type LoadState = { status: "loading" } | { status: "ready" } | { status: "error"; message: string };

export default function FinanceToolkitPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const allowed = canViewFinanceToolkit(user?.email);
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  // Guard — everyone not on the viewer list goes home.
  useEffect(() => {
    if (!loading && !allowed) router.replace("/");
  }, [allowed, loading, router]);

  // Download the dataset (token-checked server-side).
  useEffect(() => {
    if (!user || !allowed) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch("/api/finance-toolkit-data", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? `HTTP ${res.status}`);
        }
        const data = (await res.json()) as FinanceToolkitData;
        if (cancelled) return;
        setFinanceToolkitData(data);
        setState({ status: "ready" });
      } catch (e) {
        if (!cancelled) setState({ status: "error", message: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, allowed, attempt]);

  if (loading || !allowed) return <Spinner />;

  return (
    <div>
      <PageHeader
        title="Finance Toolkit"
        description="Where our time goes, what each account earns after staffing, and how to staff new business."
        actions={
          <span className="bg-gray-900 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-yellow-400">Sample · In progress</span>
        }
      />
      {state.status === "loading" && <Spinner label="Loading Finance Toolkit…" />}
      {state.status === "error" && (
        <div className="flex flex-col items-center gap-3 py-24 text-sm text-gray-600">
          <p>Couldn’t load the Finance Toolkit data: {state.message}</p>
          <button
            type="button"
            onClick={() => {
              setState({ status: "loading" });
              setAttempt((a) => a + 1);
            }}
            className="border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100"
          >
            Try again
          </button>
        </div>
      )}
      {state.status === "ready" && <FinanceToolkit />}
    </div>
  );
}
