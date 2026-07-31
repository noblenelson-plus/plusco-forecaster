// app/(protected)/flags/page.tsx
"use client";

/**
 * Flags page — the single home for the forecast flag/alert system, scoped to the
 * globally selected Client + Year + RFQ (same selectors as the forecast page).
 *
 *   §1  QA checks (cat 2)   — live, frontend-only banners (Labs > media,
 *                             MediaOcean > forecast). Never persisted.
 *   §2  Big swings (cat 3)  — persisted flags vs the previous RFQ; justify each.
 *   §3  Under target (cat 4)— persisted MediaOcean-under-forecast flags; justify.
 *
 * Flags (§2/§3) are created/updated by running a validation from the forecast
 * page's "BL Forecast Validation" control — this page manages and justifies
 * them, it does not itself re-run the analysis.
 */

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, DollarSign, FlaskConical, TrendingUp } from "lucide-react";
import PageHeader from "../../../components/_shared/page-header";
import ForecastSelectors from "../../../components/_shared/forecast-selectors";
import BlAlertBanner from "../../../components/flags/bl-alert-banner";
import FlagCard from "../../../components/flags/flag-card";
import { useForecastSelection } from "../../../lib/stores/forecast-selection.store";
import { fetchAxisData } from "../../../lib/services/data-entry-service";
import { fetchAnnualActuals } from "../../../lib/services/annual-actuals-service";
import { subscribeToLabsPartners } from "../../../lib/services/labs-partner-service";
import { subscribeToRFQs } from "../../../lib/services/rfq-service";
import { useForecastValidation } from "../../../lib/hooks/use-forecast-validation";
import { computeBlAlerts } from "../../../lib/flags/bl-alerts";
import { emptyAxisData, type AxisData } from "../../../lib/types/forecaster.types";
import type { MediaType } from "../../../lib/types/common.types";
import type { LabsPartner } from "../../../lib/types/labs.types";
import type { RFQ } from "../../../lib/types/rfq.types";
import { stepsForRfq } from "../../../lib/constants/confirmation-steps";
import type { RfqValidationStatus } from "../../../lib/types/forecast-flags.types";

const STATUS_META: Record<
  RfqValidationStatus,
  { label: string; className: string }
> = {
  not_validated: { label: "Not validated", className: "bg-gray-100 text-gray-600" },
  failed: { label: "Validation failed", className: "bg-yellow-400 text-gray-900" },
  validated: { label: "Validated", className: "bg-green-500 text-white" },
  stale_bl: { label: "BL data changed — revalidate", className: "bg-yellow-400 text-gray-900" },
  stale_mo: { label: "MediaOcean changed — revalidate", className: "bg-yellow-400 text-gray-900" },
};

export default function FlagsPage() {
  const { selectedClient, selectedYear, selectedRFQ } = useForecastSelection();
  const ready = !!selectedClient && !!selectedYear && !!selectedRFQ;
  const currency = selectedClient?.CL_Currency ?? "CAD";

  // Lab partners (all years) — name + media-type resolvers for the engines.
  const [labsPartners, setLabsPartners] = useState<LabsPartner[]>([]);
  useEffect(() => subscribeToLabsPartners(setLabsPartners), []);
  const partnerById = useMemo(() => {
    const map = new Map<string, LabsPartner>();
    for (const p of labsPartners) map.set(p.partnerId, p);
    return map;
  }, [labsPartners]);
  const partnerLabel = useMemo(
    () => (id: string) => partnerById.get(id)?.name ?? id,
    [partnerById]
  );
  const partnerMediaType = useMemo(
    () => (id: string): MediaType | undefined => partnerById.get(id)?.mediaType,
    [partnerById]
  );

  const [rfqs, setRFQs] = useState<RFQ[]>([]);
  useEffect(() => subscribeToRFQs(setRFQs), []);
  const allRfqs = useMemo(() => rfqs.map((r) => ({ year: r.year, type: r.type })), [rfqs]);

  // Saved axes for the selected submission — media/labs merge the annual
  // MediaOcean actuals (they live in annual_actuals), so cat-2 alerts and MO
  // drift see the same numbers the grid does. Revenue is unused here.
  const [media, setMedia] = useState<AxisData>(emptyAxisData());
  const [labs, setLabs] = useState<AxisData>(emptyAxisData());
  const [loadingAxes, setLoadingAxes] = useState(false);
  useEffect(() => {
    if (!ready) {
      setMedia(emptyAxisData());
      setLabs(emptyAxisData());
      return;
    }
    let cancelled = false;
    setLoadingAxes(true);
    const cl = selectedClient!.cl_id;
    const yr = selectedYear!;
    const rfq = selectedRFQ!.type;
    Promise.all([
      fetchAxisData(cl, yr, rfq, "media"),
      fetchAnnualActuals(cl, yr, "media"),
      fetchAxisData(cl, yr, rfq, "labs"),
      fetchAnnualActuals(cl, yr, "labs"),
    ])
      .then(([m, mA, l, lA]) => {
        if (cancelled) return;
        setMedia({ ...m, actuals: mA });
        setLabs({ ...l, actuals: lA });
      })
      .catch((err) => console.error("Flags page axis fetch failed:", err))
      .finally(() => {
        if (!cancelled) setLoadingAxes(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ready, selectedClient?.cl_id, selectedYear, selectedRFQ?.type]);

  const validation = useForecastValidation({
    media,
    labs,
    revenue: emptyAxisData(),
    allRfqs,
    partnerLabel,
    partnerMediaType,
    persistDirty: async () => {},
    hasUnsavedEdits: false,
  });

  const alerts = useMemo(
    () => computeBlAlerts({ media, labs, partnerMediaType }),
    [media, labs, partnerMediaType]
  );

  const swings = validation.flags.filter((f) => f.category === "swing");
  const underTarget = validation.flags.filter((f) => f.category === "under_target");
  const steps = selectedRFQ ? stepsForRfq(selectedRFQ.type) : [];

  return (
    <div className="flex min-h-screen flex-col bg-muted">
      <header className="sticky top-14 lg:top-0 z-20 bg-white">
        <PageHeader
          title="Flags"
          description="QA checks, big-swing flags and under-target flags for the selected submission."
          actions={<ForecastSelectors orientation="horizontal" theme="light" />}
        />
      </header>

      <main className="mx-auto w-full max-w-[1400px] flex-1 space-y-10 p-6 md:p-8">
        {!ready ? (
          <div className="flex h-64 items-center justify-center text-sm text-gray-400">
            Select a Client, Year and submission to see its flags.
          </div>
        ) : (
          <>
            {/* Validation status for this RFQ's milestones. */}
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-semibold text-gray-700">Validation:</span>
              {steps.map((s) => {
                const status = validation.stepStatus(s.id);
                const meta = STATUS_META[status];
                return (
                  <span
                    key={s.id}
                    className={`px-2.5 py-1 text-xs font-medium ${meta.className}`}
                    title={s.label}
                  >
                    {s.short} · {meta.label}
                  </span>
                );
              })}
              <span className="text-xs text-gray-400">
                Run a validation from the forecast page to refresh these flags.
              </span>
            </div>

            {/* §1 — QA checks (cat 2, live). */}
            <Section
              icon={AlertTriangle}
              title="QA checks"
              subtitle="Data-consistency issues in this submission (e.g. Labs above media spend, or MediaOcean above the BL forecast). Fix the underlying figures on the forecast page and they clear on their own — nothing to justify, nothing saved."
              count={alerts.length}
            >
              {loadingAxes ? (
                <SkeletonNote>Loading…</SkeletonNote>
              ) : alerts.length === 0 ? (
                <AllClear label="No QA issues for this submission." />
              ) : (
                <div className="grid grid-cols-1 items-start gap-3 xl:grid-cols-2">
                  {alerts.map((a) => (
                    <BlAlertBanner key={a.id} alert={a} currency={currency} />
                  ))}
                </div>
              )}
            </Section>

            {/* §2 — Big swings (cat 3, persisted). */}
            <Section
              icon={TrendingUp}
              title="Big swings"
              subtitle="This RFQ's annual total moved sharply from the previous RFQ. Resolve each by adjusting the forecast to shrink the gap and re-validating, or by justifying it with a context and comment."
              count={swings.length}
            >
              {swings.length === 0 ? (
                <AllClear label="No swing flags. Run a validation to check." />
              ) : (
                <div className="grid grid-cols-1 items-start gap-3 xl:grid-cols-2">
                  {swings.map((f) => (
                    <FlagCard key={f.key} flag={f} currency={currency} onJustify={validation.justify} />
                  ))}
                </div>
              )}
            </Section>

            {/* §3 — Under target (cat 4, persisted). */}
            <Section
              icon={FlaskConical}
              title="Under target"
              subtitle="MediaOcean actuals are running below the BL forecast over the analyzed months. Resolve each by lowering the forecast to match and re-validating, or by justifying it with a context and comment."
              count={underTarget.length}
            >
              {underTarget.length === 0 ? (
                <AllClear label="No under-target flags. Run a validation to check." />
              ) : (
                <div className="grid grid-cols-1 items-start gap-3 xl:grid-cols-2">
                  {underTarget.map((f) => (
                    <FlagCard key={f.key} flag={f} currency={currency} onJustify={validation.justify} />
                  ))}
                </div>
              )}
            </Section>
          </>
        )}
      </main>
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  subtitle,
  count,
  children,
}: {
  icon: typeof DollarSign;
  title: string;
  subtitle: string;
  /** Item count shown as a badge next to the title. */
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-3 border-b-2 border-gray-900 pb-2.5">
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center bg-gray-900 text-white">
          <Icon size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 text-lg font-bold leading-tight text-gray-900">
            {title}
            {count !== undefined && (
              <span className="flex h-6 min-w-6 items-center justify-center bg-gray-900 px-1.5 text-sm font-bold text-white">
                {count}
              </span>
            )}
          </h2>
          <p className="text-xs text-gray-500">{subtitle}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function AllClear({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 border border-gray-200 bg-white px-4 py-3 text-sm text-gray-500">
      <CheckCircle2 size={16} className="flex-shrink-0 text-green-500" />
      {label}
    </div>
  );
}

function SkeletonNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="border border-gray-200 bg-white px-4 py-3 text-sm text-gray-400">
      {children}
    </div>
  );
}
