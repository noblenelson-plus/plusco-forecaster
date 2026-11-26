// components/forecaster/sections/investments/partner-data-section.tsx
"use client";

/**
 * Exec KPI Dashboard → Partner Data. Partners send monthly spend reports that
 * aren't always right, so we cross-check them against what we booked in
 * Mediaocean (MIR): partner × client, year-to-date (month by month on click).
 * Reads the comparison published by scripts/partner-data/publish.cjs
 * (partner_data/demo) — a snapshot of the reports compared so far (Quantcast,
 * Amazon, Billups), not an automated monthly feed yet.
 */

import { Fragment, useEffect, useMemo, useState } from "react";
import { Database, ExternalLink, Search, Lightbulb, ListChecks, CircleSlash } from "lucide-react";
import ChartCard from "../../../dashboard/charts/chart-card";
import {
  fetchPartnerData,
  type PartnerDataDoc,
  type PartnerDataYtd,
} from "../../../../lib/services/partner-data-service";
import { CELL, ErrorBox, HEAD_ROW, Loading, MUTED_CELL, NUM, ROW, TH, TOTAL_NUM, TOTAL_ROW, money, pct } from "./investments-shared";

const isMatch = (s: string) => s.startsWith("Matches");
const variancePct = (report: number, mir: number) => (mir ? (report - mir) / Math.abs(mir) : null);

function explain(x: PartnerDataYtd): string {
  if (x.status === "Name not matched") return "Client name in the report doesn't match any MIR client — needs a mapping decision";
  if (x.status === "In MIR, not in partner report") return "Booked in MIR, but the partner reports nothing for this client";
  if (x.status === "In partner report, not in MIR") return "Partner reports spend we have no MIR booking for";
  return x.partnerAmt < x.mirAmt ? "MIR booked more than the partner reports" : "Partner reports more than MIR booked";
}

const varClass = (v: number) => (v > 0 ? "text-green-700" : v < 0 ? "text-red-600" : "");

type Load = { status: "loading" } | { status: "empty" } | { status: "ready"; data: PartnerDataDoc } | { status: "error"; message: string };

export default function PartnerDataSection() {
  const [state, setState] = useState<Load>({ status: "loading" });
  const [partner, setPartner] = useState<string>("All");
  const [open, setOpen] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchPartnerData()
      .then((data) => !cancelled && setState(data ? { status: "ready", data } : { status: "empty" }))
      .catch((e: unknown) => !cancelled && setState({ status: "error", message: e instanceof Error ? e.message : String(e) }));
    return () => {
      cancelled = true;
    };
  }, []);

  const data = state.status === "ready" ? state.data : null;
  const lines = useMemo(() => {
    if (!data) return [];
    return data.ytd
      .filter((x) => (partner === "All" || x.partner === partner) && (showAll || !isMatch(x.status)))
      .sort((a, b) => Math.abs(b.partnerAmt - b.mirAmt) - Math.abs(a.partnerAmt - a.mirAmt));
  }, [data, partner, showAll]);

  if (state.status === "loading") return <Loading />;
  if (state.status === "error") return <ErrorBox what="Partner Data" message={state.message} />;
  if (state.status === "empty" || !data) {
    return <div className="border border-dashed border-gray-300 px-4 py-10 text-center text-sm text-muted-foreground">No partner data published yet.</div>;
  }

  const tot = data.partners.reduce(
    (a, p) => ({ report: a.report + p.report, mir: a.mir + p.mir, lines: a.lines + p.lines, flagged: a.flagged + p.flagged }),
    { report: 0, mir: 0, lines: 0, flagged: 0 }
  );
  const keyOf = (x: { partner: string; channel: string; client: string }) => `${x.partner}|${x.channel}|${x.client}`;
  const months = (x: PartnerDataYtd) =>
    data.detail.filter((m) => m.partner === x.partner && m.channel === x.channel && m.client === x.client).sort((a, b) => a.month.localeCompare(b.month));
  const asOf = new Date(data.generatedAt).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" });

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <Database size={18} className="text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Partner Data — partner spend reports vs Mediaocean</h2>
          <span className="text-xs font-medium text-muted-foreground">· demo · compared {asOf}</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Partners send monthly spend reports, but they aren&apos;t always right. Each report is read, its clients matched to MIR
          clients, and compared with what we booked in Mediaocean ({data.mirSource}). Demo with 3 partners — a snapshot, not yet
          an automated monthly feed.{" "}
          <a href={data.sheetUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline">
            Review sheet <ExternalLink size={11} />
          </a>
        </p>
      </div>

      <ChartCard title="By partner" subtitle="Variance = partner report − MIR booked; a client needs a look when off by more than $1,000 and more than 1% (year-to-date)" icon={ListChecks}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className={HEAD_ROW}>
                {["Partner", "Period compared", "Partner report", "MIR booked", "Variance $", "Variance %", "Client lines", "Need a look", "Report used"].map((h, i) => (
                  <th key={h} className={`${TH} ${i < 2 || i === 8 ? "pr-3 text-left" : "pl-3 text-right"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.partners.map((p) => (
                <tr key={p.partner} className={ROW}>
                  <td className={CELL}>{p.partner}</td>
                  <td className={MUTED_CELL}>{p.period}</td>
                  <td className={NUM}>{money(p.report)}</td>
                  <td className={NUM}>{money(p.mir)}</td>
                  <td className={`${NUM} ${varClass(p.report - p.mir)}`}>{money(p.report - p.mir)}</td>
                  <td className={`${NUM} ${varClass(p.report - p.mir)}`}>{pct(variancePct(p.report, p.mir))}</td>
                  <td className={NUM}>{p.lines}</td>
                  <td className={NUM}>{p.flagged}</td>
                  <td className="py-2 pl-3 text-left text-xs text-muted-foreground">{p.reportUsed}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className={TOTAL_ROW}>
                <td className="py-2 text-left" colSpan={2}>Total</td>
                <td className={TOTAL_NUM}>{money(tot.report)}</td>
                <td className={TOTAL_NUM}>{money(tot.mir)}</td>
                <td className={TOTAL_NUM}>{money(tot.report - tot.mir)}</td>
                <td className={TOTAL_NUM}>{pct(variancePct(tot.report, tot.mir))}</td>
                <td className={TOTAL_NUM}>{tot.lines}</td>
                <td className={TOTAL_NUM}>{tot.flagged}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {tot.lines - tot.flagged} of {tot.lines} partner × client lines tie to MIR; {tot.flagged} need a look.
        </p>
      </ChartCard>

      <ChartCard title="Findings worth a look" icon={Lightbulb}>
        <ul className="list-disc space-y-1 pl-5 text-sm text-foreground">
          {data.findings.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      </ChartCard>

      <ChartCard title={showAll ? "All clients (year-to-date)" : "Need a look (year-to-date)"} subtitle="Click a client to see it month by month" icon={Search}>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="flex border border-gray-300">
            {["All", ...data.partners.map((p) => p.partner)].map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPartner(p)}
                className={`px-3 py-1.5 text-xs font-medium ${partner === p ? "bg-gray-900 text-white" : "text-foreground hover:bg-gray-100"}`}
              >
                {p}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Show clients that tie too
          </label>
          <span className="text-xs text-muted-foreground">{lines.length} client lines</span>
        </div>
        <div className="max-h-[560px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card">
              <tr className={HEAD_ROW}>
                {["Partner", "MIR client", "Partner report", "MIR booked", "Variance $", "Variance %", "Status", "What it looks like"].map((h, i) => (
                  <th key={h} className={`${TH} ${i < 2 || i > 5 ? "pr-3 text-left" : "pl-3 text-right"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lines.map((x) => {
                const k = keyOf(x);
                const v = x.partnerAmt - x.mirAmt;
                return (
                  <Fragment key={k}>
                    <tr className={`${ROW} cursor-pointer hover:bg-gray-50`} onClick={() => setOpen(open === k ? null : k)}>
                      <td className={MUTED_CELL}>{x.partner}{x.channel ? ` · ${x.channel}` : ""}</td>
                      <td className={CELL}>
                        {x.client.replace("[not matched] ", "")}
                        {x.partnerRaw && x.partnerRaw !== x.client && <span className="block text-[11px] text-muted-foreground">report: {x.partnerRaw}</span>}
                      </td>
                      <td className={NUM}>{money(x.partnerAmt)}</td>
                      <td className={NUM}>{money(x.mirAmt)}</td>
                      <td className={`${NUM} ${varClass(v)}`}>{money(v)}</td>
                      <td className={`${NUM} ${varClass(v)}`}>{pct(variancePct(x.partnerAmt, x.mirAmt))}</td>
                      <td className="py-2 pr-3 text-left text-xs text-foreground">{x.status}</td>
                      <td className="py-2 pr-3 text-left text-xs text-muted-foreground">{isMatch(x.status) ? "" : explain(x)}</td>
                    </tr>
                    {open === k && (
                      <tr className="bg-gray-50">
                        <td colSpan={8} className="px-3 py-2">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-muted-foreground">
                                <th className="py-1 text-left font-medium">Month</th>
                                <th className="py-1 text-right font-medium">Partner report</th>
                                <th className="py-1 text-right font-medium">MIR booked</th>
                                <th className="py-1 text-right font-medium">Variance $</th>
                                <th className="py-1 text-right font-medium">Variance %</th>
                                <th className="py-1 pl-3 text-left font-medium">Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {months(x).map((m) => (
                                <tr key={m.month} className="border-t border-border/60">
                                  <td className="py-1 text-left">{m.month}</td>
                                  <td className="py-1 text-right tabular-nums">
                                    {money(m.partnerAmt)}
                                    {m.usd ? <span className="text-muted-foreground"> (US${Math.round(m.usd).toLocaleString("en-CA")})</span> : null}
                                  </td>
                                  <td className="py-1 text-right tabular-nums">{money(m.mirAmt)}</td>
                                  <td className={`py-1 text-right tabular-nums ${varClass(m.partnerAmt - m.mirAmt)}`}>{money(m.partnerAmt - m.mirAmt)}</td>
                                  <td className={`py-1 text-right tabular-nums ${varClass(m.partnerAmt - m.mirAmt)}`}>{pct(variancePct(m.partnerAmt, m.mirAmt))}</td>
                                  <td className="py-1 pl-3 text-left">{m.status}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </ChartCard>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard title="How it works" icon={ListChecks}>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-foreground">
            {data.method.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ol>
        </ChartCard>
        <ChartCard title="Not done yet, and why" icon={CircleSlash}>
          <ul className="list-disc space-y-1 pl-5 text-sm text-foreground">
            {data.notDone.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </ChartCard>
      </div>

      <details className="border border-border bg-card p-4">
        <summary className="cursor-pointer text-sm font-semibold text-foreground">
          Client name mapping ({data.mapping.filter((m) => m.method === "Manual").length} decided by hand,{" "}
          {data.mapping.filter((m) => !m.mir).length} not matched)
        </summary>
        <div className="mt-3 max-h-[420px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card">
              <tr className={HEAD_ROW}>
                {["Partner", "Name in partner report", "MIR client", "How matched", "Why"].map((h) => (
                  <th key={h} className={`${TH} pr-3 text-left`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...data.mapping]
                .sort((a, b) => Number(!!a.mir) - Number(!!b.mir) || Number(a.method !== "Manual") - Number(b.method !== "Manual") || a.partner.localeCompare(b.partner))
                .map((m) => (
                  <tr key={`${m.partner}|${m.raw}`} className={ROW}>
                    <td className={MUTED_CELL}>{m.partner}</td>
                    <td className={CELL}>{m.raw}</td>
                    <td className={CELL}>{m.mir ?? "—"}</td>
                    <td className={MUTED_CELL}>{m.method}</td>
                    <td className="py-2 pr-3 text-left text-xs text-muted-foreground">{m.reason}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
