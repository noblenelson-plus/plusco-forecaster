// filepath: components/finance-toolkit/staffing-method.tsx
"use client";

/**
 * Finance Toolkit · Staffing — the two "show your work" sections:
 *
 *   ComplexityFindings  what explains hours per $1M, fitted live from the same
 *                       data as the tab (lib/finance-toolkit/complexity-model.ts)
 *   MethodPanel         how we got here: every source table and column, the
 *                       steps in order, each decision and why, and how to redo
 *                       any client's numbers by hand from the Reports exports
 *
 * Written for leaders checking the numbers, so it names the tables people can
 * open (Reports › MIR Raw Data, Reports › MediaBox Planner Data, Finance's
 * Maconomy hours report) as well as the BigQuery objects behind them.
 */

import { useState } from "react";
import { Check, Copy, FlaskConical, Route } from "lucide-react";
import { Card } from "../ui/card";
import { FTE_HOURS_PER_MONTH } from "../../lib/finance-toolkit/model";
import { FTE_YEAR_HOURS, MIN_HOURS, MIN_SPEND, STAFFING } from "../../lib/finance-toolkit/staffing";
import { PREDICTOR_LABEL, effectLabel, type ComplexityAnalysis, type Fit } from "../../lib/finance-toolkit/complexity-model";
import { Chip, Disclosure } from "./ft-ui";
import { formatCompactMoney, pct } from "./ft-format";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ym = (s: string) => `${MONTHS[Number(s.slice(5, 7)) - 1]} ${s.slice(0, 4)}`;

/** |t| ≥ 2: the effect is unlikely to be chance with this many clients. */
const reliable = (t: number) => Math.abs(t) >= 2;

function CopyBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard
      ?.writeText(code)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => setCopied(false));
  };
  return (
    <div className="relative">
      <pre className="overflow-x-auto bg-gray-900 px-4 py-3 pr-12 text-xs leading-relaxed text-white">{code}</pre>
      <button
        type="button"
        onClick={copy}
        aria-label="Copy query"
        className="absolute right-2 top-2 p-1.5 text-gray-300 hover:text-white"
        title={copied ? "Copied" : "Copy"}
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
      </button>
    </div>
  );
}

// ─── What explains the hours ─────────────────────────────────────────────────

export function ComplexityFindings({ analysis }: { analysis: ComplexityAnalysis | null }) {
  if (!analysis) return null;
  const base = analysis.fits.find((f) => f.id === "base")!;
  const chosen = analysis.chosen;
  const others = analysis.fits.filter((f) => f.id !== "base");
  const newTerm = (f: Fit) => f.predictors.slice(base.predictors.length);
  return (
    <Card className="gap-0 p-5">
      <div className="mb-4 flex items-start gap-2">
        <FlaskConical size={18} className="mt-0.5 shrink-0 text-primary" />
        <div>
          <h3 className="text-base font-semibold text-gray-900">What explains the hours</h3>
          <p className="mt-0.5 text-sm text-gray-500">
            Why do some clients take more hours per $1M of media than others? We compared {chosen.n} clients (those in the averages that have MediaBox
            campaigns) against each measure. “Share explained” is how much of the difference between clients a measure accounts for.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="border-b-2 border-gray-900 text-left text-[11px] uppercase tracking-wider text-gray-500">
                <th className="py-2 pr-3">What we compare against</th>
                <th className="py-2 pr-3 text-right">Share explained</th>
                <th className="py-2 text-right">Adds</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-100">
                <td className="py-2 pr-3 font-medium text-gray-900">{base.label}</td>
                <td className="py-2 pr-3 text-right font-semibold tabular-nums">{pct(base.r2, 0)}</td>
                <td className="py-2 text-right text-gray-400">starting point</td>
              </tr>
              {others.map((f) => {
                const terms = newTerm(f);
                const anyReliable = terms.some((p) => reliable(f.t[f.predictors.indexOf(p) + 1]));
                return (
                  <tr key={f.id} className={`border-b border-gray-100 ${f.id === chosen.id ? "font-semibold" : ""}`}>
                    <td className="py-2 pr-3 text-gray-700">
                      {f.label}
                      {f.id === chosen.id && (
                        <span className="ml-2">
                          <Chip tone="neutral">used</Chip>
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-right font-semibold tabular-nums">{pct(f.r2, 0)}</td>
                    <td className={`py-2 text-right tabular-nums ${anyReliable ? "font-semibold text-green-700" : "text-gray-400"}`}>
                      +{((f.r2 - base.r2) * 100).toFixed(0)} pts{anyReliable ? "" : " (not reliable)"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="space-y-3 text-sm leading-relaxed text-gray-700">
          <p className="font-semibold text-gray-900">With size, digital share and campaigns per $1M ({pct(chosen.r2, 0)} explained):</p>
          <ul className="space-y-1.5">
            {chosen.predictors.map((p, i) => (
              <li key={p} className="flex items-baseline justify-between gap-3 border-b border-gray-100 pb-1.5">
                <span>{PREDICTOR_LABEL[p]}</span>
                <span className="text-right font-semibold tabular-nums text-gray-900">
                  {effectLabel(p, chosen.coef[i + 1])}{" "}
                  <span className="font-normal text-gray-400">{reliable(chosen.t[i + 1]) ? "reliable" : "not reliable"}</span>
                </span>
              </li>
            ))}
          </ul>
          <p>
            <strong>Many small campaigns is the complexity that costs time.</strong> Tactics, publishers and media types per campaign add little on
            their own once size and digital share are known. About {pct(1 - chosen.r2, 0)} of the difference between clients is still unexplained:
            team setup, client demands, turnover and data gaps all play a part, which is why every number here needs a human read.
          </p>
          <p className="text-xs text-gray-500">
            The <em>vs expected</em> column compares each client’s hours per $1M with this model. Reliable = the effect is at least twice its margin
            of error (|t| ≥ 2).
          </p>
        </div>
      </div>
    </Card>
  );
}

// ─── How we got here ─────────────────────────────────────────────────────────

const STEPS: { title: string; source: string; detail: string; why: string }[] = [
  {
    title: "Media spend per client",
    source: "MediaOcean MIR · Reports › MIR Raw Data · BigQuery PCC_Media_Investment.PCC_Dashboard_NATIVE",
    detail:
      "Sum of NET_ORDERED_CAD by PLUSCO_CLIENT_ID (the Forecaster client) for the months of the period; digital = Programmatic, Social, SEM and Digital Direct.",
    why: "MediaOcean is the agreed source for annual investment and channel mix.",
  },
  {
    title: "Client hours",
    source: "Maconomy Detailed Hours Report (Finance) · BigQuery Finance_Toolkit.maconomy_hours_detail",
    detail:
      "Sum of hours (NumberRegistered) per Maconomy client number for the same months, client work only: time off (15xx work codes), internal work (16xx) and the agencies’ own house accounts are left out.",
    why: "Timesheets are the only record of where people’s time actually goes.",
  },
  {
    title: "Tie hours to the client",
    source: "Forecaster Clients page · GAIA numbers",
    detail:
      "A client’s hours are the hours on every Maconomy account whose client number is one of its GAIA numbers, in any agency. An account listed on two clients is split evenly between them.",
    why: "The GAIA number is the Maconomy client number, so the link is exact (no name matching). It covers 99.7% of media spend.",
  },
  {
    title: "Full-time people (FTE) and spend per FTE",
    source: "Calculated",
    detail: `FTE = client hours ÷ ${FTE_YEAR_HOURS.toLocaleString("en-CA")} (12 × ${FTE_HOURS_PER_MONTH}). Spend per FTE = media spend ÷ FTE. Team size = hours ÷ (${FTE_HOURS_PER_MONTH} × months with hours).`,
    why: `${FTE_HOURS_PER_MONTH} client hours a month is the median for a full employee-month in our own timesheets.`,
  },
  {
    title: "Campaign complexity",
    source:
      "MediaBox · Reports › MediaBox Planner Data · BigQuery PCC_Media_Investment.finance_master_mapping → Finance_Toolkit.staffing_campaigns → staffing_campaign_complexity",
    detail:
      "Per client: unique campaigns (campaign_id) with plan months in the period, then for each campaign the number of distinct media types, publishers and tactics, averaged over the client’s campaigns. Campaigns per $1M = campaigns ÷ media spend in $M.",
    why: "Adriana’s proposed logic, on the table she and the Reports page use, so anyone can rebuild it from the export.",
  },
  {
    title: "What explains the hours",
    source: "Calculated on this page",
    detail:
      "A regression of ln(hours per $1M) on ln(media spend), digital share and each complexity measure, over the clients in the averages that have MediaBox campaigns. The result is the “expected” hours per $1M for each client.",
    why: "To keep only the complexity measures that actually explain workload, and to compare clients fairly (a big, broadcast-heavy client is expected to need fewer hours per dollar).",
  },
];

const DECISIONS: { decision: string; why: string }[] = [
  { decision: "Spend and hours over the same 12 months", why: "Otherwise a client that started part-way through looks over- or under-staffed." },
  {
    decision: "Each client counts its whole team, whichever agency logged the hours",
    why: "Spend is recorded per client. Splitting by agency counted the same spend twice for clients served by both Cossette and Jungle.",
  },
  {
    decision: "A new client’s spend per FTE counts hours from its first month of spend",
    why: "Teams are often staffed before the media starts; counting those months would make every new account look over-staffed.",
  },
  {
    decision: "All planned MediaBox campaigns count, not only those with a MediaOcean MCPE",
    why: "MCPE matching covers only 43% of spend. Restricting to MCPE campaigns dropped 17 clients and explained less of the hours; the MCPE share stays visible per client.",
  },
  {
    decision: "Campaigns per $1M is the complexity measure",
    why: "It is the only measure that reliably explains extra hours once size and digital share are known (see What explains the hours).",
  },
  {
    decision: `Clients under ${MIN_HOURS} hours or ${formatCompactMoney(MIN_SPEND)} of spend are left out of averages`,
    why: "A few hours on a small account produce extreme ratios that would distort averages and pods.",
  },
  {
    decision: "Role groups and seniority are read from Maconomy job titles (provisional)",
    why: "Maconomy has no department field; the talent team’s mapping will replace this.",
  },
];

export function MethodPanel() {
  if (!STAFFING) return null;
  const from = STAFFING.from;
  const to = STAFFING.to;
  const sql = `-- Media spend, MediaBox coverage and counts per client (one row per client x channel + "All channels")
SELECT * FROM \`plusco-media-invest-solutions.Finance_Toolkit.staffing_investment\`('${from}', '${to}');

-- One row per client x MediaBox campaign: distinct media types, publishers, tactics
SELECT * FROM \`plusco-media-invest-solutions.Finance_Toolkit.staffing_campaigns\`('${from}', '${to}');

-- Per client: campaigns and per-campaign averages (built from the query above)
SELECT * FROM \`plusco-media-invest-solutions.Finance_Toolkit.staffing_campaign_complexity\`('${from}', '${to}');`;
  return (
    <Disclosure title="How we got here" subtitle="Every source, step and decision behind this tab, and how to check any client by hand" icon={Route}>
      <div className="space-y-6">
        <p className="text-sm text-gray-600">
          Period:{" "}
          <strong className="text-gray-900">
            {ym(from)} – {ym(to)}
          </strong>
          , the last 12 months of timesheets Finance has given us. All media amounts are MediaOcean net ordered, in CAD.
        </p>

        <section>
          <h4 className="mb-2 text-sm font-semibold text-gray-900">The steps, in order</h4>
          <ol className="space-y-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="grid grid-cols-[28px_1fr] gap-3">
                <span className="flex h-7 w-7 items-center justify-center bg-gray-900 text-sm font-bold text-yellow-400">{i + 1}</span>
                <div className="min-w-0 border-b border-gray-100 pb-3">
                  <div className="text-sm font-semibold text-gray-900">{s.title}</div>
                  <div className="mt-0.5 text-xs font-medium text-purple-600">{s.source}</div>
                  <p className="mt-1 text-sm leading-snug text-gray-700">{s.detail}</p>
                  <p className="mt-1 text-xs text-gray-500">
                    <strong>Why:</strong> {s.why}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section>
          <h4 className="mb-2 text-sm font-semibold text-gray-900">Decisions we made, and why</h4>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b-2 border-gray-900 text-left text-[11px] uppercase tracking-wider text-gray-500">
                  <th className="w-[42%] py-2 pr-4">Decision</th>
                  <th className="py-2">Why</th>
                </tr>
              </thead>
              <tbody>
                {DECISIONS.map((d) => (
                  <tr key={d.decision} className="border-b border-gray-100 align-top">
                    <td className="py-2 pr-4 font-medium text-gray-900">{d.decision}</td>
                    <td className="py-2 text-gray-700">{d.why}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h4 className="mb-2 text-sm font-semibold text-gray-900">Check any client by hand</h4>
          <ol className="list-decimal space-y-1.5 pl-5 text-sm text-gray-700">
            <li>
              <strong>Media spend:</strong> Reports › MIR Raw Data, filter the client and the months {ym(from)} to {ym(to)}, sum Net Ordered (CAD).
            </li>
            <li>
              <strong>Client hours:</strong> in Finance’s Maconomy hours report, filter the client numbers listed in the export’s “Maconomy accounts”
              column and the same months, drop work codes 1500–1699, and sum the hours.
            </li>
            <li>
              <strong>FTE and spend per FTE:</strong> hours ÷ {FTE_YEAR_HOURS.toLocaleString("en-CA")}, then media spend ÷ FTE.
            </li>
            <li>
              <strong>Complexity:</strong> Reports › MediaBox Planner Data, filter the client and months, count unique campaigns; for each campaign
              count unique media types, publishers and tactics, then average them. Campaigns ÷ media spend in $M = campaigns per $1M.
            </li>
            <li>
              <strong>What explains the hours:</strong> export the table to Google Sheets, keep rows marked “In the averages” with campaigns, add
              columns LN(hours per $1M), LN(media spend ÷ 1,000,000) and LN(campaigns per $1M), and run LINEST on them with the digital share. It
              returns the same effects as above.
            </li>
          </ol>
        </section>

        <section>
          <h4 className="mb-2 text-sm font-semibold text-gray-900">The queries behind it (BigQuery)</h4>
          <CopyBlock code={sql} />
        </section>
      </div>
    </Disclosure>
  );
}
