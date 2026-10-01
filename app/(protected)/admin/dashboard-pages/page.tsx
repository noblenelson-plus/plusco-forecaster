// app/(protected)/admin/dashboard-pages/page.tsx
"use client";

/**
 * Admin → Dashboard Pages — choose, per role, who sees each dashboard tab and
 * sub-tab. Applies to open dashboards as soon as it's saved; nothing is
 * deleted, and a page switched off for every role is simply hidden. Stored in
 * config/dashboard_pages (dashboard-pages-service.ts); the pages, their default
 * roles and the locked combinations come from
 * components/forecaster/dashboard-pages.config.ts.
 *
 * Guardrails: revenue pages stay off for Viewers (the data rules don't hide
 * revenue figures), and every role keeps at least one tab.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RotateCcw, Save } from "lucide-react";
import PageHeader from "../../../../components/_shared/page-header";
import { useUserProfile } from "../../../../lib/hooks/use-user-profile";
import { useAuth } from "../../../../lib/auth-context";
import {
  saveDashboardPages,
  subscribeToDashboardPages,
} from "../../../../lib/services/dashboard-pages-service";
import {
  DASHBOARD_PAGES,
  hiddenPagesForRole,
  isTabVisible,
  resolvePageAccess,
} from "../../../../components/forecaster/dashboard-pages.config";
import {
  DASHBOARD_ROLES,
  FORECASTER_TABS,
} from "../../../../components/forecaster/forecaster-tabs.config";
import type { UserRole } from "../../../../lib/types/user.types";

const ROLE_LABELS: Record<UserRole, string> = {
  VIEWER: "Viewer",
  BUSINESS_LEAD: "Business Lead",
  EXEC: "Exec",
  ADMIN: "Admin",
};

type AccessMap = Record<string, UserRole[]>;

function Switch({
  on,
  onChange,
  label,
  disabled = false,
  title,
}: {
  on: boolean;
  onChange: () => void;
  label: string;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      title={title}
      disabled={disabled}
      onClick={onChange}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
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

  // The full effective role map for every page (defaults filled in).
  const [access, setAccess] = useState<AccessMap>(() => resolvePageAccess({}));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  // Read by the snapshot callback, so it must be a ref (a state value captured
  // at subscribe time would always be false and remote updates would overwrite
  // unsaved edits).
  const dirtyRef = useRef(false);

  useEffect(() => {
    return subscribeToDashboardPages(({ access: saved, hidden }) => {
      if (!dirtyRef.current) setAccess(resolvePageAccess(saved, new Set(hidden)));
      setLoading(false);
    });
  }, []);

  const markDirty = (next: boolean) => {
    dirtyRef.current = next;
    setDirty(next);
  };

  const toggle = (pageId: string, role: UserRole) => {
    markDirty(true);
    setSaveError(null);
    setAccess((prev) => {
      const roles = prev[pageId] ?? [];
      const next = roles.includes(role) ? roles.filter((r) => r !== role) : [...roles, role];
      return { ...prev, [pageId]: DASHBOARD_ROLES.filter((r) => next.includes(r)) };
    });
  };

  const resetToDefaults = () => {
    markDirty(true);
    setSaveError(null);
    setAccess(resolvePageAccess({}));
  };

  // Guardrail: every role must keep at least one tab.
  const rolesWithoutTab = useMemo(
    () =>
      DASHBOARD_ROLES.filter((role) => {
        const hidden = hiddenPagesForRole(role, access);
        return !FORECASTER_TABS.some((t) => isTabVisible(t.id, hidden));
      }),
    [access]
  );

  const save = async () => {
    if (rolesWithoutTab.length) return;
    setSaving(true);
    setSaveError(null);
    try {
      await saveDashboardPages(access, user?.uid);
      markDirty(false);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  if (profileLoading || !isAdmin) {
    return (
      <div className="flex h-64 items-center justify-center text-gray-400">
        <Loader2 size={20} className="animate-spin" />
      </div>
    );
  }

  const cell = (
    page: { id: string; label: string; lockedRoles: readonly UserRole[] },
    role: UserRole,
    parentOn: boolean
  ) => {
    const locked = page.lockedRoles.includes(role);
    return (
      <td key={role} className="px-3 py-2 text-center">
        <span className="inline-flex justify-center">
          <Switch
            on={!locked && (access[page.id] ?? []).includes(role)}
            onChange={() => toggle(page.id, role)}
            label={`${page.label} — ${ROLE_LABELS[role]}`}
            disabled={locked || !parentOn}
            title={
              locked
                ? "Viewers have no revenue access, so revenue pages stay off for them."
                : !parentOn
                  ? `The tab is off for ${ROLE_LABELS[role]}s.`
                  : undefined
            }
          />
        </span>
      </td>
    );
  };

  return (
    <div className="flex min-h-[calc(100vh/var(--app-zoom,1))] flex-col bg-muted">
      <header className="sticky top-14 lg:top-0 z-20 bg-white">
        <PageHeader
          title="Dashboard Pages"
          description="Choose which roles see each dashboard tab and sub-tab. Changes apply to open dashboards right after saving. Nothing is deleted — a page off for every role is just hidden."
          actions={
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={resetToDefaults}
                className="flex items-center gap-1.5 border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                <RotateCcw size={14} />
                Reset to defaults
              </button>
              <button
                type="button"
                onClick={() => void save()}
                disabled={!dirty || saving || rolesWithoutTab.length > 0}
                className="flex items-center gap-1.5 border border-gray-900 bg-gray-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:opacity-40"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Save
              </button>
            </div>
          }
        />
      </header>

      <main className="mx-auto w-full max-w-[1000px] flex-1 space-y-4 p-6 md:p-8">
        {rolesWithoutTab.length > 0 && (
          <div className="border border-red-500 bg-red-500 px-4 py-2 text-sm text-white">
            Every role needs at least one tab. Turn a tab back on for:{" "}
            {rolesWithoutTab.map((r) => ROLE_LABELS[r]).join(", ")}.
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
          <div className="overflow-x-auto border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-gray-900 text-white">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold">Page</th>
                  {DASHBOARD_ROLES.map((r) => (
                    <th key={r} className="px-3 py-2 text-center font-semibold whitespace-nowrap">
                      {ROLE_LABELS[r]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DASHBOARD_PAGES.map((page) => (
                  <PageRows key={page.id}>
                    <tr className="border-t border-gray-200">
                      <td className="px-4 py-3 font-semibold text-gray-900">{page.label}</td>
                      {DASHBOARD_ROLES.map((role) => cell(page, role, true))}
                    </tr>
                    {page.children.map((child) => (
                      <tr key={child.id} className="border-t border-gray-50">
                        <td className="py-2 pl-10 pr-4 text-gray-700">{child.label}</td>
                        {DASHBOARD_ROLES.map((role) =>
                          cell(child, role, (access[page.id] ?? []).includes(role))
                        )}
                      </tr>
                    ))}
                  </PageRows>
                ))}
              </tbody>
            </table>
            <p className="border-t border-gray-100 px-4 py-2 text-[11px] text-gray-400">
              A sub-tab shows only when its tab is on for that role, and a tab whose sub-tabs are
              all off is hidden. Showing a page never widens data access: each user still only
              sees the clients and agencies the security rules allow.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

/** Groups a tab row with its sub-tab rows (a fragment with a stable key). */
function PageRows({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
