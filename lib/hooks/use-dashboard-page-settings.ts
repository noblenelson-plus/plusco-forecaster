// lib/hooks/use-dashboard-page-settings.ts

import { useEffect, useState } from "react";
import {
  subscribeToDashboardPages,
  type DashboardPageSettings,
} from "../services/dashboard-pages-service";

const EMPTY: DashboardPageSettings = { hidden: [], access: {} };

/**
 * Subscribe in real time to the admin-managed dashboard page settings
 * (config/dashboard_pages: per-role access + the older hidden list). While
 * loading it reports no settings, so every page stays on its default roles and
 * the dashboard shows its default tabs rather than an empty bar. Resolve a
 * role's view with hiddenPagesForRole (dashboard-pages.config.ts).
 */
export function useDashboardPageSettings(): {
  settings: DashboardPageSettings;
  loading: boolean;
} {
  const [settings, setSettings] = useState<DashboardPageSettings | null>(null);
  useEffect(() => {
    const unsub = subscribeToDashboardPages(setSettings);
    return () => unsub();
  }, []);
  return { settings: settings ?? EMPTY, loading: settings === null };
}
