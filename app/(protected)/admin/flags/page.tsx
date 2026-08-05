// app/(protected)/admin/flags/page.tsx
"use client";

/**
 * Admin → Flags config — sets the month window each validation milestone
 * analyzes for the cat-4 "under-target" flags. Global (not per client/RFQ). A
 * "delay" is expressed by leaving recent months out (MediaOcean reports late),
 * e.g. the May Prelim RFQ2 might analyze only Jan–Mar.
 *
 * An empty window means the step raises no under-target flag (it validates the
 * swings only).
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";
import PageHeader from "../../../../components/_shared/page-header";
import { useUserProfile } from "../../../../lib/hooks/use-user-profile";
import { useAuth } from "../../../../lib/auth-context";
import {
  saveStepWindows,
  subscribeToStepWindows,
  type StepWindowMap,
} from "../../../../lib/services/flag-config-service";
import { CONFIRMATION_STEPS } from "../../../../lib/constants/confirmation-steps";
import { MONTHS } from "../../../../lib/types/common.types";

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export default function AdminFlagsConfigPage() {
  const { isAdmin, loading: profileLoading } = useUserProfile();
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!profileLoading && !isAdmin) router.replace("/");
  }, [isAdmin, profileLoading, router]);

  const [windows, setWindows] = useState<StepWindowMap>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    return subscribeToStepWindows((w) => {
      // Only adopt the remote value while there are no unsaved local edits.
      setWindows((prev) => (dirty ? prev : w));
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = (stepId: string, month: number) => {
    setDirty(true);
    setWindows((prev) => {
      const current = new Set(prev[stepId] ?? []);
      if (current.has(month)) current.delete(month);
      else current.add(month);
      return { ...prev, [stepId]: [...current].sort((a, b) => a - b) };
    });
  };

  const setRange = (stepId: string, months: number[]) => {
    setDirty(true);
    setWindows((prev) => ({ ...prev, [stepId]: months }));
  };

  const save = async () => {
    setSaving(true);
    try {
      await saveStepWindows(windows, user?.uid);
      setDirty(false);
    } finally {
      setSaving(false);
    }
  };

  const totalMonths = useMemo(
    () => Object.values(windows).reduce((acc, m) => acc + m.length, 0),
    [windows]
  );

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
          title="Flags config"
          description="Which months each validation step analyzes for under-target flags. Empty = swings only."
          actions={
            <button
              type="button"
              onClick={() => void save()}
              disabled={!dirty || saving}
              className="flex items-center gap-1.5 border border-gray-900 bg-gray-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:opacity-40"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Save
            </button>
          }
        />
      </header>

      <main className="mx-auto w-full max-w-[1200px] flex-1 p-6 md:p-8">
        {loading ? (
          <div className="flex h-64 items-center justify-center text-gray-400">
            <Loader2 size={20} className="animate-spin" />
          </div>
        ) : (
          <div className="overflow-x-auto border border-gray-200 bg-white">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-gray-900 text-white">
                  <th className="px-3 py-2 text-left font-semibold">Milestone</th>
                  <th className="px-2 py-2 text-center font-semibold">RFQ</th>
                  {MONTH_LABELS.map((m) => (
                    <th key={m} className="px-1.5 py-2 text-center text-[11px] font-semibold">
                      {m}
                    </th>
                  ))}
                  <th className="px-2 py-2 text-center font-semibold">All / None</th>
                </tr>
              </thead>
              <tbody>
                {CONFIRMATION_STEPS.map((step, i) => {
                  const set = new Set(windows[step.id] ?? []);
                  return (
                    <tr
                      key={step.id}
                      className={`border-b border-gray-100 ${i % 2 ? "bg-gray-50" : "bg-white"}`}
                    >
                      <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">
                        {step.label}
                      </td>
                      <td className="px-2 py-2 text-center text-xs text-gray-500">
                        {step.targetRfq}
                      </td>
                      {MONTHS.map((m) => {
                        const on = set.has(m);
                        return (
                          <td key={m} className="px-1.5 py-2 text-center">
                            <button
                              type="button"
                              onClick={() => toggle(step.id, m)}
                              aria-pressed={on}
                              className={`h-6 w-6 border text-[11px] font-medium transition-colors ${
                                on
                                  ? "border-green-500 bg-green-500 text-white"
                                  : "border-gray-200 bg-white text-gray-400 hover:bg-gray-100"
                              }`}
                            >
                              {on ? "✓" : ""}
                            </button>
                          </td>
                        );
                      })}
                      <td className="px-2 py-2 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setRange(step.id, [...MONTHS])}
                          className="mr-1 px-1.5 py-0.5 text-[11px] font-medium text-gray-600 hover:bg-gray-100"
                        >
                          All
                        </button>
                        <button
                          type="button"
                          onClick={() => setRange(step.id, [])}
                          className="px-1.5 py-0.5 text-[11px] font-medium text-gray-500 hover:bg-gray-100"
                        >
                          None
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="px-3 py-2 text-[11px] text-gray-400">
              {totalMonths} analyzed month{totalMonths === 1 ? "" : "s"} across all steps.
              Under-target flags compare MediaOcean vs forecast over exactly these months.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
