// filepath: data-prep/build-finance-toolkit-data.mjs

/**
 * Finance Toolkit — build-time data prep.
 *
 *   node data-prep/build-finance-toolkit-data.mjs
 *
 * Reads the 8 Maconomy exports in data-prep/input/ (4 hours files, 4 gross
 * revenue reports), reconciles them against the totals verified in BigQuery
 * (Finance_Toolkit.maconomy_hours_detail), matches revenue clients to hours
 * clients, and writes:
 *
 *   lib/server/finance-toolkit-data.ts   aggregated, typed static data (committed)
 *   data-prep/output/match-report.csv             every client and how it matched (committed)
 *   data-prep/output/reconciliation.json          the reconciliation summary (committed)
 *
 * Row-level data (employee names, daily descriptions, individual entries) never
 * leaves this script: the app only gets client × month × role aggregates and
 * anonymous per-client headcounts.
 *
 * The script stops (exit 1) when the hours files don't reconcile to the known
 * row and hour totals, or when a revenue report's job lines don't add up to its
 * own client totals.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readCsv } from "./lib/csv.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const INPUT = join(HERE, "input");
const OUTPUT = join(HERE, "output");
const DATA_TS = join(HERE, "..", "lib", "server", "finance-toolkit-data.ts");

// ─── Known totals (BigQuery Finance_Toolkit.maconomy_hours_detail, verified) ───

const EXPECTED = {
  "Cossette Media 2025": { rows: 150065, hours: 407433.91 },
  "Cossette Media 2026": { rows: 138709, hours: 344011.44 },
  "Jungle Media": { rows: 85717, hours: 192954.64 },
  "MEK US": { rows: 8144, hours: 22942.17 },
};
const EXPECTED_TOTAL_ROWS = 382635;

// ─── Agencies ─────────────────────────────────────────────────────────────────

/** One agency per revenue report. SourceBU values map onto them (Cossette's
 *  hours come in two yearly files). K72 has revenue but no hours export. */
const AGENCIES = [
  { id: "cossette", name: "Cossette Media", currency: "CAD", hasHours: true, grr: "Cossette_Media_Gross_Revenue_Report.csv" },
  { id: "jungle", name: "Jungle Media", currency: "CAD", hasHours: true, grr: "Jungle_Media_Gross_Revenue_Report.csv" },
  { id: "mek", name: "MEK US", currency: "USD", hasHours: true, grr: "Mek_US_Gross_Revenue_Report.csv" },
  { id: "k72", name: "K72", currency: "CAD", hasHours: false, grr: "K72_Gross_Revenue_Report.csv" },
];
const SOURCE_BU_TO_AGENCY = {
  "Cossette Media 2025": "cossette",
  "Cossette Media 2026": "cossette",
  "Jungle Media": "jungle",
  "MEK US": "mek",
};
const HOURS_FILES = [
  "hours_cossette_media_2025.csv",
  "hours_cossette_media_2026.csv",
  "hours_jungle_media.csv",
  "hours_mek_us.csv",
];

/** Revenue reports cover Jan–Aug of this year. */
const REVENUE_YEAR = 2026;
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/**
 * House accounts: the agencies' own Maconomy clients, where time off and
 * internal work are booked. They are overhead, not clients, and are kept out of
 * profitability and the calculator's comparables. Matched on client number so
 * the list is auditable.
 */
const INTERNAL_CLIENT_NAMES = [
  "Cossette Media Inc.",
  "Plus Company Ignition Inc.",
  "Inter-Business Units",
  "Cossette Communication Inc.",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const round2 = (n) => Math.round(n * 100) / 100;

/** Maconomy work code → time class. 15xx = absences (vacation, holidays,
 *  sick…), 16xx = internal (admin, training, new business…). */
function timeClass(workCodeNumber) {
  const n = Number(workCodeNumber);
  if (n >= 1500 && n < 1600) return 2; // time off
  if (n >= 1600 && n < 1700) return 1; // internal
  return 0; // client work
}

/** "Senior Media Buyer / Acheteur média sénior" → "Senior Media Buyer". */
function roleLabel(raw) {
  const s = (raw || "").trim();
  if (!s) return "Unassigned";
  return s.split(" / ")[0].trim();
}

/** "1,234" → 1234, "(3,306)" → −3306, "" → 0. */
function parseMoney(raw) {
  const s = (raw || "").trim();
  if (!s) return 0;
  const neg = /^\(.*\)$/.test(s) || s.startsWith("-");
  const n = Number(s.replace(/[(),$\s-]/g, ""));
  if (!Number.isFinite(n)) throw new Error(`Unparseable amount: ${raw}`);
  return neg ? -n : n;
}

/** Name normalization for the fallback match: case, accents, punctuation and
 *  legal suffixes don't matter. Exact on the result — no fuzzy matching. */
function normalizeName(name) {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/&/g, " AND ")
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\b(INC|INCORPORATED|LTD|LTEE|LIMITED|LIMITEE|CORP|CORPORATION|CO|COMPANY|LLC|LP|SEC|SENC|THE)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** "NAME, WITH COMMA | 216379" → { name, number }. */
function splitNameNumber(field) {
  const i = field.lastIndexOf(" | ");
  if (i < 0) return { name: field.trim(), number: "" };
  return { name: field.slice(0, i).trim(), number: field.slice(i + 3).trim() };
}

// ─── 1. Hours ────────────────────────────────────────────────────────────────

const months = []; // "YYYY-MM", filled from the data then sorted
const monthIndex = new Map();
const roles = [];
const roleIndex = new Map();
const clientKeyIndex = new Map(); // `${agencyId}|${clientNumber}` → index in clients
const clients = [];
const employees = new Map(); // EmployeeNumber → anonymous index

/** fact key → [hours, costBase1, costEnterprise, billed] */
const facts = new Map();
/** `${client}|${month}` → Set(employee index) — client-work headcount */
const staff = new Map();
/** `${employee}|${month}` → { total, client } — for the FTE capacity check */
const employeeMonth = new Map();

const recon = {};
const rowsByCurrency = {};

function idx(map, list, key, make = (k) => k) {
  let i = map.get(key);
  if (i === undefined) {
    i = list.length;
    list.push(make(key));
    map.set(key, i);
  }
  return i;
}

/** Dense 0-based id for a key (the map's size at first sight). */
function denseId(map, key) {
  let i = map.get(key);
  if (i === undefined) {
    i = map.size;
    map.set(key, i);
  }
  return i;
}

const rawMonths = new Set();
const pending = []; // rows buffered as compact tuples until months are known

for (const file of HOURS_FILES) {
  await readCsv(join(INPUT, file), (r) => {
    const bu = r.SourceBU;
    const agencyId = SOURCE_BU_TO_AGENCY[bu];
    if (!agencyId) throw new Error(`${file}: unknown SourceBU "${bu}"`);
    const hours = Number(r.NumberRegistered);
    const billed = Number(r.Billing_Price_Selection);
    const c1 = Number(r.CostPriceReg_Base1);
    const ce = Number(r.CostPriceReg_Enterprise);
    if (![hours, billed, c1, ce].every(Number.isFinite)) {
      throw new Error(`${file}: non-numeric amount on job ${r.JobNumber}`);
    }
    const date = r.Entry_Date_Selection;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`${file}: bad date "${date}"`);
    const month = date.slice(0, 7);
    rawMonths.add(month);

    const rc = (recon[bu] ??= { rows: 0, hours: 0, costBase1: 0, costEnterprise: 0, billed: 0, minDate: date, maxDate: date });
    rc.rows++;
    rc.hours += hours;
    rc.costBase1 += c1;
    rc.costEnterprise += ce;
    rc.billed += billed;
    if (date < rc.minDate) rc.minDate = date;
    if (date > rc.maxDate) rc.maxDate = date;
    const curKey = `${bu}|${r.JobCurrency}|${r.CompanyCurrency}`;
    rowsByCurrency[curKey] = (rowsByCurrency[curKey] ?? 0) + 1;

    const clientKey = `${agencyId}|${r.ClientNumber}`;
    const ci = idx(clientKeyIndex, clients, clientKey, () => ({
      agencyId,
      number: r.ClientNumber,
      name: r.ClientName.trim(),
      internal: INTERNAL_CLIENT_NAMES.includes(r.ClientName.trim()),
    }));
    const ri = idx(roleIndex, roles, roleLabel(r.EmployeeCategoryName));
    const ei = denseId(employees, r.EmployeeNumber);
    pending.push([ci, month, ri, timeClass(r.WorkCodeNumber), hours, c1, ce, billed, ei]);
  });
}

// Reconcile before anything else.
let reconOk = true;
let totalRows = 0;
const reconLines = [];
for (const [bu, exp] of Object.entries(EXPECTED)) {
  const got = recon[bu] ?? { rows: 0, hours: 0 };
  totalRows += got.rows;
  const hoursOk = Math.abs(round2(got.hours) - exp.hours) < 0.005;
  const rowsOk = got.rows === exp.rows;
  if (!hoursOk || !rowsOk) reconOk = false;
  reconLines.push(
    `${rowsOk && hoursOk ? "OK " : "BAD"}  ${bu.padEnd(20)} rows ${String(got.rows).padStart(7)} / ${exp.rows}   hours ${round2(got.hours).toFixed(2).padStart(10)} / ${exp.hours.toFixed(2)}`
  );
}
const totalOk = totalRows === EXPECTED_TOTAL_ROWS;
if (!totalOk) reconOk = false;
console.log("\nHours reconciliation (vs BigQuery Finance_Toolkit.maconomy_hours_detail)");
for (const l of reconLines) console.log("  " + l);
console.log(`  ${totalOk ? "OK " : "BAD"}  ${"Total".padEnd(20)} rows ${String(totalRows).padStart(7)} / ${EXPECTED_TOTAL_ROWS}`);
if (!reconOk) {
  console.error("\nHours do not reconcile to the known totals — stopping. Nothing was written.");
  process.exit(1);
}

months.push(...[...rawMonths].sort());
months.forEach((m, i) => monthIndex.set(m, i));

for (const [ci, month, ri, tc, hours, c1, ce, billed, ei] of pending) {
  const mi = monthIndex.get(month);
  const fk = `${ci}|${mi}|${ri}|${tc}`;
  const f = facts.get(fk) ?? [0, 0, 0, 0, 0];
  f[0] += hours;
  f[1] += c1;
  f[2] += ce;
  f[3] += billed;
  // Hours that carry a Maconomy cost amount (some employees have no cost rate on file).
  if (c1 !== 0 || ce !== 0) f[4] += hours;
  facts.set(fk, f);
  if (tc === 0 && hours > 0) {
    const sk = `${ci}|${mi}`;
    let s = staff.get(sk);
    if (!s) staff.set(sk, (s = new Set()));
    s.add(ei);
  }
  const ek = `${ei}|${mi}`;
  const em = employeeMonth.get(ek) ?? { total: 0, client: 0 };
  em.total += hours;
  // Client work = a client-work code on a real client (house accounts are overhead).
  if (tc === 0 && !clients[ci].internal) em.client += hours;
  employeeMonth.set(ek, em);
}
pending.length = 0;

// ─── 2. Gross revenue ────────────────────────────────────────────────────────

const revenueMonths = MONTH_NAMES.map((_, i) => `${REVENUE_YEAR}-${String(i + 1).padStart(2, "0")}`);
/** `${agencyId}|${number}` → { name, monthly: number[12], jobs } */
const revenue = new Map();
const grrRecon = {};

for (const agency of AGENCIES) {
  const clientTotals = new Map(); // number → monthly totals as reported by SSRS
  await readCsv(join(INPUT, agency.grr), (r) => {
    if (r.GroupByField === "Unallocated") return;
    const { name, number } = splitNameNumber(r.GroupByField);
    if (!number) throw new Error(`${agency.grr}: client without number "${r.GroupByField}"`);
    const key = `${agency.id}|${number}`;
    const entry = revenue.get(key) ?? { agencyId: agency.id, number, name, monthly: Array(12).fill(0), jobs: 0 };
    MONTH_NAMES.forEach((m, i) => {
      entry.monthly[i] += parseMoney(r[`Textbox_${m}`]);
    });
    entry.jobs++;
    revenue.set(key, entry);
    clientTotals.set(number, MONTH_NAMES.map((m) => parseMoney(r[`${m}TotalBox`])));
  });
  // Job lines must add up to the report's own client totals.
  let jobSum = 0;
  let reported = 0;
  let mismatches = 0;
  for (const [number, totals] of clientTotals) {
    const entry = revenue.get(`${agency.id}|${number}`);
    totals.forEach((t, i) => {
      const diff = entry.monthly[i] - t;
      if (Math.abs(diff) > Math.max(1.5, entry.jobs * 0.5)) {
        mismatches++;
        console.log(`    ${agency.name} ${entry.name} ${MONTH_NAMES[i]}: jobs ${entry.monthly[i]} vs total ${t} (${entry.jobs} job lines)`);
      }
    });
    jobSum += entry.monthly.reduce((a, b) => a + b, 0);
    reported += totals.reduce((a, b) => a + b, 0);
  }
  const lateMonths = revenueMonths.filter((_, i) =>
    [...clientTotals.keys()].some((n) => revenue.get(`${agency.id}|${n}`).monthly[i] !== 0) && i >= 8
  );
  grrRecon[agency.name] = {
    clients: clientTotals.size,
    jobLines: [...revenue.values()].filter((e) => e.agencyId === agency.id).reduce((a, e) => a + e.jobs, 0),
    revenue: Math.round(jobSum),
    reportedClientTotal: Math.round(reported),
    monthMismatches: mismatches,
    monthsAfterAugust: lateMonths,
  };
}

console.log("\nGross revenue reconciliation (job lines vs the report's client totals)");
let grrOk = true;
for (const [name, g] of Object.entries(grrRecon)) {
  const ok = g.monthMismatches === 0 && g.monthsAfterAugust.length === 0;
  if (!ok) grrOk = false;
  console.log(
    `  ${ok ? "OK " : "BAD"}  ${name.padEnd(16)} clients ${String(g.clients).padStart(4)}  job lines ${String(g.jobLines).padStart(5)}  revenue ${g.revenue.toLocaleString("en-CA").padStart(13)}  (report total ${g.reportedClientTotal.toLocaleString("en-CA")})`
  );
}
if (!grrOk) {
  console.error("\nGross revenue job lines don't add up to the report totals (or carry Sep–Dec values) — stopping.");
  process.exit(1);
}

// ─── 3. Client matching ──────────────────────────────────────────────────────

/** Revenue key → client index. Exact client number first, then the normalized
 *  name within the same agency. Never fuzzy. */
const revenueToClient = new Map();
const matchReport = [];

const hoursByAgencyName = new Map(); // `${agencyId}|${normalized}` → client indices
clients.forEach((c, i) => {
  const k = `${c.agencyId}|${normalizeName(c.name)}`;
  hoursByAgencyName.set(k, [...(hoursByAgencyName.get(k) ?? []), i]);
});
const hoursByNumber = new Map(); // number → [client indices across agencies]
clients.forEach((c, i) => hoursByNumber.set(c.number, [...(hoursByNumber.get(c.number) ?? []), i]));

for (const [key, rev] of revenue) {
  const total = rev.monthly.reduce((a, b) => a + b, 0);
  let ci = clientKeyIndex.get(key);
  let method = ci !== undefined ? "client number" : null;
  if (ci === undefined) {
    const byName = hoursByAgencyName.get(`${rev.agencyId}|${normalizeName(rev.name)}`) ?? [];
    if (byName.length === 1) {
      ci = byName[0];
      method = "normalized name";
    }
  }
  if (ci !== undefined && revenueToClient.has(ci)) {
    // Two revenue lines on one hours client — keep both by summing.
    const prev = revenueToClient.get(ci);
    prev.monthly = prev.monthly.map((v, i) => v + rev.monthly[i]);
    matchReport.push({ agency: rev.agencyId, side: "revenue", number: rev.number, name: rev.name, status: `matched (${method}, merged)`, revenue: total, hours: "", note: "" });
    continue;
  }
  if (ci !== undefined) {
    revenueToClient.set(ci, { monthly: [...rev.monthly], revenueName: rev.name, method });
    matchReport.push({ agency: rev.agencyId, side: "revenue", number: rev.number, name: rev.name, status: `matched (${method})`, revenue: total, hours: "", note: "" });
  } else {
    const elsewhere = (hoursByNumber.get(rev.number) ?? []).map((i) => clients[i].agencyId);
    const agency = AGENCIES.find((a) => a.id === rev.agencyId);
    const notes = [];
    if (!agency.hasHours) notes.push("agency has no hours export");
    if (elsewhere.length) {
      notes.push(`same client number has hours under ${elsewhere.map((id) => AGENCIES.find((a) => a.id === id).name).join(", ")} (not merged)`);
    }
    const note = notes.join("; ");
    // Keep it as a revenue-only client so its revenue still counts.
    const newIndex = clients.length;
    clients.push({ agencyId: rev.agencyId, number: rev.number, name: rev.name, internal: false, revenueOnly: true });
    revenueToClient.set(newIndex, { monthly: [...rev.monthly], revenueName: rev.name, method: null });
    matchReport.push({ agency: rev.agencyId, side: "revenue", number: rev.number, name: rev.name, status: "no hours match", revenue: total, hours: "", note });
  }
}

// Hours clients without revenue.
const clientHours = new Array(clients.length).fill(0);
const clientHoursInWindow = new Array(clients.length).fill(0);
const revWindow = new Set(revenueMonths.slice(0, 8).map((m) => monthIndex.get(m)));
for (const [fk, f] of facts) {
  const [ci, mi, , tc] = fk.split("|").map(Number);
  if (tc !== 0) continue;
  clientHours[ci] += f[0];
  if (revWindow.has(mi)) clientHoursInWindow[ci] += f[0];
}
const revenueAgenciesByNumber = new Map(); // number → agency ids with revenue for it
for (const r of revenue.values()) {
  revenueAgenciesByNumber.set(r.number, [...(revenueAgenciesByNumber.get(r.number) ?? []), r.agencyId]);
}
clients.forEach((c, i) => {
  if (c.revenueOnly || revenueToClient.has(i)) return;
  const notes = [];
  if (clientHoursInWindow[i] === 0) notes.push("no client hours in Jan–Aug 2026");
  const otherRevenue = (revenueAgenciesByNumber.get(c.number) ?? []).filter((id) => id !== c.agencyId);
  if (otherRevenue.length) {
    notes.push(`revenue booked under ${otherRevenue.map((id) => AGENCIES.find((a) => a.id === id).name).join(", ")} (not merged)`);
  }
  matchReport.push({
    agency: c.agencyId,
    side: "hours",
    number: c.number,
    name: c.name,
    status: c.internal ? "internal (house account)" : "no revenue match",
    revenue: "",
    hours: round2(clientHoursInWindow[i]),
    note: notes.join("; "),
  });
});

const matched = [...revenueToClient.entries()].filter(([ci]) => !clients[ci].revenueOnly);
const unmatchedRevenue = matchReport.filter((m) => m.side === "revenue" && m.status === "no hours match");
const unmatchedHours = matchReport.filter((m) => m.side === "hours" && m.status === "no revenue match");
const matchedRevenue = matched.reduce((a, [, r]) => a + r.monthly.reduce((x, y) => x + y, 0), 0);
const allRevenue = [...revenue.values()].reduce((a, r) => a + r.monthly.reduce((x, y) => x + y, 0), 0);

console.log("\nClient matching");
console.log(`  revenue clients            ${revenue.size}`);
console.log(`  matched to hours           ${matched.length}  (${matched.filter(([, r]) => r.method === "client number").length} by client number, ${matched.filter(([, r]) => r.method === "normalized name").length} by normalized name)`);
console.log(`  revenue matched            ${Math.round(matchedRevenue).toLocaleString("en-CA")} of ${Math.round(allRevenue).toLocaleString("en-CA")} (${((matchedRevenue / allRevenue) * 100).toFixed(1)}%, mixed currencies)`);
console.log(`  unmatched revenue clients  ${unmatchedRevenue.length}`);
console.log(`  unmatched hours clients    ${unmatchedHours.length}  (+ ${clients.filter((c) => c.internal).length} internal house accounts)`);

// ─── 4. FTE capacity check ───────────────────────────────────────────────────

/** Median logged hours per employee-month, over employees' "full" months
 *  (≥ 100 h logged, which skips joiners/leavers and part months). */
const fullMonths = [...employeeMonth.values()].filter((e) => e.total >= 100);
const median = (arr) => {
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const fte = {
  employeeMonths: fullMonths.length,
  medianTotalHours: round2(median(fullMonths.map((e) => e.total))),
  medianClientHours: round2(median(fullMonths.map((e) => e.client))),
};
console.log(`\nFTE check: median ${fte.medianTotalHours} h logged / ${fte.medianClientHours} h on client work per full employee-month (${fte.employeeMonths} employee-months)`);

// ─── 5. Write ────────────────────────────────────────────────────────────────

// Order clients: agency, then name — stable indices for the facts.
const order = clients.map((_, i) => i).sort((a, b) => {
  const A = clients[a];
  const B = clients[b];
  return A.agencyId.localeCompare(B.agencyId) || A.name.localeCompare(B.name) || A.number.localeCompare(B.number);
});
const newIndex = new Map(order.map((oldI, newI) => [oldI, newI]));
const agencyIdx = new Map(AGENCIES.map((a, i) => [a.id, i]));

const firstMonth = new Array(clients.length).fill(null);
const lastMonth = new Array(clients.length).fill(null);
for (const fk of facts.keys()) {
  const [ci, mi, , tc] = fk.split("|").map(Number);
  if (tc !== 0) continue;
  const f = facts.get(fk);
  if (f[0] <= 0) continue;
  if (firstMonth[ci] === null || mi < firstMonth[ci]) firstMonth[ci] = mi;
  if (lastMonth[ci] === null || mi > lastMonth[ci]) lastMonth[ci] = mi;
}

const outClients = order.map((ci) => {
  const c = clients[ci];
  const rev = revenueToClient.get(ci);
  return [
    agencyIdx.get(c.agencyId),
    c.number,
    c.name,
    c.internal ? "internal" : c.revenueOnly ? "revenue-only" : rev ? (rev.method === "client number" ? "number" : "name") : "none",
    firstMonth[ci] ?? -1,
    lastMonth[ci] ?? -1,
  ];
});

// Facts sorted by client, month, role, class — flat tuples.
const outFacts = [];
for (const [fk, f] of facts) {
  const [ci, mi, ri, tc] = fk.split("|").map(Number);
  if (f[0] === 0 && f[1] === 0 && f[2] === 0 && f[3] === 0) continue;
  outFacts.push([newIndex.get(ci), mi, ri, tc, round2(f[0]), Math.round(f[1]), Math.round(f[2]), Math.round(f[3]), round2(f[4])]);
}
outFacts.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || a[3] - b[3]);

const outRevenue = [];
for (const [ci, r] of revenueToClient) {
  r.monthly.forEach((v, i) => {
    if (v !== 0) outRevenue.push([newIndex.get(ci), i, Math.round(v)]);
  });
}
outRevenue.sort((a, b) => a[0] - b[0] || a[1] - b[1]);

// Anonymous staffing: per client × month, the indices of employees who logged
// client work. Indices are re-numbered densely; no names, numbers or emails.
const empRenum = new Map();
const outStaff = [];
for (const [sk, set] of staff) {
  const [ci, mi] = sk.split("|").map(Number);
  const ids = [...set].map((e) => denseId(empRenum, e)).sort((a, b) => a - b);
  outStaff.push([newIndex.get(ci), mi, ids]);
}
outStaff.sort((a, b) => a[0] - b[0] || a[1] - b[1]);

const reconciliation = {
  generatedAt: new Date().toISOString(),
  hours: Object.fromEntries(
    Object.entries(recon).map(([bu, r]) => [bu, {
      rows: r.rows, hours: round2(r.hours), costBase1: round2(r.costBase1), costEnterprise: round2(r.costEnterprise), billed: round2(r.billed), from: r.minDate, to: r.maxDate,
    }])
  ),
  totalRows,
  rowsByCurrency,
  grossRevenue: grrRecon,
  matching: {
    revenueClients: revenue.size,
    matched: matched.length,
    matchedByNumber: matched.filter(([, r]) => r.method === "client number").length,
    matchedByName: matched.filter(([, r]) => r.method === "normalized name").length,
    unmatchedRevenueClients: unmatchedRevenue.length,
    unmatchedHoursClients: unmatchedHours.length,
    internalHouseAccounts: clients.filter((c) => c.internal).length,
  },
  fte,
  employees: employees.size,
};

mkdirSync(OUTPUT, { recursive: true });
writeFileSync(join(OUTPUT, "reconciliation.json"), JSON.stringify(reconciliation, null, 2) + "\n");

const csvCell = (v) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const agencyName = (id) => AGENCIES.find((a) => a.id === id).name;
const reportRows = [...matchReport].sort((a, b) =>
  a.status.localeCompare(b.status) || a.agency.localeCompare(b.agency) || a.name.localeCompare(b.name)
);
writeFileSync(
  join(OUTPUT, "match-report.csv"),
  ["status,agency,side,client_number,client_name,revenue_jan_aug_2026,client_hours_jan_aug_2026,note"]
    .concat(reportRows.map((m) => [m.status, agencyName(m.agency), m.side, m.number, m.name, m.revenue === "" ? "" : Math.round(m.revenue), m.hours, m.note].map(csvCell).join(",")))
    .join("\n") + "\n"
);

const json = (v) => JSON.stringify(v);
const ts = `// filepath: lib/server/finance-toolkit-data.ts
/* eslint-disable */
// GENERATED by data-prep/build-finance-toolkit-data.mjs — do not edit by hand.
// Server-only: served to allowed viewers by app/api/finance-toolkit-data/route.ts,
// never imported by client code (it must not ship in a browser bundle).
// Source: Maconomy hours detail + gross revenue reports (Finance, Sep 2026).
// Generated ${reconciliation.generatedAt}.

import type { FinanceToolkitData } from "../finance-toolkit/finance-toolkit.types";

export const FINANCE_TOOLKIT_DATA: FinanceToolkitData = {
  generatedAt: ${json(reconciliation.generatedAt)},
  months: ${json(months)},
  revenueMonths: ${json(revenueMonths.slice(0, 8))},
  agencies: ${json(AGENCIES.map(({ id, name, currency, hasHours }) => ({ id, name, currency, hasHours })))},
  roles: ${json(roles)},
  clients: ${json(outClients)},
  facts: ${json(outFacts)},
  revenue: ${json(outRevenue)},
  staff: ${json(outStaff)},
  source: ${json({
    hoursRows: totalRows,
    employees: employees.size,
    hoursByBu: Object.fromEntries(Object.entries(recon).map(([bu, r]) => [bu, { rows: r.rows, hours: round2(r.hours), from: r.minDate, to: r.maxDate }])),
    fteMedianClientHours: fte.medianClientHours,
    fteMedianTotalHours: fte.medianTotalHours,
  })},
};
`;
mkdirSync(dirname(DATA_TS), { recursive: true });
writeFileSync(DATA_TS, ts);
console.log(`\nWrote ${DATA_TS} (${(Buffer.byteLength(ts) / 1024).toFixed(0)} KB): ${outClients.length} clients, ${outFacts.length} facts, ${outRevenue.length} revenue cells, ${outStaff.length} staffing cells`);
console.log(`Wrote ${join(OUTPUT, "match-report.csv")} and reconciliation.json`);
