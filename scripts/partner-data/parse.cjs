/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS helper scripts (see README.md) */
// Partner report readers -> normalized rows
// {partner, channel, clientRaw, month, amountOrig, currency, amountCad, basis, ...}
const ExcelJS = require("exceljs");

// MIR's USD->CAD rate: PCC_Dashboard_NATIVE NET_ORDERED_CAD / NET_ORDERED for USD clients (2025 and 2026).
const FX = 1.3978;
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const val = (c) => {
  const x = c.value;
  if (x && typeof x === "object") {
    if ("result" in x) return x.result;
    if (x.richText) return x.richText.map((r) => r.text).join("");
    if (x.text) return x.text;
  }
  return x;
};
const num = (x) => {
  if (x === null || x === undefined || x === "") return null;
  if (typeof x === "number") return x;
  let s = String(x).replace(/[$,\s]/g, "");
  if (s.startsWith("(") && s.endsWith(")")) s = "-" + s.slice(1, -1);
  if (s === "" || s === "-") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
const mm = (m) => `2026-${String(m).padStart(2, "0")}`;
async function book(f) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(f);
  return wb;
}
function rowsOf(ws) {
  const out = [];
  ws.eachRow((r) => {
    const cells = [];
    for (let c = 1; c <= ws.columnCount; c++) cells.push(val(r.getCell(c)));
    out.push(cells);
  });
  return out;
}

async function quantcast() {
  const ws = (await book("in/quantcast.xlsx")).worksheets[0];
  const out = [];
  let hdr = null;
  for (const cells of rowsOf(ws)) {
    if (!hdr) {
      if (cells.some((x) => String(x ?? "").trim() === "Office")) hdr = cells.map((x) => String(x ?? "").trim());
      continue;
    }
    const g = (k) => cells[hdr.indexOf(k)];
    const m = MONTHS.indexOf(String(g("FO_Month") ?? "").trim().toLowerCase());
    if (m < 0) continue;
    const billing = num(g("Billing Amount"));
    if (billing === null) continue;
    const cur = String(g("Currency (CAD or USD)") ?? "CAD").trim().toUpperCase();
    out.push({
      partner: "QUANTCAST", channel: "", clientRaw: String(g("Account Name")).trim(), month: mm(m + 1),
      amountOrig: billing, currency: cur, amountCad: cur === "USD" ? billing * FX : billing, basis: "Billing Amount",
      status: "Billed",
    });
  }
  return out;
}

async function amazon() {
  const ws = (await book("in/amazon.xlsx")).getWorksheet("Monthly by Advertiser");
  const out = [];
  let hdr = null;
  for (const cells of rowsOf(ws)) {
    if (!hdr) {
      if (cells.some((x) => String(x ?? "").trim() === "Client")) hdr = cells.map((x) => String(x ?? "").trim());
      continue;
    }
    const client = String(cells[hdr.indexOf("Client")] ?? "").trim();
    if (!client || /^(grand )?total/i.test(client)) continue;
    hdr.forEach((h, j) => {
      const m = h.match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s*\((.*)\)/);
      if (!m) return;
      const a = num(cells[j]);
      if (a === null) return;
      out.push({
        partner: "AMAZON", channel: "", clientRaw: client, month: mm(ABBR.indexOf(m[1]) + 1),
        amountOrig: a, currency: "CAD", amountCad: a, basis: `Investment (${m[2]})`, status: m[2],
      });
    });
  }
  return out;
}

async function billups() {
  const ws = (await book("in/billups.xlsx")).getWorksheet("Client report 2026");
  const out = [];
  let hdr = null;
  for (const cells of rowsOf(ws)) {
    if (!hdr) {
      if (String(cells[0] ?? "").trim() === "Client Name") hdr = cells.map((x) => String(x ?? "").trim());
      continue;
    }
    if (/total/i.test(String(cells[0] ?? ""))) continue;
    const g = (k) => cells[hdr.indexOf(k)];
    const pc = String(g("PLUSCO CLIENT NAME") ?? "").trim();
    const brand = String(g("Brand Name") ?? "").trim();
    const hasPc = !!pc && pc !== "#N/A" && pc !== "(blank)";
    hdr.forEach((h, j) => {
      const m = h.match(/^([A-Za-z]+)-26$/);
      if (!m) return;
      const a = num(cells[j]);
      if (a === null || a === 0) return;
      out.push({
        partner: "BILLUPS", channel: String(g("PLUSCO CHANNEL") ?? "").trim().toUpperCase(), clientRaw: hasPc ? pc : brand,
        clientBrand: brand, hasPlusCoName: hasPc, month: mm(MONTHS.indexOf(m[1].toLowerCase()) + 1),
        amountOrig: a, currency: "CAD", amountCad: a, basis: "Revenue", costType: String(g("Cost Type") ?? "").trim(),
        agency: String(g("Client Name") ?? "").trim(), status: "Insertion month",
      });
    });
  }
  return out;
}

module.exports = { quantcast, amazon, billups, FX };

if (require.main === module) {
  (async () => {
    for (const f of [quantcast, amazon, billups]) {
      const r = await f();
      const by = {};
      for (const x of r) by[x.clientRaw] = (by[x.clientRaw] || 0) + x.amountCad;
      console.log(`== ${f.name}: ${r.length} rows, total $${Math.round(r.reduce((t, x) => t + x.amountCad, 0)).toLocaleString()}`);
      const tally = (key) => {
        const o = {};
        for (const x of r) o[x[key]] = Math.round((o[x[key]] || 0) + x.amountCad);
        return o;
      };
      if (f.name === "billups") console.log("channels", tally("channel"), "\ncostTypes", tally("costType"), "\nmonths", tally("month"), "\nagency", tally("agency"));
      if (f.name === "amazon") console.log("status", tally("status"));
      console.log(Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${Math.round(v)}`).join(" ; "));
    }
  })();
}
