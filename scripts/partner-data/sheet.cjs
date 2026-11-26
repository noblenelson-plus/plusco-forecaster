/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS helper scripts (see README.md) */
// Build the demo workbook (Summary / Flagged / Monthly detail / Client mapping / Notes) and upload it as a Google Sheet.
const fs = require("fs");
const ExcelJS = require("exceljs");
const { GoogleAuth } = require("google-auth-library");

const d = JSON.parse(fs.readFileSync("out_detail.json", "utf8"));
const P = ["QUANTCAST", "AMAZON", "BILLUPS"];
const NAME = { QUANTCAST: "Quantcast", AMAZON: "Amazon", BILLUPS: "Billups" };
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const per = (p) => `${MON[+d.WINDOW[p].from.slice(5) - 1]}–${MON[+d.WINDOW[p].to.slice(5) - 1]} 2026`;
const MONEY = '"$"#,##0;[Red]-"$"#,##0';
const PCT = '+0.0%;[Red]-0.0%';
const isMatch = (s) => s.startsWith("Matches");

function explain(x) {
  if (x.status === "Name not matched") return "Client name in the report doesn't match any MIR client — needs a mapping decision";
  if (x.status === "In MIR, not in partner report") return "Booked in MIR, but the partner reports nothing for this client";
  if (x.status === "In partner report, not in MIR") return "Partner reports spend we have no MIR booking for";
  if (x.diff < 0) return "MIR booked more than the partner reports";
  return "Partner reports more than MIR booked";
}

const wb = new ExcelJS.Workbook();
const head = (ws, row) => {
  const r = ws.addRow(row);
  r.font = { bold: true, color: { argb: "FFFFFFFF" } };
  r.eachCell((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF000000" } }));
  return r;
};

// ── Summary ────────────────────────────────────────────────────────────────
const s = wb.addWorksheet("Summary");
s.columns = [{ width: 34 }, { width: 18 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 11 }, { width: 14 }, { width: 14 }, { width: 58 }];
s.addRow(["Partner spend vs Mediaocean (MIR) — demo, 3 partners"]).font = { bold: true, size: 14 };
s.addRow([`What we did: read each partner's own monthly spend report, matched its clients to MIR clients, and compared it with what we booked in Mediaocean (${d.source}), client by client.`]);
const tot = { r: 0, m: 0, flagged: 0, lines: 0, ok: 0 };
const rows = P.map((p) => {
  const y = d.ytd.filter((x) => x.partner === p);
  const r = y.reduce((t, x) => t + x.partnerAmt, 0);
  const m = y.reduce((t, x) => t + x.mirAmt, 0);
  const fl = y.filter((x) => !isMatch(x.status));
  tot.r += r; tot.m += m; tot.flagged += fl.length; tot.lines += y.length; tot.ok += y.length - fl.length;
  return { p, r, m, y, fl };
});
s.addRow([]);
s.addRow([
  `Bottom line: ${tot.ok} of ${tot.lines} partner × client lines tie to MIR; ${tot.flagged} need a look (below). The check works — each finding is either a real gap, a timing difference or a client-name issue we fix once.`,
]).font = { bold: true };
s.addRow([]);
head(s, ["Partner", "Period compared", "Partner report", "MIR booked", "Variance $", "Variance %", "Client lines", "Need a look", "Report used"]);
for (const x of rows) {
  const r = s.addRow([NAME[x.p], per(x.p), x.r, x.m, x.r - x.m, x.m ? (x.r - x.m) / x.m : null, x.y.length, x.fl.length, d.WINDOW[x.p].asOf]);
  [3, 4, 5].forEach((c) => (r.getCell(c).numFmt = MONEY));
  r.getCell(6).numFmt = PCT;
}
const tr = s.addRow(["Total", "", tot.r, tot.m, tot.r - tot.m, (tot.r - tot.m) / tot.m, tot.lines, tot.flagged, ""]);
tr.font = { bold: true };
[3, 4, 5].forEach((c) => (tr.getCell(c).numFmt = MONEY));
tr.getCell(6).numFmt = PCT;

s.addRow([]);
s.addRow(["Biggest gaps (year-to-date, by client)"]).font = { bold: true, size: 12 };
head(s, ["Client", "Partner", "Partner report", "MIR booked", "Variance $", "Variance %", "", "", "What it looks like"]);
const top = d.ytd.filter((x) => !isMatch(x.status)).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff)).slice(0, 12);
for (const x of top) {
  const r = s.addRow([
    x.client.replace("[not matched] ", "") + (x.channel ? ` (${x.channel})` : ""), NAME[x.partner], x.partnerAmt, x.mirAmt, x.diff, x.pct, "", "", explain(x),
  ]);
  [3, 4, 5].forEach((c) => (r.getCell(c).numFmt = MONEY));
  r.getCell(6).numFmt = PCT;
}
s.addRow([]);
s.addRow(["Findings worth a look"]).font = { bold: true, size: 12 };
for (const t of [
  "• Quantcast / BCLC: MIR has a $75,000 March booking Quantcast never billed ($295,169 booked vs $220,169 billed) — almost all of BCLC's −$74,989 (−7.7%).",
  "• Billups / GreenShield: Billups reports $113,888 for GreenShield; MIR has exactly $113,888 of Billups booked with no client name — a booking missing its client.",
  "• Amazon / PlayOJO: Amazon delivered $2.42M Jan–Oct vs $2.08M booked (+16%), consistent with PlayOJO over-delivering its Amazon bookings.",
]) s.addRow([t]);
s.addRow([]);
s.addRow(["Notes: 1) Variance = partner report − MIR; flagged when off by more than $1,000 and more than 1%. 2) Year-to-date per client so month-timing differences cancel out; monthly view on 'Monthly detail'. 3) See 'Notes' for what was and wasn't done, and why."]).font = { italic: true, color: { argb: "FF555555" } };
s.views = [{ state: "frozen", ySplit: 0 }];

// ── Need a look (YTD) ──────────────────────────────────────────────────────
const f = wb.addWorksheet("Need a look");
f.columns = [{ width: 12 }, { width: 44 }, { width: 9 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 11 }, { width: 34 }, { width: 14 }, { width: 58 }, { width: 44 }];
head(f, ["Partner", "MIR client", "Channel", "Partner report", "MIR booked", "Variance $", "Variance %", "Status", "Months off", "What it looks like", "Name(s) in partner report"]);
for (const x of d.ytd.filter((y) => !isMatch(y.status)).sort((a, b) => a.partner.localeCompare(b.partner) || Math.abs(b.diff) - Math.abs(a.diff))) {
  const r = f.addRow([NAME[x.partner], x.client, x.channel, x.partnerAmt, x.mirAmt, x.diff, x.pct, x.status, `${x.monthsOff} of ${x.months}`, explain(x), x.partnerRaw]);
  [4, 5, 6].forEach((c) => (r.getCell(c).numFmt = MONEY));
  r.getCell(7).numFmt = PCT;
}
f.views = [{ state: "frozen", ySplit: 1 }];
f.autoFilter = { from: "A1", to: "K1" };

// ── All clients (YTD) ──────────────────────────────────────────────────────
const a = wb.addWorksheet("All clients (YTD)");
a.columns = [{ width: 12 }, { width: 44 }, { width: 9 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 11 }, { width: 40 }];
head(a, ["Partner", "MIR client", "Channel", "Partner report", "MIR booked", "Variance $", "Variance %", "Status"]);
for (const x of [...d.ytd].sort((p, q) => p.partner.localeCompare(q.partner) || q.mirAmt - p.mirAmt)) {
  const r = a.addRow([NAME[x.partner], x.client, x.channel, x.partnerAmt, x.mirAmt, x.diff, x.pct, x.status]);
  [4, 5, 6].forEach((c) => (r.getCell(c).numFmt = MONEY));
  r.getCell(7).numFmt = PCT;
}
a.views = [{ state: "frozen", ySplit: 1 }];
a.autoFilter = { from: "A1", to: "H1" };

// ── Monthly detail ─────────────────────────────────────────────────────────
const m = wb.addWorksheet("Monthly detail");
m.columns = [{ width: 12 }, { width: 44 }, { width: 9 }, { width: 10 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 11 }, { width: 52 }, { width: 14 }];
head(m, ["Partner", "MIR client", "Channel", "Month", "Partner report", "MIR booked", "Variance $", "Variance %", "Status", "USD (original)"]);
for (const x of d.detail) {
  const r = m.addRow([NAME[x.partner], x.client, x.channel, x.month, x.partnerAmt, x.mirAmt, x.diff, x.pct, x.status, x.usd || null]);
  [5, 6, 7].forEach((c) => (r.getCell(c).numFmt = MONEY));
  r.getCell(8).numFmt = PCT;
  r.getCell(10).numFmt = '"US$"#,##0';
}
m.views = [{ state: "frozen", ySplit: 1 }];
m.autoFilter = { from: "A1", to: "J1" };

// ── Client mapping ─────────────────────────────────────────────────────────
const c = wb.addWorksheet("Client mapping");
c.columns = [{ width: 12 }, { width: 46 }, { width: 46 }, { width: 28 }, { width: 56 }, { width: 18 }];
head(c, ["Partner", "Name in partner report", "MIR client", "How matched", "Why", "Report amount (all months)"]);
const order = { "Not matched": 0, Manual: 1, "Same name, different spelling": 2, Exact: 3 };
for (const x of [...d.mapping].sort((p, q) => order[p.method] - order[q.method] || p.partner.localeCompare(q.partner) || q.total - p.total)) {
  const r = c.addRow([NAME[x.partner], x.raw, x.mir ?? "—", x.method, x.reason, x.total]);
  r.getCell(6).numFmt = MONEY;
}
c.views = [{ state: "frozen", ySplit: 1 }];
c.autoFilter = { from: "A1", to: "F1" };

// ── Notes (footnotes) ──────────────────────────────────────────────────────
const n = wb.addWorksheet("Notes");
n.columns = [{ width: 150 }];
const sec = (t) => (n.addRow([t]).font = { bold: true, size: 12 });
const line = (t) => n.addRow([t]);
sec("Partner Data — demo (November 27, 2026)");
line("Goal (Adriana's brief): partners send monthly spend reports but the data isn't always right, so we cross-check partner spend against PlusCo data and flag variances.");
line("");
sec("What we did");
line("1. Took the latest report from Quantcast (October), Amazon (October) and Billups (as of Aug 4) from the shared 'Spend Reports from Partners 2026' folder.");
line("2. Read each report automatically into one shape: partner × client × month × CAD (Billups also by channel: OOH / Print).");
line(`3. Matched the partner's client names to MIR client names: exact, same name spelled differently, or by hand with a reason (see 'Client mapping'; e.g. Betty Casino = Excelsior Works Ltd, LASIK MD = The Vision Group, proven by identical amounts).`);
line(`4. Compared with Mediaocean booked net (MIR, ${d.source}: table PCC_Dashboard_NATIVE, column NET_ORDERED_CAD, rows of that partner), for the months each report covers.`);
line("5. Flagged any client where report and MIR differ by more than $1,000 and more than 1%, year-to-date. Monthly view kept on 'Monthly detail'.");
line("");
sec("How each report is read (decisions taken from the data)");
line("• Quantcast: 'Billing Amount' (not 'Spend') — MIR matches Billing to the cent (e.g. Novo Nordisk Jan $214,000.00 billed = $214,000.00 in MIR; Spend says $214,081.04).");
line(`• Quantcast USD client (Pemco): converted at ${d.FX}, the rate MIR itself uses for every USD client in 2025 and 2026 — so currency creates no fake variance. Original USD kept on 'Monthly detail'.`);
line("• Amazon: 'Monthly by Advertiser' tab; Jan–Sep are delivered, October is delivered + booked (treated as the last, still-billing month), Nov–Dec are booked only and not compared.");
line("• Billups: 'Client report 2026' (Revenue by insertion month), compared Jan–Jul (report dated Aug 4). Uses Billups' own PLUSCO CLIENT NAME and PLUSCO CHANNEL columns; production cost lines kept in.");
line("• The last month of each report is labelled 'may still be billing' rather than flagged (e.g. York University and OLG in October).");
line("");
sec("What could not be done yet, and why");
line("• Index and Magnite (SSPs): not compared. They report gross spend that flows through the DSPs and MIQ, not a direct MIR booking (Index has no MIR line; Magnite $0.9M in MIR vs ~$0.5M/month reported). Next step: compare against the DSP exports' spend by exchange.");
line("• MIQ: report is a binary Excel file (.xlsb) plus a PDF summary with no client × month table — needs a regular Excel export from MIQ.");
line("• Reddit: the file is a Salesforce booked/weighted forecast in USD, not actual spend — needs their monthly actuals report.");
line("• StackAdapt: no access to the shared sheet. Yahoo: folder is empty.");
line("• The other 24 deal partners (all Volume partners, Corus, Quebecor, Netflix, iHeart, Sirius XM, AIM…): no example report — Adriana to request a standard monthly report (template).");
line("• Spend by publisher (DSP / MIQ / Billups reports), the other PlusCo sources in the brief, not yet included — needed for publisher partners (Media Pulse, Corus, Quebecor, Bell…).");
line("• Forecaster and MediaBox comparisons: not in this demo; same client mapping will be reused.");
line("");
sec("Open questions for Adriana");
line("1. Billups: is 'Revenue' net (comparable to MIR net ordered)? Should production lines be compared? Billups' months look like insertion months and differ from MIR months (year-to-date ties better than month by month).");
line("2. Amazon: compare delivered (what the report shows) or billed? Amazon delivered runs above MIR for some clients (e.g. PlayOJO +16%).");
line("3. The 'Name not matched' clients (Client mapping tab, top): map them, or confirm they are not ours / not in MIR.");
line("4. Threshold: is 'more than $1,000 and more than 1%' the right level for a flag?");
line("");
sec("Next steps (proposed)");
line("1. Template + request email for the partners without a usable report (Adriana sends).");
line("2. Add Index / Magnite vs DSP spend, then MIQ once we have its Excel export.");
line("3. Run this every month automatically and show it on Exec KPI → Partner Data (partner × client × month, flags, who has sent this month's report).");

wb.xlsx.writeFile("Partner_vs_MIR_demo.xlsx").then(async () => {
  const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/drive.file"] });
  const token = (await (await auth.getClient()).getAccessToken()).token;
  const boundary = "partnerdemo" + Date.now();
  const meta = { name: "Partner Data demo — partner reports vs Mediaocean (2026)", mimeType: "application/vnd.google-apps.spreadsheet" };
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`),
    fs.readFileSync("Partner_vs_MIR_demo.xlsx"),
    Buffer.from(`\r\n--${boundary}--`),
  ]);
  const existing = fs.existsSync("sheet_id.txt") ? fs.readFileSync("sheet_id.txt", "utf8").trim() : null;
  const url = existing
    ? `https://www.googleapis.com/upload/drive/v3/files/${existing}?uploadType=multipart`
    : "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";
  const r = await fetch(url, {
    method: existing ? "PATCH" : "POST",
    headers: { Authorization: `Bearer ${token}`, "x-goog-user-project": "pluscoops", "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
  const j = await r.json();
  if (!j.id) return console.log("upload failed", r.status, JSON.stringify(j).slice(0, 300));
  fs.writeFileSync("sheet_id.txt", j.id);
  console.log("https://docs.google.com/spreadsheets/d/" + j.id + "/edit");
});
