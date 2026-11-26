/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS helper scripts (see README.md) */
// Partner report vs MIR: client mapping + month-by-month comparison.
const fs = require("fs");
const { quantcast, amazon, billups, FX } = require("./parse.cjs");

const mir = JSON.parse(fs.readFileSync("in/mir.json", "utf8"));
const MIR_CLIENTS = JSON.parse(fs.readFileSync("in/mir_clients.json", "utf8"));

// Which months are compared, per report (later months are booked / not yet reported).
const WINDOW = {
  QUANTCAST: { from: "2026-01", to: "2026-10", current: "2026-10", asOf: "October 2026 report (billing through Oct)" },
  AMAZON: { from: "2026-01", to: "2026-10", current: "2026-10", asOf: "October 2026 report (delivered through Nov 11)" },
  BILLUPS: { from: "2026-01", to: "2026-07", current: "2026-07", asOf: "Report as of Aug 4, 2026" },
};

// Names that differ between the partner report and MIR, decided by hand (reason kept for the mapping tab).
const MANUAL = {
  "betty casino": ["Excelsior Works Ltd", "Same monthly amounts; Betty Casino is Excelsior Works' brand"],
  "lasik md": ["The Vision Group", "Same amounts ($100,854); LASIK MD is a Vision Group brand"],
  "revenu quebec": ["GOVT QC - MINISTÈRES ET ORGANISMES", "MIR rolls Quebec ministries into this client"],
  "exo (reseau de transport metropolitain)": ["GOVT QC - MINISTÈRES ET ORGANISMES", "Revenu Québec + EXO = MIR's $32,500"],
  "loto-quebec": ["GOVT QC - LOTO QC", "Loto-Québec"],
  "loto québec loteries": ["GOVT QC - LOTO QC", "Loto-Québec brand line"],
  "hydro-quebec": ["GOVT QC - HYDRO-QUEBEC", "Hydro-Québec"],
  "cspq - msp": ["GOVT QC - MINISTÈRES ET ORGANISMES", "Quebec ministry"],
  "saaq": ["GOVT QC - MINISTÈRES ET ORGANISMES", "Quebec agency (MIR groups SAAQ here)"],
  "olg": ["Ontario Lottery and Gaming Corporation (OLG)", "OLG"],
  "ontario lottery and gaming corporation": ["Ontario Lottery and Gaming Corporation (OLG)", "OLG"],
  "camh": ["CAMH Foundation", "CAMH"],
  "centre for addiction and mental health": ["CAMH Foundation", "CAMH"],
  "keg brands inc": ["KEG Restaurants", "The Keg"],
  "yeti authorized": ["YETI", "YETI"],
  "sleeman breweries": ["Sleeman", "Sleeman"],
  "cbcra": ["Canadian Breverage Container Recycling Association (CBCRA)", "CBCRA"],
  "canadian beverage container recycling association": ["Canadian Breverage Container Recycling Association (CBCRA)", "CBCRA (MIR spells it 'Breverage')"],
  "koodo mobile canada": ["Koodo", "Koodo"],
  "vision group": ["The Vision Group", "The Vision Group"],
  "reliance home comfort": ["Reliance", "Reliance"],
  "go rving": ["Go RVing Canada", "Go RVing"],
  "alberta gaming liquor & cannabis": ["Alberta Gaming Liquor and Cannabis Commission", "AGLC"],
  "world vision": ["World Vision Canada", "World Vision"],
  "société en commandite airbus canada": ["Airbus", "Airbus Canada"],
  "medcan health management inc": ["Medcan", "Medcan"],
  "industrielle alliance, assurance auto et habitation inc": ["INDUSTRIELLE ALLIANCE ASSURANCE ET SERVICES FINANCIERS INC.", "iA Financial"],
  "nesto": ["NESTO INC", "Nesto"],
  "post consumer brands": ["Post Consumer Brand", "Post"],
  "toyota canada inc": ["Toyota", "Toyota"],
  "ca - novo nordisk canada inc": ["Novo Nordisk", "Novo Nordisk Canada"],
  "global x": ["GLOBAL X INVESTMENTS CANADA INC", "Global X"],
  "coast capital savings credit union": ["Coast Capital Savings Federal Credit Union (CCS)", "Coast Capital"],
  "nature conservancy of canada": ["Nature Conservancy of Canada (NCC)", "NCC"],
  "bota bota spa": ["Bota Bota", "Bota Bota"],
  "cozey inc.": ["Cozey", "Cozey"],
  "aglc": ["Alberta Gaming Liquor and Cannabis Commission", "AGLC"],
  "tudor watch": ["Rolex", "Tudor is a Rolex brand; MIR books it under Rolex"],
  "hilo": ["GOVT QC - HYDRO-QUEBEC", "Hilo is a Hydro-Québec subsidiary"],
  "gdq - mamh": ["GOVT QC - MINISTÈRES ET ORGANISMES", "MAMH is a Quebec ministry"],
  "kingston pen tours": ["St Lawrence Parks Commission", "Same amount ($40,360); a St Lawrence Parks attraction"],
  "edgewell": ["Edgewell Brands", "Edgewell"],
  "vetoquinol s.a.": ["Vetoquinol", "Vetoquinol"],
};

const strip = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(inc|ltd|ltee|corp|corporation|limited|co|the|canada|ca)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const byExact = new Map(MIR_CLIENTS.map((n) => [n.trim().toLowerCase(), n]));
const byNorm = new Map();
for (const n of MIR_CLIENTS) if (strip(n)) byNorm.set(strip(n), n);

function mapClient(raw) {
  const k = raw.trim().toLowerCase();
  if (MANUAL[k]) return { mir: MANUAL[k][0], method: "Manual", reason: MANUAL[k][1] };
  if (byExact.has(k)) return { mir: byExact.get(k), method: "Exact", reason: "" };
  const s = strip(raw);
  if (s && byNorm.has(s)) return { mir: byNorm.get(s), method: "Same name, different spelling", reason: "" };
  return { mir: null, method: "Not matched", reason: "No MIR client with this name — needs a decision" };
}

const near = (a, b) => Math.abs(a - b) <= Math.max(1000, 0.01 * Math.max(Math.abs(a), Math.abs(b)));

async function main() {
  const partnerRows = [...(await quantcast()), ...(await amazon()), ...(await billups())];
  const mapping = new Map(); // partner|raw -> mapping + totals
  const cells = new Map(); // partner|channel|client|month -> {partnerAmt, mirAmt}
  const key = (p, ch, c, m) => `${p}\u0000${ch}\u0000${c}\u0000${m}`;
  const cell = (p, ch, c, m) => {
    const k = key(p, ch, c, m);
    if (!cells.has(k)) cells.set(k, { partner: p, channel: ch, client: c, month: m, partnerAmt: 0, mirAmt: 0, partnerRaw: new Set(), usd: 0 });
    return cells.get(k);
  };
  const inWindow = (p, m) => m >= WINDOW[p].from && m <= WINDOW[p].to;

  for (const r of partnerRows) {
    const mk = `${r.partner}\u0000${r.clientRaw}`;
    if (!mapping.has(mk)) mapping.set(mk, { partner: r.partner, raw: r.clientRaw, ...mapClient(r.clientRaw), total: 0, inWindow: 0 });
    const mp = mapping.get(mk);
    mp.total += r.amountCad;
    if (!inWindow(r.partner, r.month)) continue;
    mp.inWindow += r.amountCad;
    const ch = r.partner === "BILLUPS" ? r.channel : "";
    const c = cell(r.partner, ch, mp.mir ?? `[not matched] ${r.clientRaw}`, r.month);
    c.partnerAmt += r.amountCad;
    c.partnerRaw.add(r.clientRaw);
    if (r.currency === "USD") c.usd += r.amountOrig;
  }
  // Billups' report covers Cossette, Jungle and Plus Company Media / K72 — not Mekanism.
  const excluded = { BILLUPS_MEKANISM: 0 };
  for (const r of mir.rows) {
    if (!inWindow(r.partner, r.month)) continue;
    const ch = r.partner === "BILLUPS" ? r.channel : "";
    cell(r.partner, ch, r.client ?? "(no client name in MIR)", r.month).mirAmt += r.net;
  }

  const detail = [...cells.values()].map((c) => {
    const w = WINDOW[c.partner];
    const d = c.partnerAmt - c.mirAmt;
    let status;
    if (c.client.startsWith("[not matched]")) status = "Name not matched";
    else if (near(c.partnerAmt, c.mirAmt)) status = "Matches";
    else if (Math.abs(c.partnerAmt) < 1) status = "In MIR, not in partner report";
    else if (Math.abs(c.mirAmt) < 1) status = "In partner report, not in MIR";
    else status = "Variance";
    const timing = c.month === w.current && status !== "Matches" && status !== "Name not matched";
    return {
      ...c,
      partnerRaw: [...c.partnerRaw].join(", "),
      diff: d,
      pct: c.mirAmt ? d / Math.abs(c.mirAmt) : null,
      status: timing ? `${status} (last month in report — may still be billing)` : status,
      flagged: !["Matches"].includes(status) && !timing,
    };
  });
  detail.sort((a, b) => a.partner.localeCompare(b.partner) || a.client.localeCompare(b.client) || a.channel.localeCompare(b.channel) || a.month.localeCompare(b.month));

  // Year-to-date per partner x client (x channel for Billups): month timing differences cancel out.
  const ytdMap = new Map();
  // Through the last complete month only: the report's last month is still
  // billing (e.g. PlayOJO's whole Amazon gap was October, not yet in MIR), so it
  // stays in the monthly detail but not in the year-to-date flags.
  for (const c of detail) {
    if (c.month >= WINDOW[c.partner].current) continue;
    const k = `${c.partner}\u0000${c.channel}\u0000${c.client}`;
    if (!ytdMap.has(k)) ytdMap.set(k, { partner: c.partner, channel: c.channel, client: c.client, partnerRaw: new Set(), partnerAmt: 0, mirAmt: 0, months: 0, monthsOff: 0 });
    const y = ytdMap.get(k);
    y.partnerAmt += c.partnerAmt;
    y.mirAmt += c.mirAmt;
    y.months += 1;
    if (c.status !== "Matches") y.monthsOff += 1;
    for (const r of c.partnerRaw.split(", ").filter(Boolean)) y.partnerRaw.add(r);
  }
  const ytd = [...ytdMap.values()].map((y) => {
    const d = y.partnerAmt - y.mirAmt;
    let status;
    if (y.client.startsWith("[not matched]")) status = "Name not matched";
    else if (near(y.partnerAmt, y.mirAmt)) status = y.monthsOff ? "Matches year-to-date (months differ — timing)" : "Matches";
    else if (Math.abs(y.partnerAmt) < 1) status = "In MIR, not in partner report";
    else if (Math.abs(y.mirAmt) < 1) status = "In partner report, not in MIR";
    else status = "Variance";
    return { ...y, partnerRaw: [...y.partnerRaw].join(", "), diff: d, pct: y.mirAmt ? d / Math.abs(y.mirAmt) : null, status };
  });
  ytd.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  fs.writeFileSync("out_detail.json", JSON.stringify({ detail, ytd, mapping: [...mapping.values()], WINDOW, FX, source: mir.source, excluded }, null, 0));
  for (const p of Object.keys(WINDOW)) {
    const y = ytd.filter((x) => x.partner === p);
    const st = {};
    for (const x of y) st[x.status] = (st[x.status] || 0) + 1;
    console.log("YTD", p, st);
    console.log("  top:", y.filter((x) => !x.status.startsWith("Matches")).slice(0, 8).map((x) => `${x.client}${x.channel ? "/" + x.channel : ""} ${Math.round(x.partnerAmt)} vs ${Math.round(x.mirAmt)} (${x.status})`).join(" ; "));
  }
  console.log("Excluded Billups Mekanism MIR:", Math.round(excluded.BILLUPS_MEKANISM));

  // Console summary
  for (const p of Object.keys(WINDOW)) {
    const d = detail.filter((x) => x.partner === p);
    const tot = (f) => Math.round(d.reduce((t, x) => t + x[f], 0));
    const st = {};
    for (const x of d) st[x.status.split(" (")[0]] = (st[x.status.split(" (")[0]] || 0) + 1;
    console.log(p, "partner", tot("partnerAmt"), "MIR", tot("mirAmt"), st);
  }
  console.log("Not matched:", [...mapping.values()].filter((m) => !m.mir).map((m) => `${m.partner}:${m.raw}=${Math.round(m.inWindow)}`).join(" ; "));
}
main();
