// Builds the comparison tabs for the "Automated MIR QA" sheet: by channel, by client, and client x month for
// 2025 and 2026 (manual NATIVE vs the automated MIR of the same day), with coloured variances and a note on
// every variance of $10k or more naming the campaigns behind it.
//
// Usage: node bq/mir_live/qa_sheet_tabs.mjs <spreadsheet id>
//   Writes into a spreadsheet the ADC credentials may edit (a staging sheet created through Drive); copy the
//   four tabs into the QA sheet from there. Before running, build the same-day automated table, e.g.
//   CALL MIR_Live.build_native('...MIR_Live_snapshots.MIR_20261027', '...MIR_Live.qa_native_20261027', '...').
//   Tab names and the AUT table below carry the pull date; change them for the next pull.
import { execSync } from "node:child_process";

const SHEET = process.argv[2];
if (!SHEET) throw new Error("usage: node bq/mir_live/qa_sheet_tabs.mjs <spreadsheet id>");
const T = execSync("gcloud auth application-default print-access-token").toString().trim();
const H = { Authorization: `Bearer ${T}`, "x-goog-user-project": "pluscoops", "Content-Type": "application/json" };
const MAN = "`plusco-media-invest-solutions.PCC_Media_Investment.PCC_Dashboard_NATIVE`";
const AUT = "`plusco-media-invest-solutions.MIR_Live.qa_native_20261027`";

async function bq(sql) {
  const r = await (await fetch("https://bigquery.googleapis.com/bigquery/v2/projects/plusco-media-invest-solutions/queries", {
    method: "POST", headers: H, body: JSON.stringify({ query: sql, useLegacySql: false, location: "northamerica-northeast1", maxResults: 100000, timeoutMs: 120000 }) })).json();
  if (r.error) throw new Error(r.error.message);
  const names = r.schema.fields.map(f => f.name);
  return (r.rows || []).map(row => Object.fromEntries(row.f.map((c, i) => [names[i], c.v])));
}
async function sheets(path, method, body) {
  const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET}${path}`, { method, headers: H, body: body && JSON.stringify(body) });
  const j = await r.json();
  if (j.error) throw new Error(JSON.stringify(j.error).slice(0, 500));
  return j;
}
const num = v => (v === null || v === undefined ? 0 : Math.round(Number(v)));

// ---------- data ----------
const channel = await bq(`
WITH m AS (SELECT PLUSCO_YEAR y, IFNULL(NULLIF(PLUSCO_MEDIA_CHANNEL,''),'(no channel)') k, SUM(NET_ORDERED_CAD) cad FROM ${MAN} GROUP BY 1,2),
a AS (SELECT PLUSCO_YEAR y, IFNULL(NULLIF(PLUSCO_MEDIA_CHANNEL,''),'(no channel)') k, SUM(NET_ORDERED_CAD) cad FROM ${AUT} WHERE PLUSCO_YEAR IN ('2025','2026') GROUP BY 1,2)
SELECT y, k, IFNULL(m.cad,0) man, IFNULL(a.cad,0) aut FROM m FULL JOIN a USING (y,k) ORDER BY y, GREATEST(ABS(IFNULL(m.cad,0)),ABS(IFNULL(a.cad,0))) DESC`);

const client = await bq(`
WITH m AS (SELECT PLUSCO_YEAR y, IFNULL(NULLIF(PLUSCO_CLIENT_NAME,''),'(not mapped)') k, ANY_VALUE(AGENCY) ag,
  SUM(NET_ORDERED_CAD) cad, SUM(IF(MONTH='2025-12' AND MEDIA_CODE IN ('N','R','T'), NET_ORDERED_CAD, 0)) dec FROM ${MAN} GROUP BY 1,2),
a AS (SELECT PLUSCO_YEAR y, IFNULL(NULLIF(PLUSCO_CLIENT_NAME,''),'(not mapped)') k, ANY_VALUE(AGENCY) ag,
  SUM(NET_ORDERED_CAD) cad, SUM(IF(MONTH='2025-12' AND MEDIA_CODE IN ('N','R','T'), NET_ORDERED_CAD, 0)) dec FROM ${AUT} WHERE PLUSCO_YEAR IN ('2025','2026') GROUP BY 1,2)
SELECT y, k, COALESCE(NULLIF(m.ag,'#N/A'), a.ag) ag, IFNULL(m.cad,0) man, IFNULL(a.cad,0) aut, IFNULL(a.dec,0)-IFNULL(m.dec,0) dec_diff
FROM m FULL JOIN a USING (y,k) ORDER BY y, GREATEST(ABS(IFNULL(m.cad,0)),ABS(IFNULL(a.cad,0))) DESC`);

const monthly = await bq(`
WITH m AS (SELECT PLUSCO_YEAR y, IFNULL(NULLIF(PLUSCO_CLIENT_NAME,''),'(not mapped)') k, CAST(SUBSTR(MONTH,6,2) AS INT64) mo, SUM(NET_ORDERED_CAD) cad FROM ${MAN} GROUP BY 1,2,3),
a AS (SELECT PLUSCO_YEAR y, IFNULL(NULLIF(PLUSCO_CLIENT_NAME,''),'(not mapped)') k, CAST(SUBSTR(MONTH,6,2) AS INT64) mo, SUM(NET_ORDERED_CAD) cad FROM ${AUT} WHERE PLUSCO_YEAR IN ('2025','2026') GROUP BY 1,2,3)
SELECT y, k, mo, IFNULL(m.cad,0) man, IFNULL(a.cad,0) aut FROM m FULL JOIN a USING (y,k,mo)`);

// Campaign-level differences, to explain large variances in cell notes.
const PULL_DAY = "2026-10-27"; // the day the manual MIR was pulled
const lines = await bq(`
WITH m AS (SELECT PLUSCO_YEAR y, IFNULL(NULLIF(PLUSCO_CLIENT_NAME,''),'(not mapped)') k, CAST(SUBSTR(MONTH,6,2) AS INT64) mo, MCPE, ANY_VALUE(ESTIMATE) est,
  ANY_VALUE(MEDIA_CODE) mc, SUM(NET_ORDERED_CAD) cad, SUM(NET_ORDERED) nat FROM ${MAN} GROUP BY 1,2,3,4),
a AS (SELECT PLUSCO_YEAR y, IFNULL(NULLIF(PLUSCO_CLIENT_NAME,''),'(not mapped)') k, CAST(SUBSTR(MONTH,6,2) AS INT64) mo, MCPE, ANY_VALUE(ESTIMATE) est,
  ANY_VALUE(MEDIA_CODE) mc, SUM(NET_ORDERED_CAD) cad, SUM(NET_ORDERED) nat
  FROM ${AUT} WHERE PLUSCO_YEAR IN ('2025','2026') GROUP BY 1,2,3,4),
-- Spots on the days between the yearly broadcast pulls (Dec 29-31, 2025 and Dec 28-31, 2026).
edge AS (
  SELECT CONCAT(IF(media_code = 'N', 'T', media_code), '-', client_code, '-', product_code, '-', estimate_code) MCPE,
    CAST(EXTRACT(YEAR FROM spot_date) AS STRING) y, EXTRACT(MONTH FROM spot_date) mo, SUM(ordered_net) edge
  FROM \`plusco-media-invest-solutions.MIR_Live.spot_history\`
  WHERE spot_date BETWEEN '2025-12-29' AND '2025-12-31' OR spot_date BETWEEN '2026-12-28' AND '2026-12-31'
  GROUP BY 1, 2, 3),
-- Campaigns edited in MediaOcean on the day of the manual pull.
edited AS (
  SELECT DISTINCT CONCAT(media_code, '-', advertiser_code, '-', product_code, '-', estimate_code) MCPE
  FROM \`mediaocean-data.mo_raw_prisma.placements\` WHERE CAST(placement_modification_date AS STRING) LIKE '${PULL_DAY}%'),
edited_spot AS (
  SELECT DISTINCT IF(media_code = 'N', 'T', media_code) mc, client_code, estimate_code
  FROM \`mediaocean-data.mo_raw_spot.spot_buyline\` WHERE CAST(last_activity_date AS STRING) LIKE '${PULL_DAY}%'),
-- Campaigns present in MediaOcean's daily copy at all.
in_raw AS (
  SELECT DISTINCT CONCAT(IF(media_code = 'N', 'T', media_code), '-', client_code, '-', product_code, '-', estimate_code) MCPE
  FROM \`plusco-media-invest-solutions.MIR_Live.spot_history\`
  UNION DISTINCT
  SELECT DISTINCT CONCAT(media_code, '-', advertiser_code, '-', product_code, '-', estimate_code) FROM \`mediaocean-data.mo_raw_prisma.placements\`)
SELECT y, k, mo, MCPE, COALESCE(m.est, a.est) est, COALESCE(m.mc, a.mc) mc, IFNULL(m.cad,0) man, IFNULL(a.cad,0) aut,
  IFNULL(a.nat,0) - IFNULL(m.nat,0) nat_diff, IFNULL(e.edge, 0) edge,
  COLLATE(MCPE, '') IN (SELECT COLLATE(MCPE, '') FROM edited) OR EXISTS (SELECT 1 FROM edited_spot s WHERE s.mc = SUBSTR(MCPE, 1, 1)
    AND s.client_code = SPLIT(MCPE, '-')[SAFE_OFFSET(1)] AND s.estimate_code = SPLIT(MCPE, '-')[SAFE_OFFSET(3)]) edited,
  COLLATE(MCPE, '') IN (SELECT COLLATE(MCPE, '') FROM in_raw) in_raw
FROM m FULL JOIN a USING (y,k,mo,MCPE)
LEFT JOIN edge e USING (MCPE, y, mo)
WHERE ABS(IFNULL(a.cad,0)-IFNULL(m.cad,0)) >= 1`);
const usd = v => (v < 0 ? "-$" : "$") + Math.abs(Math.round(v)).toLocaleString("en-US");
// Campaign's difference over the whole year, to spot amounts that only moved between months.
const yearDiff = {};
for (const r of lines) yearDiff[`${r.y}|${r.k}|${r.MCPE}`] = (yearDiff[`${r.y}|${r.k}|${r.MCPE}`] || 0) + num(r.aut) - num(r.man);
const isTrue = v => v === true || v === "true";
const SPOT = new Set(["N", "R", "T"]);
// Each campaign gets one cause, checked in this order:
//   edge    spots dated on the days between the yearly broadcast pulls (the manual MIR leaves them out)
//   edited  campaign edited in MediaOcean on the day of the pull (MediaOcean's daily copy is taken overnight,
//           so the automated MIR of that day does not have the edit yet)
//   shift   same yearly total, spread over the months differently
//   missing in the manual MIR but not in MediaOcean's daily copy at all
//   rounding spot campaign off by less than 0.5 % (per-spot rounding of the client's net)
//   check   anything else
function cause(c, isMonth) {
  const d = c.aut - c.man, dn = c.natDiff;
  if (c.edge !== 0 && Math.abs(c.edge) >= 0.5 * Math.abs(dn) && Math.sign(c.edge) === Math.sign(dn)) return "edge";
  if (c.edited) return "edited";
  if (isMonth && Math.abs(yearDiff[`${c.y}|${c.k}|${c.MCPE}`] || 0) < 0.05 * Math.abs(d)) return "shift";
  if (c.aut === 0 && !c.inRaw) return "missing";
  if (SPOT.has(c.mc) && c.man !== 0 && Math.abs(d) < 0.005 * Math.abs(c.man)) return "rounding";
  return "check";
}
const CAUSE_TEXT = {
  edge: "spots dated Dec 29-31, 2025 or Dec 28-31, 2026",
  shift: "same yearly total, split differently between months",
  edited: "edited in MediaOcean on the day of the manual pull",
  missing: "not in MediaOcean's daily data feed",
  rounding: "small spot difference (under 0.5%)",
  check: "to check",
};
const WHY_TEXT = {
  edge: "Dec 29-31, 2025 / Dec 28-31, 2026: the manual MIR's yearly Spot pulls follow broadcast years, so spots on those days fall between two pulls. The automated MIR keeps them in December (calendar month). NO ACTION NEEDED: the automated MIR is correct.",
  shift: "Month split: the campaign total is the same; MediaOcean's report and the automated MIR spread it over the months differently. NO ACTION NEEDED for totals.",
  edited: "Edited on the pull day: MediaOcean's daily copy is taken overnight, so the automated MIR of Oct 27 does not have edits made that day, while the manual pull may. FIXES ITSELF: both sides will have these edits at the next comparison.",
  missing: "Not in the data feed: the buy is in MediaOcean but not in the daily copy the automated MIR reads. WAITING ON YVES (asked MediaOcean about the extract).",
  rounding: "Small spot differences (under 0.5% of the campaign): cause not confirmed yet, most likely rounding of the client net per spot. NO ACTION NEEDED: too small to matter.",
  check: "To check: often order-level charges such as sponsorships, which are not on the spot lines. WAITING ON YVES (order file).",
};
function explain(rowsForCell, total, isMonth) {
  // One entry per campaign (a full-year cell has one line per month).
  const byMcpe = {};
  for (const r of rowsForCell) {
    const c = (byMcpe[r.MCPE] ||= { MCPE: r.MCPE, est: r.est, mc: r.mc, y: r.y, k: r.k, man: 0, aut: 0, natDiff: 0, edge: 0, edited: false, inRaw: false });
    c.man += num(r.man); c.aut += num(r.aut); c.natDiff += num(r.nat_diff); c.edge += num(r.edge);
    c.edited ||= isTrue(r.edited); c.inRaw ||= isTrue(r.in_raw);
  }
  const all = Object.values(byMcpe).sort((a, b) => Math.abs(b.aut - b.man) - Math.abs(a.aut - a.man));
  const sums = {};
  for (const c of all) { c.cause = cause(c, isMonth); sums[c.cause] = (sums[c.cause] || 0) + c.aut - c.man; }
  const out = [`Variance ${usd(total)}.`];
  const order = Object.keys(sums).sort((a, b) => Math.abs(sums[b]) - Math.abs(sums[a])).filter(k => Math.abs(sums[k]) >= 100);
  if (order.length) out.push("By cause: " + order.map(k => `${CAUSE_TEXT[k]} ${usd(sums[k])}`).join("; ") + ".");
  out.push("Largest campaigns:");
  for (const c of all.slice(0, 4).filter(c => Math.abs(c.aut - c.man) >= 100)) {
    const d = c.aut - c.man;
    const amounts = c.man === 0 ? `only in the automated MIR (${usd(c.aut)})`
      : c.aut === 0 ? `only in the manual MIR (${usd(c.man)})`
      : `manual ${usd(c.man)}, automated ${usd(c.aut)} (${d > 0 ? "+" : ""}${usd(d)})`;
    out.push(`- ${c.MCPE} ${c.est || ""}: ${amounts}. ${CAUSE_TEXT[c.cause][0].toUpperCase() + CAUSE_TEXT[c.cause].slice(1)}`);
  }
  for (const k of order) out.push(WHY_TEXT[k]);
  return out.join("\n");
}
const linesBy = {};
for (const r of lines) (linesBy[`${r.y}|${r.k}|${r.mo}`] ||= []).push(r);
const linesByYear = {};
for (const r of lines) (linesByYear[`${r.y}|${r.k}`] ||= []).push(r);
const notes = []; // {tab, row, col, text}

// ---------- tabs ----------
const meta = await sheets("?fields=sheets.properties(sheetId,title,index)", "GET");
const byTitle = Object.fromEntries(meta.sheets.map(s => [s.properties.title, s.properties.sheetId]));
const TABS = ["Oct 27: by channel", "Oct 27: by client", "Oct 27: clients by month 2025", "Oct 27: clients by month 2026"];
const add = [];
TABS.forEach((t, i) => { if (byTitle[t] === undefined) add.push({ addSheet: { properties: { title: t, index: i, gridProperties: { rowCount: 400, columnCount: 45, frozenRowCount: 4 } } } }); });
if (add.length) {
  const r = await sheets(":batchUpdate", "POST", { requests: add });
  r.replies.forEach(rep => { byTitle[rep.addSheet.properties.title] = rep.addSheet.properties.sheetId; });
}
// Clear previous content/formatting/rules on these tabs (re-runnable).
const clear = [];
for (const t of TABS) {
  const id = byTitle[t];
  clear.push({ updateCells: { range: { sheetId: id }, fields: "userEnteredValue,userEnteredFormat,note" } });
  clear.push({ unmergeCells: { range: { sheetId: id } } });
}
await sheets(":batchUpdate", "POST", { requests: clear });
const rules = await sheets("?fields=sheets(properties.sheetId,conditionalFormats)", "GET");
const delRules = [];
for (const s of rules.sheets) if (TABS.some(t => byTitle[t] === s.properties.sheetId))
  for (let i = (s.conditionalFormats || []).length - 1; i >= 0; i--) delRules.push({ deleteConditionalFormatRule: { sheetId: s.properties.sheetId, index: i } });
if (delRules.length) await sheets(":batchUpdate", "POST", { requests: delRules });

const LEGEND = "Variance = Automated minus Manual.   Green: under $1,000   Orange: under $10,000   Red: $10,000 or more";
const values = {};
const fmt = [];
const bands = (id, ranges) => [
  ["=AND(ISNUMBER(INDIRECT(\"RC\",FALSE)),ABS(INDIRECT(\"RC\",FALSE))<1000)", { red: 0.71, green: 0.88, blue: 0.62 }],
  ["=AND(ISNUMBER(INDIRECT(\"RC\",FALSE)),ABS(INDIRECT(\"RC\",FALSE))<10000)", { red: 0.98, green: 0.74, blue: 0.45 }],
  ["=AND(ISNUMBER(INDIRECT(\"RC\",FALSE)),ABS(INDIRECT(\"RC\",FALSE))>=10000)", { red: 0.95, green: 0.5, blue: 0.47 }],
].map(([f, c], i) => ({ addConditionalFormatRule: { index: i, rule: { ranges, booleanRule: { condition: { type: "CUSTOM_FORMULA", values: [{ userEnteredValue: f }] }, format: { backgroundColorStyle: { rgbColor: c } } } } } }));
const money = (id, r0, r1, c0, c1) => ({ repeatCell: { range: { sheetId: id, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 }, cell: { userEnteredFormat: { numberFormat: { type: "CURRENCY", pattern: "$#,##0;-$#,##0;$0" } } }, fields: "userEnteredFormat.numberFormat" } });
const bold = (id, r0, r1, c0, c1, extra = {}) => ({ repeatCell: { range: { sheetId: id, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 }, cell: { userEnteredFormat: { textFormat: { bold: true }, ...extra } }, fields: "userEnteredFormat.textFormat.bold" + (extra.backgroundColorStyle ? ",userEnteredFormat.backgroundColorStyle" : "") + (extra.horizontalAlignment ? ",userEnteredFormat.horizontalAlignment" : "") } });
const grey = { backgroundColorStyle: { rgbColor: { red: 0.93, green: 0.93, blue: 0.93 } } };
const width = (id, c0, c1, px) => ({ updateDimensionProperties: { range: { sheetId: id, dimension: "COLUMNS", startIndex: c0, endIndex: c1 }, properties: { pixelSize: px }, fields: "pixelSize" } });
const status = d => (Math.abs(d) < 1000 ? "Match" : Math.abs(d) < 10000 ? "Under $10k" : "$10k or more");

// --- by channel ---
{
  const id = byTitle[TABS[0]];
  const note = (y, k) => k === "(no channel)" ? "Network TV the automated MIR has not split by network yet (mostly BRP US on the USA N group station). Waiting on Yves (order file)"
    : k === "N/A" ? "Horizon TV Network (BRP US): the manual MIR tags it N/A; part of it is still unsplit in the automated MIR (see no channel). Waiting on Yves (order file)"
    : (y === "2025" && (k === "TV" || k === "Radio")) ? "Includes spots dated Dec 29-31, 2025, which the manual MIR leaves out. No action needed" : "";
  const rows = [["Manual MIR (pulled Oct 27) vs automated MIR (same day), by channel"], [LEGEND], [], ["Year", "Channel", "Manual MIR", "Automated MIR", "Variance", "Variance %", "Status", "Why"]];
  let lastY = null;
  for (const r of channel) {
    if (lastY && r.y !== lastY) rows.push([]);
    lastY = r.y;
    const d = num(r.aut) - num(r.man);
    rows.push([r.y, r.k, num(r.man), num(r.aut), d, num(r.man) ? d / Math.abs(num(r.man)) : "", status(d), note(r.y, r.k)]);
  }
  for (const y of ["2025", "2026"]) {
    const s = channel.filter(r => r.y === y), m = s.reduce((a, r) => a + num(r.man), 0), a = s.reduce((x, r) => x + num(r.aut), 0);
    rows.push([y, "TOTAL", m, a, a - m, (a - m) / m, status(a - m), ""]);
  }
  values[TABS[0]] = rows;
  fmt.push(money(id, 4, rows.length, 2, 5),
    { repeatCell: { range: { sheetId: id, startRowIndex: 4, endRowIndex: rows.length, startColumnIndex: 5, endColumnIndex: 6 }, cell: { userEnteredFormat: { numberFormat: { type: "PERCENT", pattern: "0.00%" } } }, fields: "userEnteredFormat.numberFormat" } },
    bold(id, 0, 1, 0, 1), bold(id, 3, 4, 0, 8, grey), bold(id, rows.length - 2, rows.length, 0, 8),
    width(id, 0, 1, 60), width(id, 1, 2, 150), width(id, 2, 7, 120), width(id, 7, 8, 520), ...bands(id, [{ sheetId: id, startRowIndex: 4, endRowIndex: rows.length, startColumnIndex: 4, endColumnIndex: 5 }]));
}

// --- by client ---
{
  const id = byTitle[TABS[1]];
  const rows = [["Manual MIR (pulled Oct 27) vs automated MIR (same day), by client"], [LEGEND], [], ["Year", "Client", "Agency", "Manual MIR", "Automated MIR", "Variance", "Variance %", "Status", "Why"]];
  let lastY = null;
  for (const r of client) {
    if (lastY && r.y !== lastY) rows.push([]);
    lastY = r.y;
    const d = num(r.aut) - num(r.man), dec = num(r.dec_diff);
    const why = r.y === "2025" && Math.abs(d) >= 1000 && Math.abs(dec) >= 0.5 * Math.abs(d) ? `Mostly spots dated Dec 29-31, 2025 (${dec >= 0 ? "+" : "-"}${Math.abs(dec).toLocaleString("en-US")}). No action needed` : "";
    rows.push([r.y, r.k, r.ag || "", num(r.man), num(r.aut), d, num(r.man) ? d / Math.abs(num(r.man)) : "", status(d), why]);
    if (Math.abs(d) >= 10000) notes.push({ tab: 1, row: rows.length - 1, col: 5, text: explain([...(linesByYear[r.y + "|" + r.k] || [])], d) });
  }
  values[TABS[1]] = rows;
  fmt.push(money(id, 4, rows.length, 3, 6),
    { repeatCell: { range: { sheetId: id, startRowIndex: 4, endRowIndex: rows.length, startColumnIndex: 6, endColumnIndex: 7 }, cell: { userEnteredFormat: { numberFormat: { type: "PERCENT", pattern: "0.00%" } } }, fields: "userEnteredFormat.numberFormat" } },
    bold(id, 0, 1, 0, 1), bold(id, 3, 4, 0, 9, grey),
    width(id, 0, 1, 60), width(id, 1, 2, 300), width(id, 2, 3, 130), width(id, 3, 8, 115), width(id, 8, 9, 330),
    { setBasicFilter: { filter: { range: { sheetId: id, startRowIndex: 3, endRowIndex: rows.length, startColumnIndex: 0, endColumnIndex: 9 } } } },
    ...bands(id, [{ sheetId: id, startRowIndex: 4, endRowIndex: rows.length, startColumnIndex: 5, endColumnIndex: 6 }]));
}

// --- clients by month ---
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Full year"];
for (const [ti, y] of [[2, "2025"], [3, "2026"]]) {
  const id = byTitle[TABS[ti]];
  const data = {};
  for (const r of monthly.filter(r => r.y === y)) {
    const c = (data[r.k] ||= { man: Array(13).fill(0), aut: Array(13).fill(0) });
    c.man[+r.mo - 1] += num(r.man); c.aut[+r.mo - 1] += num(r.aut); c.man[12] += num(r.man); c.aut[12] += num(r.aut);
  }
  const clients = Object.keys(data).sort((a, b) => Math.max(Math.abs(data[b].man[12]), Math.abs(data[b].aut[12])) - Math.max(Math.abs(data[a].man[12]), Math.abs(data[a].aut[12])));
  const head1 = ["Client"], head2 = [""];
  MONTHS.forEach(m => { head1.push(m, "", ""); head2.push("Manual", "Automated", "Variance"); });
  const rows = [[`${y}: manual MIR (pulled Oct 27) vs automated MIR (same day), by client and month`], [LEGEND + "   (empty = no spend on either side)"], head1, head2];
  const tot = { man: Array(13).fill(0), aut: Array(13).fill(0) };
  for (const k of clients) {
    const c = data[k], row = [k], rowIndex = rows.length;
    for (let i = 0; i < 13; i++) {
      tot.man[i] += c.man[i]; tot.aut[i] += c.aut[i];
      if (c.man[i] === 0 && c.aut[i] === 0) row.push("", "", ""); else row.push(c.man[i], c.aut[i], c.aut[i] - c.man[i]);
      const v = c.aut[i] - c.man[i];
      if (Math.abs(v) >= 10000) notes.push({ tab: ti, row: rowIndex, col: 1 + i * 3 + 2,
        text: explain([...((i === 12 ? linesByYear[y + "|" + k] : linesBy[y + "|" + k + "|" + (i + 1)]) || [])], v, i !== 12) });
    }
    rows.push(row);
  }
  const trow = ["TOTAL"];
  for (let i = 0; i < 13; i++) trow.push(tot.man[i], tot.aut[i], tot.aut[i] - tot.man[i]);
  rows.push(trow);
  values[TABS[ti]] = rows;
  const n = rows.length, varRanges = [];
  for (let i = 0; i < 13; i++) {
    const c = 1 + i * 3;
    fmt.push({ mergeCells: { range: { sheetId: id, startRowIndex: 2, endRowIndex: 3, startColumnIndex: c, endColumnIndex: c + 3 }, mergeType: "MERGE_ALL" } });
    fmt.push({ updateBorders: { range: { sheetId: id, startRowIndex: 2, endRowIndex: n, startColumnIndex: c, endColumnIndex: c + 1 }, left: { style: "SOLID", width: 2, colorStyle: { rgbColor: { red: 0.4, green: 0.4, blue: 0.4 } } } } });
    varRanges.push({ sheetId: id, startRowIndex: 4, endRowIndex: n, startColumnIndex: c + 2, endColumnIndex: c + 3 });
  }
  fmt.push(money(id, 4, n, 1, 40), bold(id, 0, 1, 0, 1), bold(id, 2, 4, 0, 40, { ...grey, horizontalAlignment: "CENTER" }), bold(id, n - 1, n, 0, 40),
    width(id, 0, 1, 260), width(id, 1, 40, 92),
    { updateSheetProperties: { properties: { sheetId: id, gridProperties: { frozenRowCount: 4, frozenColumnCount: 1 } }, fields: "gridProperties.frozenRowCount,gridProperties.frozenColumnCount" } },
    ...bands(id, varRanges));
}

// ---------- write ----------
await sheets("/values:batchUpdate", "POST", { valueInputOption: "RAW", data: Object.entries(values).map(([t, v]) => ({ range: `'${t}'!A1`, values: v })) });
await sheets(":batchUpdate", "POST", { requests: fmt });
const noteReqs = notes.map(n => ({ updateCells: { range: { sheetId: byTitle[TABS[n.tab]], startRowIndex: n.row, endRowIndex: n.row + 1, startColumnIndex: n.col, endColumnIndex: n.col + 1 }, rows: [{ values: [{ note: n.text }] }], fields: "note" } }));
for (let i = 0; i < noteReqs.length; i += 400) await sheets(":batchUpdate", "POST", { requests: noteReqs.slice(i, i + 400) });
console.log("notes:", notes.length);
// Year-level summary of causes (every campaign x month).
for (const y of ["2025", "2026"]) {
  const tot = {};
  for (const r of lines.filter(r => r.y === y)) { const c = { MCPE: r.MCPE, mc: r.mc, y: r.y, k: r.k, man: num(r.man), aut: num(r.aut), natDiff: num(r.nat_diff), edge: num(r.edge), edited: isTrue(r.edited), inRaw: isTrue(r.in_raw) }; const k = cause(c, true); (tot[k] ||= { n: 0, net: 0, abs: 0 }); tot[k].n++; tot[k].net += c.aut - c.man; tot[k].abs += Math.abs(c.aut - c.man); }
  console.log("SUMMARY " + y + " " + JSON.stringify(Object.fromEntries(Object.entries(tot).map(([k, v]) => [k, { cells: v.n, net: Math.round(v.net), abs: Math.round(v.abs) }]))));
}
for (const t of [] ) for (const n of notes.filter(n => n.tab === t).slice(0, 3)) console.log("--- tab " + t + " row " + n.row + " col " + n.col + "\n" + n.text);
console.log(Object.entries(values).map(([t, v]) => `${t}: ${v.length} rows`).join("\n"));
