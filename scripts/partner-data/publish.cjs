/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS helper scripts (see README.md) */
// Publish the partner-vs-MIR comparison (out_detail.json, from compare.cjs) to
// Firestore partner_data/demo for Exec KPI → Partner Data. Uses the Firebase
// CLI login token (REST), same as the other one-off admin writes.
const fs = require("fs");
const os = require("os");

const d = JSON.parse(fs.readFileSync("out_detail.json", "utf8"));
const NAME = { QUANTCAST: "Quantcast", AMAZON: "Amazon", BILLUPS: "Billups" };
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const r0 = (v) => Math.round(v * 100) / 100;
const isMatch = (s) => s.startsWith("Matches");
const sheetId = fs.readFileSync("sheet_id.txt", "utf8").trim();

const partners = Object.keys(d.WINDOW).map((p) => {
  const y = d.ytd.filter((x) => x.partner === p);
  const w = d.WINDOW[p];
  return {
    partner: NAME[p],
    period: `${MON[+w.from.slice(5) - 1]}–${MON[+w.current.slice(5) - 2]} 2026`,
    reportUsed: w.asOf,
    report: r0(y.reduce((t, x) => t + x.partnerAmt, 0)),
    mir: r0(y.reduce((t, x) => t + x.mirAmt, 0)),
    lines: y.length,
    flagged: y.filter((x) => !isMatch(x.status)).length,
  };
});

const doc = {
  generatedAt: new Date().toISOString(),
  mirSource: d.source,
  sheetUrl: `https://docs.google.com/spreadsheets/d/${sheetId}/edit`,
  fx: d.FX,
  partners,
  findings: [
    "Quantcast / BCLC: MIR has a $75,000 March booking Quantcast never billed ($295,169 booked vs $220,169 billed) — almost all of BCLC's −$74,989 (−8.5%) Jan–Sep.",
    "Billups / GreenShield: Billups reports $113,888 for GreenShield; MIR has exactly $113,888 of Billups booked with no client name — a booking missing its client.",
    "Amazon / BRP: Amazon reports $47,447 delivered Jan–Sep vs $334,158 booked in MIR (−$286,711, −86%) — booked but not delivered, or delivered under another client name.",
    "Timing, not error: the last month of each report is still billing and is left out of the year-to-date check (e.g. PlayOJO's Amazon spend ties to the dollar Jan–Sep; its October is reported by Amazon but not yet booked in MIR).",
  ],
  method: [
    "Read each partner's latest monthly spend report (shared 'Spend Reports from Partners 2026' folder) into partner × client × month × CAD (Billups also by channel: OOH / Print).",
    "Matched the partner's client names to MIR clients: exact, same name spelled differently, or by hand with a reason (e.g. Betty Casino = Excelsior Works Ltd, LASIK MD = The Vision Group — identical amounts).",
    `Compared with Mediaocean booked net (${d.source}: PCC_Dashboard_NATIVE, NET_ORDERED_CAD) through each report's last complete month; flagged when off by more than $1,000 and more than 1%, year-to-date per client. The still-billing last month is shown month by month but not flagged.`,
    `Quantcast: 'Billing Amount' (ties MIR to the cent), Jan–Sep; USD at ${d.FX}, MIR's own rate. Amazon: delivered months Jan–Sep. Billups: Revenue by insertion month, Jan–Jun (report dated Aug 4), production lines kept.`,
  ],
  notDone: [
    "Index and Magnite (SSPs): spend runs through the DSPs / MIQ, not a direct MIR booking — next: compare with the DSP exports' spend by exchange.",
    "MIQ: binary Excel (.xlsb) + PDF summary, no client × month table — needs a regular Excel export.",
    "Reddit: the file is a Salesforce booked/weighted forecast in USD, not actual spend. StackAdapt: no access. Yahoo: folder empty.",
    "The other 24 deal partners (all Volume partners, Corus, Quebecor, Netflix, iHeart, SiriusXM, AIM…): no example report — Adriana to request a standard monthly report.",
    "Spend by publisher (DSP / MIQ / Billups reports) and the Forecaster / MediaBox comparisons: not in this demo. Not automated yet: a snapshot of the reports compared on Nov 26.",
  ],
  ytd: d.ytd.map((x) => ({
    partner: NAME[x.partner], channel: x.channel, client: x.client, partnerRaw: x.partnerRaw,
    partnerAmt: r0(x.partnerAmt), mirAmt: r0(x.mirAmt), status: x.status, monthsOff: x.monthsOff, months: x.months,
  })),
  detail: d.detail.map((x) => ({
    partner: NAME[x.partner], channel: x.channel, client: x.client, month: x.month,
    partnerAmt: r0(x.partnerAmt), mirAmt: r0(x.mirAmt), status: x.status, usd: x.usd ? r0(x.usd) : null,
  })),
  mapping: d.mapping.map((x) => ({ partner: NAME[x.partner], raw: x.raw, mir: x.mir ?? null, method: x.method, reason: x.reason, total: r0(x.total) })),
};

// JSON → Firestore REST value.
const val = (v) => {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === "string") return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(val) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, val(x)])) } };
};

(async () => {
  const size = Buffer.byteLength(JSON.stringify(doc));
  console.log("doc bytes", size, "ytd", doc.ytd.length, "detail", doc.detail.length, "mapping", doc.mapping.length);
  if (size > 900_000) throw new Error("Document too large for Firestore");
  const T = JSON.parse(fs.readFileSync(os.homedir() + "/.config/configstore/firebase-tools.json", "utf8")).tokens.access_token;
  const r = await fetch("https://firestore.googleapis.com/v1/projects/pluscoops/databases/(default)/documents/partner_data/demo", {
    method: "PATCH",
    headers: { Authorization: "Bearer " + T, "Content-Type": "application/json" },
    body: JSON.stringify({ fields: val(doc).mapValue.fields }),
  });
  console.log("status", r.status, r.status !== 200 ? (await r.text()).slice(0, 300) : "");
})();
