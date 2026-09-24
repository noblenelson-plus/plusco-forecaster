// lib/hooks/use-hidden-dashboard-pages.ts

import { useEffect, useMemo, useState } from "react";
import { subscribeToHiddenPages } from "../services/dashboard-pages-service";

/**
 * Subscribe in real time to the admin-managed hidden dashboard pages
 * (config/dashboard_pages). While loading, nothing is hidden, so the dashboard
 * shows its default tabs rather than an empty bar.
 */
export function useHiddenDashboardPages(): { hidden: ReadonlySet<string>; loading: boolean } {
  const [ids, setIds] = useState<string[] | null>(null);
  useEffect(() => {
    const unsub = subscribeToHiddenPages(setIds);
    return () => unsub();
  }, []);
  const hidden = useMemo(() => new Set(ids ?? []), [ids]);
  return { hidden, loading: ids === null };
}
