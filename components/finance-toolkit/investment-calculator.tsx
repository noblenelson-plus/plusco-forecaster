// filepath: components/finance-toolkit/investment-calculator.tsx
"use client";

/**
 * New Business Calculator · start from media investment. Three questions
 * (annual investment, digital share, campaigns a year), an optional agency,
 * then the answer in one sentence: the team our most similar current clients
 * actually use for that much media, as a number of full-time people with the
 * range across those clients, split by provisional role group and seniority.
 *
 * Compute in lib/finance-toolkit/investment-plan.ts. The matches can be
 * removed or replaced, as in the revenue calculator.
 */

import { useMemo, useState } from "react";
import { Layers, Table2, Users, X } from "lucide-react";
import { Card } from "../ui/card";
import { ROLE_GROUPS, SENIORITY } from "../../lib/finance-toolkit/roles";
import { STAFFING, STAFFING_AGENCIES } from "../../lib/finance-toolkit/staffing";
import { investmentCandidates, investmentPlan, rankMatches } from "../../lib/finance-toolkit/investment-plan";
import { DataTable, Formula, HowCalculated, Notice, Segmented, selectClass, type Column } from "./ft-ui";
import { formatCompactMoney, money, pct } from "./ft-format";
import type { InvestmentMatch } from "../../lib/finance-toolkit/investment-plan";

const PRESET_INVESTMENT = [1_000_000, 5_000_000, 10_000_000, 25_000_000, 50_000_000];
const PRESET_DIGITAL: { id: string; label: string; share: number }[] = [
  { id: "broadcast", label: "Broadcast-heavy (25%)", share: 0.25 },
  { id: "balanced", label: "Balanced (50%)", share: 0.5 },
  { id: "digital", label: "Digital-heavy (75%)", share: 0.75 },
  { id: "all", label: "Almost all digital (95%)", share: 0.95 },
];
const N_MATCHES = 5;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ym = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;

const GROUP_COLOR: Record<string, string> = {
  Planning: "bg-purple-600",
  Investments: "bg-blue-400",
  "Digital Activation": "bg-green-500",
  "Media team": "bg-pink-400",
  Insights: "bg-yellow-400",
  "Media Operations": "bg-gray-500",
  "Business Leadership": "bg-gray-900",
  Other: "bg-gray-300",
};
const LEVEL_COLOR: Record<string, string> = {
  Junior: "bg-blue-200",
  Intermediate: "bg-blue-400",
  Senior: "bg-purple-400",
  Director: "bg-purple-600",
  Executive: "bg-gray-900",
};

function Step({ n, title, hint, children }: { n: number; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2.5 flex items-center gap-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center bg-gray-900 text-sm font-bold text-yellow-400">{n}</span>
        <span className="text-sm font-semibold text-gray-900">{title}</span>
        {hint && <span className="text-xs text-gray-500">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

/** Horizontal bars with the FTE value on each. */
function FteBars({ parts, colors }: { parts: [string, number][]; colors: Record<string, string> }) {
  const shown = parts.filter(([, v]) => v >= 0.05);
  const max = Math.max(0.1, ...shown.map(([, v]) => v));
  return (
    <ul className="space-y-2">
      {shown.map(([k, v]) => (
        <li key={k} className="grid grid-cols-[150px_1fr_48px] items-center gap-3 text-sm">
          <span className="truncate text-gray-700">{k}</span>
          <span className="h-4 bg-gray-100">
            <span className={`block h-full ${colors[k]}`} style={{ width: `${(v / max) * 100}%` }} />
          </span>
          <span className="text-right font-semibold tabular-nums text-gray-900">{v.toFixed(1)}</span>
        </li>
      ))}
    </ul>
  );
}

export default function InvestmentCalculator() {
  const [investment, setInvestment] = useState(10_000_000);
  const [investmentText, setInvestmentText] = useState("10,000,000");
  const [digital, setDigital] = useState(0.5);
  const [campaignsText, setCampaignsText] = useState("");
  const [agency, setAgency] = useState("all");
  const [manual, setManual] = useState<string[] | null>(null);
  const [adding, setAdding] = useState("");

  const campaigns = Number(campaignsText.replace(/[^\d]/g, "")) || null;
  const candidates = useMemo(() => investmentCandidates(agency), [agency]);
  const ranked = useMemo(
    () => rankMatches(candidates, { investment, digitalShare: digital, campaigns, agency }),
    [candidates, investment, digital, campaigns, agency],
  );
  const chosen = useMemo(
    () =>
      manual ? manual.map((id) => ranked.find((m) => m.row.client.id === id)).filter((m): m is InvestmentMatch => !!m) : ranked.slice(0, N_MATCHES),
    [manual, ranked],
  );
  const plan = useMemo(
    () => investmentPlan({ investment, digitalShare: digital, campaigns, agency }, chosen),
    [investment, digital, campaigns, agency, chosen],
  );

  if (!STAFFING) {
    return (
      <Notice tone="warn">
        <p>Staffing data is not loaded in this build, so the calculator can’t start from investment yet.</p>
      </Notice>
    );
  }

  const setInvestmentValue = (v: number) => {
    const clamped = Math.max(50_000, Math.min(500_000_000, Math.round(v)));
    setInvestment(clamped);
    setInvestmentText(clamped.toLocaleString("en-CA"));
  };
  const chosenIds = chosen.map((m) => m.row.client.id);
  const remove = (id: string) => setManual(chosenIds.filter((x) => x !== id));
  const add = (id: string) => {
    if (!id || chosenIds.includes(id)) return;
    setManual([...chosenIds, id]);
    setAdding("");
  };
  const digitalPreset = PRESET_DIGITAL.find((p) => Math.abs(p.share - digital) < 0.001)?.id ?? "custom";

  const columns: Column<InvestmentMatch>[] = [
    {
      id: "client",
      label: "Similar client",
      render: (m) => (
        <div className="max-w-[240px]">
          <div className="truncate font-medium text-gray-900" title={m.row.client.name}>
            {m.row.client.name}
          </div>
          <div className="text-[11px] text-gray-500">
            {m.row.client.agency} · {m.row.client.gmPod || "No GM pod"}
            {m.row.client.isNew ? " · new, scaled to a year" : ""}
          </div>
        </div>
      ),
    },
    { id: "spend", label: "Media a year", align: "right", sort: (m) => m.annualSpend, render: (m) => formatCompactMoney(m.annualSpend) },
    { id: "digital", label: "Digital", align: "right", sort: (m) => m.digitalShare, render: (m) => pct(m.digitalShare, 0) },
    {
      id: "campaigns",
      label: "Campaigns a year",
      align: "right",
      sort: (m) => m.campaignsPerYear,
      render: (m) => (m.campaignsPerYear === null ? "—" : Math.round(m.campaignsPerYear)),
      headerTitle: "MediaBox campaigns, scaled to all of the client’s spend (shown when at least half is in MediaBox)",
    },
    {
      id: "team",
      label: "Their team (FTE)",
      align: "right",
      sort: (m) => m.row.teamFte,
      render: (m) => (m.row.teamFte === null ? "—" : m.row.teamFte.toFixed(1)),
    },
    {
      id: "spf",
      label: "Spend per FTE",
      align: "right",
      sort: (m) => m.row.spendPerFte,
      render: (m) => formatCompactMoney(m.row.spendPerFte ?? 0),
    },
    {
      id: "implied",
      label: "FTE for your plan",
      align: "right",
      sort: (m) => m.fteForInvestment,
      render: (m) => <span className="font-semibold">{m.fteForInvestment.toFixed(1)}</span>,
      headerTitle: "Your investment ÷ this client’s spend per FTE",
    },
    {
      id: "remove",
      label: "",
      render: (m) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            remove(m.row.client.id);
          }}
          aria-label={`Remove ${m.row.client.name}`}
          className="p-1 text-gray-400 hover:text-gray-900"
        >
          <X size={14} />
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <Card className="gap-0 overflow-hidden p-0">
        <div className="plus-pattern h-1" aria-hidden />
        <div className="space-y-6 p-6">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Plan from media investment</h2>
            <p className="mt-1 text-sm text-gray-500">
              Answer three questions. The team comes from what our most similar clients actually use, over {ym(STAFFING.from)} to {ym(STAFFING.to)}.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <Step n={1} title="Annual media investment (CAD)">
              <input
                id="inv-amount"
                inputMode="numeric"
                value={investmentText}
                onChange={(e) => setInvestmentText(e.target.value)}
                onBlur={() => setInvestmentValue(Number(investmentText.replace(/[^\d]/g, "")) || investment)}
                onKeyDown={(e) => e.key === "Enter" && setInvestmentValue(Number(investmentText.replace(/[^\d]/g, "")) || investment)}
                className="w-full border border-gray-300 bg-white px-3 py-2 text-lg font-semibold tabular-nums text-gray-900 focus:outline-none focus:ring-2 focus:ring-yellow-400"
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {PRESET_INVESTMENT.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setInvestmentValue(v)}
                    className={`border px-2.5 py-1 text-xs font-semibold ${investment === v ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 bg-white text-gray-700 hover:bg-gray-100"}`}
                  >
                    {formatCompactMoney(v)}
                  </button>
                ))}
              </div>
            </Step>
            <Step n={2} title="Share in digital" hint={pct(digital, 0)}>
              <div className="flex flex-wrap gap-1.5">
                {PRESET_DIGITAL.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setDigital(p.share)}
                    className={`border px-2.5 py-1 text-xs font-semibold ${digitalPreset === p.id ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 bg-white text-gray-700 hover:bg-gray-100"}`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <label className="mt-3 block text-xs text-gray-500" htmlFor="inv-digital">
                Or set it exactly: programmatic, social, search and digital direct, as a share of all media
              </label>
              <input
                id="inv-digital"
                type="range"
                min={0}
                max={100}
                step={5}
                value={Math.round(digital * 100)}
                onChange={(e) => setDigital(Number(e.target.value) / 100)}
                className="mt-1 w-full accent-gray-900"
              />
            </Step>
            <Step n={3} title="Campaigns a year" hint="optional">
              <input
                id="inv-campaigns"
                inputMode="numeric"
                placeholder="e.g. 20"
                value={campaignsText}
                onChange={(e) => setCampaignsText(e.target.value)}
                className="w-full border border-gray-300 bg-white px-3 py-2 text-lg font-semibold tabular-nums text-gray-900 focus:outline-none focus:ring-2 focus:ring-yellow-400"
              />
              <p className="mt-2 text-xs text-gray-500">Used to pick similar clients when they have enough campaigns in MediaBox.</p>
            </Step>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-gray-100 pt-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Compare with clients of</span>
            <Segmented
              ariaLabel="Agency"
              size="sm"
              value={agency}
              onChange={(a) => {
                setAgency(a);
                setManual(null);
              }}
              options={[{ id: "all", label: "Any agency" }, ...STAFFING_AGENCIES.map((a) => ({ id: a, label: a }))]}
            />
          </div>
        </div>
      </Card>

      {/* The answer */}
      <Card className="gap-0 p-6">
        {plan ? (
          <>
            <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">The answer</div>
            <h2 className="mt-2 text-2xl font-bold leading-tight text-gray-900 md:text-[28px]">
              A client investing {formatCompactMoney(investment)} a year, {pct(digital, 0)} digital, typically needs about{" "}
              <span className="bg-yellow-400 px-1">{plan.fte.toFixed(1)} full-time people</span>.
            </h2>
            <p className="mt-3 text-base leading-relaxed text-gray-700">
              That’s the middle of {plan.matches.length} similar clients, which would need between{" "}
              <strong className="text-gray-900">{plan.fteLow.toFixed(1)}</strong> and{" "}
              <strong className="text-gray-900">{plan.fteHigh.toFixed(1)}</strong> people for the same media, about{" "}
              {formatCompactMoney(plan.spendPerFte)} of media per person. A wide range usually means the clients differ in how hands-on the work is:
              check the list below and remove any that don’t fit.
            </p>
          </>
        ) : (
          <p className="text-sm text-gray-500">No similar client in this selection. Pick another agency or add a client below.</p>
        )}
      </Card>

      {plan && (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <Card className="gap-0 p-5">
            <div className="mb-4 flex items-start gap-2">
              <Users size={18} className="mt-0.5 shrink-0 text-primary" />
              <div>
                <h3 className="text-base font-semibold text-gray-900">By role group (FTE)</h3>
                <p className="mt-0.5 text-sm text-gray-500">The similar clients’ mix of client hours, applied to {plan.fte.toFixed(1)} people</p>
              </div>
            </div>
            <FteBars parts={ROLE_GROUPS.map((g) => [g, plan.byGroup[g]])} colors={GROUP_COLOR} />
          </Card>
          <Card className="gap-0 p-5">
            <div className="mb-4 flex items-start gap-2">
              <Layers size={18} className="mt-0.5 shrink-0 text-primary" />
              <div>
                <h3 className="text-base font-semibold text-gray-900">By seniority (FTE)</h3>
                <p className="mt-0.5 text-sm text-gray-500">Read from Maconomy titles, junior to executive</p>
              </div>
            </div>
            <FteBars parts={SENIORITY.map((l) => [l, plan.byLevel[l]])} colors={LEVEL_COLOR} />
          </Card>
        </div>
      )}

      <Card className="gap-0 p-5">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            <Table2 size={18} className="mt-0.5 shrink-0 text-primary" />
            <div>
              <h3 className="text-base font-semibold text-gray-900">Similar clients</h3>
              <p className="mt-0.5 text-sm text-gray-500">
                {manual ? "Your picks. " : `The ${N_MATCHES} closest on size, digital share${campaigns ? " and campaigns" : ""}. `}
                Remove one to pick a different client.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select id="inv-add" aria-label="Add a similar client" value={adding} onChange={(e) => add(e.target.value)} className={selectClass}>
              <option value="">Add a client…</option>
              {ranked
                .filter((m) => !chosenIds.includes(m.row.client.id))
                .map((m) => (
                  <option key={m.row.client.id} value={m.row.client.id}>
                    {m.row.client.name} · {formatCompactMoney(m.annualSpend)} · {pct(m.digitalShare, 0)} digital
                  </option>
                ))}
            </select>
            {manual && (
              <button type="button" onClick={() => setManual(null)} className="text-xs font-semibold text-gray-500 hover:text-gray-900">
                Back to the closest {N_MATCHES}
              </button>
            )}
          </div>
        </div>
        <DataTable columns={columns} rows={plan?.matches ?? chosen} rowKey={(m) => m.row.client.id} emptyText="No similar client selected." />
      </Card>

      <Notice>
        <p>
          <strong>First version.</strong> Role groups and seniority are read from Maconomy job titles until the talent team’s department mapping is
          ready, and complexity is not yet adjusted for beyond picking similar clients. Investment is MediaOcean net ordered media; it does not
          include agency fees.
        </p>
      </Notice>

      <HowCalculated>
        <Formula
          name="Similar clients"
          formula="closest on |ln(client media a year ÷ your investment)| + 2 × |difference in digital share| + 0.5 × |ln(client campaigns ÷ yours)| (campaigns only when both are known)"
        />
        <Formula
          name="Spend per FTE (each client)"
          formula="client media spend ÷ (client hours ÷ 1,680), same 12 months; a new client counts hours from its first month of spend"
        />
        <Formula name="FTE for your plan (each client)" formula="your investment ÷ that client’s spend per FTE" />
        <Formula
          name="The answer"
          formula="the middle (median) of those FTEs; the range is the lowest to the highest"
          worked={
            plan
              ? `${money(investment)} → ${plan.matches.map((m) => m.fteForInvestment.toFixed(1)).join(", ")} → ${plan.fte.toFixed(1)} FTE`
              : undefined
          }
        />
        <Formula
          name="By role group and seniority"
          formula="each similar client’s share of client hours by group and level, averaged (each client counts the same), × the answer"
        />
      </HowCalculated>
    </div>
  );
}
