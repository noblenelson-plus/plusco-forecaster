// app/(protected)/admin/dashboard-pages/page.tsx
"use client";

/**
 * Admin → Dashboard Pages — show/hide each dashboard tab and sub-tab.
 *
 * Hidden pages disappear for everyone (admins included) as soon as this is
 * saved; nothing is deleted, and switching a page back on restores it. Stored
 * in config/dashboard_pages (dashboard-pages-service.ts); the list of pages
 * comes from components/forecaster/dashboard-pages.config.ts.
 *
 * Guardrail: at least one tab that Agency Viewers can see must stay visible
 * (Viewers see the fewest tabs, so every role keeps at least one).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";
import PageHeader from "../../../../components/_shared/page-header";
import { useUserProfile } from "../../../../lib/hooks/use-user-profile";
import { useAuth } from "../../../../lib/auth-context";
import {
  saveHiddenPages,
  subscribeToHiddenPages,
} from "../../../../lib/services/dashboard-pages-service";
import {
  DASHBOARD_PAGES,
  isTabVisible,
} from "../../../../components/forecaster/dashboard-pages.config";
import {
  visibleForecasterTabs,
  type ForecasterTab,
} from "../../../../components/forecaster/forecaster-tabs.config";

// The tabs an Agency Viewer (fewest permissions) can see.
const VIEWER_TABS = visibleForecasterTabs({
  canViewRevenue: false,
  canViewGlobalDashboard: false,
});

function Switch({
  on,
  onChange,
  label,
  disabled = false,
}: {
  on: boolean;
  onChange: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center transition-colors disabled:opacity-40 ${
        on ? "bg-green-500" : "bg-gray-300"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
          on ? "translate-x-[18px]" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

export default function AdminDashboardPagesPage() {
  const { isAdmin, loading: profileLoading } = useUserProfile();
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!profileLoading && !isAdmin) router.replace("/");
  }, [isAdmin, profileLoading, router]);

  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  // Read by the snapshot callback, so it must be a ref (a state value captured
  // at subscribe time would always be false and remote updates would overwrite
  // unsaved edits).
  const dirtyRef = useRef(false);

  useEffect(() => {
    return subscribeToHiddenPages((ids) => {
      if (!dirtyRef.current) setHidden(new Set(ids));
      setLoading(false);
    });
  }, []);

  const markDirty = (next: boolean) => {
    dirtyRef.current = next;
    setDirty(next);
  };

  const toggle = (id: string) => {
    markDirty(true);
    setSaveError(null);
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Guardrail: Viewers must keep at least one tab.
  const viewerHasTab = useMemo(
    () => VIEWER_TABS.some((t) => isTabVisible(t.id, hidden)),
    [hidden]
  );

  const save = async () => {
    if (!viewerHasTab) return;
    setSaving(true);
    setSaveError(null);
    try {
      await saveHiddenPages([...hidden], user?.uid);
      markDirty(false);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const hiddenCount = hidden.size;

  if (profileLoading || !isAdmin) {
    return (
      <div className="flex h-64 items-center justify-center text-gray-400">
        <Loader2 size={20} className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh/var(--app-zoom,1))] flex-col bg-muted">
      <header className="sticky top-14 lg:top-0 z-20 bg-white">
        <PageHeader
          title="Dashboard Pages"
          description="Choose which dashboard tabs and sub-tabs are shown. Hidden pages disappear for everyone, including admins. Nothing is deleted — switch a page back on anytime."
          actions={
            <button
              type="button"
              onClick={() => void save()}
              disabled={!dirty || saving || !viewerHasTab}
              className="flex items-center gap-1.5 border border-gray-900 bg-gray-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:opacity-40"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Save
            </button>
          }
        />
      </header>

      <main className="mx-auto w-full max-w-[900px] flex-1 space-y-4 p-6 md:p-8">
        {!viewerHasTab && (
          <div className="border border-red-500 bg-red-500 px-4 py-2 text-sm text-white">
            At least one of these tabs must stay visible so Agency Viewers still have a page:{" "}
            {VIEWER_TABS.map((t) => t.label).join(", ")}.
          </div>
        )}
        {saveError && (
          <div className="border border-red-500 bg-red-500 px-4 py-2 text-sm text-white">
            Couldn&apos;t save: {saveError}
          </div>
        )}

        {loading ? (
          <div className="flex h-64 items-center justify-center text-gray-400">
            <Loader2 size={20} className="animate-spin" />
          </div>
        ) : (
          <div className="border border-gray-200 bg-white">
            <div className="flex items-center justify-between bg-gray-900 px-4 py-2 text-sm font-semibold text-white">
              <span>Page</span>
              <span>Shown</span>
            </div>
            {DASHBOARD_PAGES.map((page) => {
              const tabOn = !hidden.has(page.id);
              const tabEffective = isTabVisible(page.id as ForecasterTab, hidden);
              return (
                <div key={page.id} className="border-b border-gray-100 last:border-b-0">
                  <div className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{page.label}</p>
                      {tabOn && !tabEffective && (
                        <p className="text-xs text-gray-500">
                          Hidden, because all of its sub-tabs are hidden.
                        </p>
                      )}
                    </div>
                    <Switch on={tabOn} onChange={() => toggle(page.id)} label={`Show ${page.label}`} />
                  </div>
                  {page.children.map((child) => (
                    <div
                      key={child.id}
                      className="flex items-center justify-between border-t border-gray-50 py-2 pl-10 pr-4"
                    >
                      <p className={`text-sm ${tabOn ? "text-gray-700" : "text-gray-400"}`}>
                        {child.label}
                      </p>
                      <Switch
                        on={!hidden.has(child.id)}
                        onChange={() => toggle(child.id)}
                        label={`Show ${page.label} → ${child.label}`}
                        disabled={!tabOn}
                      />
                    </div>
                  ))}
                </div>
              );
            })}
            <p className="border-t border-gray-100 px-4 py-2 text-[11px] text-gray-400">
              {hiddenCount === 0
                ? "Every page is shown."
                : `${hiddenCount} page${hiddenCount === 1 ? "" : "s"} hidden.`}{" "}
              Changes apply to open dashboards immediately after saving.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
