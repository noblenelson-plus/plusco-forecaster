// scripts/build-programmatic-preview.mjs
/**
 * Build: the Programmatic (preview) admin page — programmatic spend by DSP ×
 * client × month × publisher (Plus media partner) × local / foreign.
 *
 * Demo build (2026-11-17), run by hand. Sources:
 *   - DV360: BigQuery `Prog_DV360_BQ_Dataset.Prog_DV360_Combined` (manual upload
 *     to Jun 2026, then the plus-collect pipeline), deals mapped through
 *     `SDF_Master_File`, advertisers → clients through `SDF_Client_Mapping`.
 *     Both SDF tables are Drive-backed, so they are read with the `bq` CLI
 *     (a gcloud login with Drive scope); the main query uses ADC.
 *   - Amazon, TTD, Yahoo: the DSP exports Harshal Walambe dropped in Drive
 *     (YTD folder), downloaded into --dir:
 *       amazon_ytd.csv, ttd_updated.xlsx, yahoo_ca.xlsx, yahoo_us.xlsx
 *   - Yahoo Jan–Sep fallback: the "Yahoo Master PlusCo Prog Report" tab of the
 *     PlusCo Programmatic Spend Report template, saved as --dir/yahoo_tab.json
 *     (Sheets API values, UNFORMATTED_VALUE). The Yahoo YTD exports were cut at
 *     the 1,000,000-row limit, so a (month, advertiser) pair missing from them
 *     falls back to this tab (deal level, no publisher detail).
 *   - Partner → LOCAL / FOREIGN / HYBRID + order codes (LOC012…): the template's
 *     "PLUS CO MEDIA PARTNER_Naming Convention & Local Media Category" tab, saved
 *     as --dir/naming_tab.json.
 *   - MIR (PCC_Dashboard_NATIVE): booked DSP spend per client × month, the
 *     reference each DSP's coverage is measured against.
 *
 * Writes (only with --write): Firestore `programmatic_preview/meta` + `rows_NNN`
 * (compact rows, one JSON string each; read by the admin page). Without --write it prints the summary and saves --dir/programmatic_preview.json.
 *
 * Needs exceljs, which the app doesn't depend on: `npm i --no-save exceljs@4.4.0`.
 *
 *   node scripts/build-programmatic-preview.mjs --dir <folder> [--write]
 */

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { execFileSync } from "node:child_process";
import admin from "firebase-admin";
import bigqueryPkg from "@google-cloud/bigquery";
import { fetchRatesToCad } from "./lib/boc-fx.mjs";

const { BigQuery } = bigqueryPkg;

const BQ_PROJECT = "plusco-media-invest-solutions";
const FIREBASE_PROJECT = "pluscoops";
const COLLECTION = "programmatic_preview";
const YEAR = 2026;
const MONTHS = Array.from({ length: 11 }, (_, i) => `${YEAR}-${String(i + 1).padStart(2, "0")}`); // Jan–Nov
// Unmapped publishers keep their own name only when they are among the biggest
// per DSP; the rest roll into one "long tail" line (keeps the page light).
const RAW_PUBLISHERS_PER_DSP = 150;
const ROWS_PER_DOC = 4000;

// ─── Args ────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const argVal = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const DIR = argVal("--dir");
const WRITE = args.includes("--write");
if (!DIR) {
  console.error("Usage: node scripts/build-programmatic-preview.mjs --dir <folder> [--write]");
  process.exit(1);
}
const inDir = (f) => path.join(DIR, f);

let ExcelJS;
try {
  ExcelJS = (await import("exceljs")).default;
} catch {
  // Or point EXCELJS_DIR at a folder where exceljs is installed.
  if (process.env.EXCELJS_DIR) {
    const { createRequire } = await import("node:module");
    ExcelJS = createRequire(path.join(process.env.EXCELJS_DIR, "index.js"))("exceljs");
  }
}
if (!ExcelJS) {
  console.error("exceljs is missing: run `npm i --no-save exceljs@4.4.0` first (or set EXCELJS_DIR).");
  process.exit(1);
}

// ─── Partner mapping ─────────────────────────────────────────────────────────
/** Uppercase, accents stripped, punctuation → spaces. */
function norm(s) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9.+&]+/g, " ")
    .trim();
}

const naming = JSON.parse(fs.readFileSync(inDir("naming_tab.json"), "utf8")).values.slice(1);
/** PLUSCO_MEDIA_PARTNER → { local, code } */
const PARTNERS = new Map();
/** "LOC012" → partner */
const BY_CODE = new Map();
for (const r of naming) {
  const name = String(r[0] ?? "").trim();
  if (!name || name === "DO NOT USE") continue;
  const local = String(r[2] ?? "").trim().toUpperCase() || "UNKNOWN";
  const code = String(r[4] ?? "").trim().toUpperCase();
  PARTNERS.set(name, { local, code });
  if (/^(LOC|FOR|HYB)\d{3}$/.test(code)) BY_CODE.set(code, name);
}
const BY_NORM_NAME = new Map([...PARTNERS.keys()].map((p) => [norm(p), p]));

// Publisher names / domains / deal-name fragments → Plus media partner. Matched
// on norm()'d text. Only partners that exist in the naming tab are used.
const ALIASES = [
  [/\bYOUTUBE\b/, "GOOGLE INC"],
  [/PRIME ?VIDEO|PRIMEVIDEO|\bTWITCH\b|AMAZON PUBLISHER SERVICES|\bIMDB\b|FIRE ?TV|AMAZON OWNED|\bFREEVEE\b/, "AMAZON"],
  [/NETFLIX/, "NETFLIX"],
  [/SPOTIFY/, "SPOTIFY"],
  [/WEATHER ?NETWORK|PELMOREX|METEOMEDIA|WEATHEREYE/, "PELMOREX"],
  [/\bWEATHER\.COM\b|COM\.WEATHER\b|THE WEATHER COMPANY|^WEATHER$/, "THE WEATHER COMPANY LLC"],
  [/TORSTAR|TORONTO ?STAR|THESTAR\.COM/, "TORONTO STAR"],
  [/POSTMEDIA|NATIONALPOST|NATIONAL POST|FINANCIALPOST|TORONTOSUN|MONTREALGAZETTE|VANCOUVERSUN|OTTAWACITIZEN|CALGARYHERALD|EDMONTONJOURNAL/, "POSTMEDIA"],
  [/VILLAGE ?MEDIA|SOOTODAY|BAYTODAY|GUELPHTODAY|BARRIETODAY|TBNEWSWATCH|ORILLIAMATTERS|COLLINGWOODTODAY/, "VILLAGE MEDIA"],
  [/BELL ?MEDIA|\bCTV\b|CTVNEWS|\bCRAVE\b|\bTSN\b|\bRDS\b|NOOVO|IHEARTRADIO\.CA/, "BELL MEDIA"],
  [/CORUS|GLOBALNEWS|GLOBAL NEWS|STACKTV|HISTORIA|\bW NETWORK\b/, "CORUS"],
  [/QUEBECOR|\bTVA\b|TVANOUVELLES|JOURNALDEMONTREAL|JOURNAL DE MONTREAL|JOURNALDEQUEBEC|\bQUB\b|VIDEOTRON/, "QUEBECOR"],
  [/ROGERS|CITYTV|CITYNEWS|SPORTSNET|\bOMNI\b/, "ROGERS"],
  [/\bCBC\b|RADIO ?CANADA|ICI\.RADIO|\bGEM\b/, "CBC"],
  [/LA ?PRESSE|LAPRESSE\.CA/, "LA PRESSE"],
  [/GLOBE ?AND ?MAIL|THEGLOBEANDMAIL|\bTGAM\b/, "THE GLOBE AND MAIL"],
  [/SOFIA ?PULSE/, "SOFIA PULSE"],
  [/\bRSM\b/, "ROGERS"],
  [/SHAWMEDIA|GLOBAL TV/, "CORUS"],
  [/TVAPLUS/, "QUEBECOR"],
  [/\b(ATV|RV|BOAT|CYCLE|EQUIPMENT|TRUCK) ?TRADER\b/, "TRADER INTERACTIVE"],
  [/\bLE ?DEVOIR\b|LEDEVOIR/, "LE DEVOIR"],
  [/\bCN2I\b|LESOLEIL|LE SOLEIL|LEDROIT|LANOUVELLE|LANOUVELLISTE|LE NOUVELLISTE|LAVOIXDELEST|LEQUOTIDIEN/, "CN2I"],
  [/KIJIJI/, "KIJIJI"],
  [/AUTOTRADER|TRADER CORP/, "TRADER CORPORATION"],
  [/NARCITY|MTLBLOG/, "NARCITY"],
  [/BLACK ?PRESS/, "BLACK PRESS GROUP"],
  [/GLACIER ?MEDIA/, "GLACIER MEDIA"],
  [/ST ?JOSEPH|CHATELAINE|TORONTOLIFE|TORONTO LIFE|MACLEAN/, "ST JOSEPH MEDIA"],
  [/VERTICAL ?SCOPE/, "VERTICAL SCOPE"],
  [/VALNET/, "VALNET INC."],
  [/\bMSN\b|MICROSOFT/, "MICROSOFT"],
  [/\bESPN\b/, "ESPN"],
  [/\bNBC\b|PEACOCK/, "NBC"],
  [/DISNEY|\bHULU\b/, "DISNEY"],
  [/\bROKU\b/, "ROKU"],
  [/IHEART/, "I HEART MEDIA"],
  [/SIRIUS/, "SIRIUS XM"],
  [/\bMLB\b|MAJOR LEAGUE BASEBALL/, "MLB"],
  [/\bNHL\b/, "NHL"],
  [/BLOOMBERG/, "BLOOMBERG"],
  [/FORBES/, "FORBES MEDIA LLC"],
  [/CONDE ?NAST/, "CONDE NAST"],
  [/VOX ?MEDIA/, "VOX MEDIA"],
  [/BUZZFEED/, "BUZZFEED CANADA"],
  [/NYTIMES|NEW YORK TIMES/, "THE NY TIMES"],
  [/WEBMD/, "WEBMD"],
  [/\bTEADS\b/, "TEADS"],
  [/STINGRAY/, "STINGRAY"],
  [/TELE ?QUEBEC|TELEQUEBEC/, "TELE QUEBEC"],
  [/COGECO/, "COGECO MEDIA"],
  [/THESCORE|SCORE MEDIA/, "SCORE MEDIA & GAMING"],
  [/RICARDO/, "RICARDO"],
  [/URBANIA/, "URBANIA"],
  [/WINNIPEG ?FREE ?PRESS/, "WINNIPEG FREE PRESS"],
  [/\bTV5\b/, "TV5"],
  [/\bAPTN\b/, "APTN"],
  [/SAMSUNG/, "SAMSUNG ELECTRONICS CANADA INC"],
  [/MEREDITH/, "MEREDITH FUNDING COR"],
  [/TABOOLA/, "TABOOLA"],
  [/YAHOO/, "YAHOO"],
  // SSP-curated deals, last so a publisher named in the same deal wins. The
  // naming tab lists these SSPs as partners (HYBRID).
  [/MAGNITE|RUBICON/, "MAGNITE"],
  [/INDEX ?EXCHANGE|^INDEX\b|\bIX\b|^IX /, "INDEX"],
  [/GUMGUM/, "GUMGUM"],
  [/EQUATIV|SMART ?ADSERVER/, "EQUATIV"],
  [/NEXXEN|UNRULY/, "NEXXEN"],
].filter(([, p]) => PARTNERS.has(p));

/**
 * First Plus media partner found in the given texts (deal names first, then
 * publisher names, then domains): an order code (LOC012), an exact partner
 * name, then an alias. Returns { partner, how } or null.
 */
function matchPartner(texts) {
  const list = texts.filter(Boolean).map(String);
  for (const t of list) {
    for (const m of t.toUpperCase().matchAll(/(?:^|[^A-Z])((?:LOC|FOR|HYB)\d{3})(?!\d)/g)) {
      const p = BY_CODE.get(m[1]);
      if (p) return { partner: p, how: "order code" };
    }
  }
  for (const t of list) {
    const p = BY_NORM_NAME.get(norm(t));
    if (p) return { partner: p, how: "partner name" };
  }
  for (const t of list) {
    const n = norm(t);
    for (const [re, p] of ALIASES) if (re.test(n)) return { partner: p, how: "alias" };
  }
  return null;
}

// ─── Clients ─────────────────────────────────────────────────────────────────
const OLG = "Ontario Lottery and Gaming Corporation (OLG)";
const GOVQC = "GOVT QC - MINISTÈRES ET ORGANISMES";
// DSP advertiser name → MIR client name (PLUSCO_CLIENT_NAME). First match wins.
const CLIENT_RULES = [
  [/^BRP\b/i, "BRP"],
  [/OLG|ONTARIO LOTTERY|^(DRAW BASED GAMES|INSTANTS|PROLINE|DIGITAL CASINO|DIGITAL LOTTERY|DIGITAL SPORTS|ENTERPRISE( BRAND MARKET)?|OLG HORSE RACING|HORSE RACING|NATIONAL LOTTERY|RESPONSIBLE GAMBLING)/i, OLG],
  [/BCLC/i, "BCLC"],
  [/PLAYOJO/i, "PlayOJO"],
  [/^RONA\b/i, "RONA Inc."],
  [/WEGOVY|OZEMPIC|RYBELSUS|AWIQLI|NOVO NORDISK/i, "Novo Nordisk"],
  [/WEALTHSIMPLE/i, "Wealthsimple"],
  [/PUBLIC MOBILE/i, "PUBLIC MOBILE"],
  [/STAPLES/i, "Staples"],
  [/AUTOTRADER/i, "Autotrader.ca"],
  [/TRIDENT|DENTYNE|MENTOS|PERFETTI/i, "Perfetti Van Melle"],
  [/PURSUIT/i, "Pursuit Collection"],
  [/CAMH/i, "CAMH Foundation"],
  [/THE KEG/i, "KEG Restaurants"],
  [/BULLDOG|SCHICK|HAWAIIAN TROPIC|WILKINSON|CREMO|BANANA BOAT|BILLIE|EDGEWELL/i, "Edgewell Brands"],
  [/TUDOR|ROLEX/i, "Rolex"],
  [/RELIANCE/i, "Reliance"],
  [/MEDCAN/i, "Medcan"],
  [/LCBO/i, "LCBO"],
  [/SAPPORO|SLEEMAN/i, "Sleeman"],
  [/LITTLE CAESARS/i, "Little Caesars"],
  [/^(ATLANTIC|CENTRAL|PACIFIC|PRAIRIE|QUEBEC - PROVINCE|TCI)\b|TOYOTA/i, "Toyota"],
  [/PIERRE FABRE/i, "Pierre Fabre"],
  [/YETI/i, "YETI"],
  [/BC HYDRO/i, "BC Hydro"],
  [/IAAH/i, "INDUSTRIELLE ALLIANCE ASSURANCE ET SERVICES FINANCIERS INC."],
  [/GE APPLIANCES/i, "MC COMMERCIAL INC"],
  [/GOEASY/i, "EASYFINANCIAL SERVICES INC"],
  [/LOTO.?QUEBEC/i, "GOVT QC - LOTO QC"],
  [/TELE.?QUEBEC/i, "GOVT QC - TÉLÉ QC"],
  [/^(CSPQ|CAG)\b/i, GOVQC],
  [/WORLD VISION/i, "World Vision Canada"],
  [/POST FOODS|POST CONSUMER/i, "Post Consumer Brand"],
  [/GLOBAL X/i, "GLOBAL X INVESTMENTS CANADA INC"],
  [/ENERGIR/i, "Énergir"],
  [/BDC/i, "BDC"],
  [/ESPACE POUR LA VIE|EPLV/i, "Espace pour la vie (EPLV)"],
  [/SEPAQ/i, "Sépaq"],
  [/TOURISME CHARLEVOIX/i, "Tourisme Charlevoix (Jungle)"],
  [/NAITRE ET GRANDIR/i, "Naître et grandir"],
  [/UNIVERSITE LAVAL/i, "Université Laval"],
];
const fold = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
/** dv360Map is keyed by fold(advertiser). */
function clientFor(advertiser, dv360Map) {
  const a = String(advertiser ?? "").trim();
  if (dv360Map?.has(fold(a))) return dv360Map.get(fold(a));
  const folded = a.normalize("NFD").replace(/[̀-ͯ]/g, "");
  for (const [re, c] of CLIENT_RULES) if (re.test(folded)) return c;
  return `(unmapped) ${a || "?"}`;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
/** Excel serial / Date / "Sep-26" / "2026/01" / "07" → "YYYY-MM". */
function toMonth(v) {
  if (v instanceof Date) return v.toISOString().slice(0, 7);
  if (typeof v === "number" && v > 40000) return new Date(Date.UTC(1899, 11, 30) + v * 864e5).toISOString().slice(0, 7);
  const s = String(v ?? "").trim();
  let m;
  if ((m = s.match(/^(\d{4})[/-](\d{1,2})/))) return `${m[1]}-${m[2].padStart(2, "0")}`;
  if ((m = s.match(/^(\d{1,2})$/))) return `${YEAR}-${m[1].padStart(2, "0")}`;
  if ((m = s.match(/^([A-Za-z]{3})-(\d{2})$/))) {
    const i = "janfebmaraprmayjunjulaugsepoctnovdec".indexOf(m[1].toLowerCase()) / 3;
    if (i >= 0) return `20${m[2]}-${String(i + 1).padStart(2, "0")}`;
  }
  return null;
}
const num = (v) => (typeof v === "number" ? v : Number(String(v ?? "").replace(/[^0-9.-]/g, "")) || 0);
const cellValue = (v) =>
  v && typeof v === "object" && !(v instanceof Date) ? ("result" in v ? v.result : v.richText ? v.richText.map((t) => t.text).join("") : v.text ?? null) : v;

/** Streams every data row (as an object keyed by header) of every sheet of an xlsx. */
async function* xlsxRows(file) {
  const reader = new ExcelJS.stream.xlsx.WorkbookReader(file, { sharedStrings: "cache", worksheets: "emit" });
  for await (const ws of reader) {
    let header = null;
    for await (const row of ws) {
      const vals = (row.values || []).slice(1).map(cellValue);
      if (!header) {
        if (vals.filter((x) => x !== undefined && x !== null && x !== "").length >= 4) header = vals.map((h) => String(h ?? "").trim());
        continue;
      }
      yield Object.fromEntries(header.map((h, i) => [h, vals[i]]));
    }
  }
}

/** Minimal CSV line parser (quotes, doubled quotes). */
function parseCsvLine(l) {
  const out = [];
  let c = "", q = false;
  for (let i = 0; i < l.length; i++) {
    const ch = l[i];
    if (q) {
      if (ch === '"' && l[i + 1] === '"') { c += '"'; i++; }
      else if (ch === '"') q = false;
      else c += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { out.push(c); c = ""; }
    else c += ch;
  }
  out.push(c);
  return out;
}

function dealTypeFrom(text) {
  const t = String(text ?? "").toLowerCase();
  if (!t || t === "n/a" || t === "(blank)") return "Open exchange";
  if (/non.?guarant|private auction|preferred|supply vendor|pmp|\bpd\b/.test(t)) return "Non-guaranteed deal";
  if (/guarant|\bpg\b/.test(t)) return "Guaranteed deal";
  return "Deal (type unknown)";
}

// ─── Accumulator ─────────────────────────────────────────────────────────────
// key = dsp|month|client|partner|publisher|dealType|source → { cad, imps, how }
const acc = new Map();
const rawUnmapped = new Map(); // dsp → Map(publisher → cad)
function add({ dsp, month, client, partner, publisher, dealType, source, cad, imps, how }) {
  if (!MONTHS.includes(month) || !cad) return;
  const p = partner || "(unmapped)";
  const pub = partner ? partner : publisher || "(no publisher detail)";
  if (!partner) {
    if (!rawUnmapped.has(dsp)) rawUnmapped.set(dsp, new Map());
    rawUnmapped.get(dsp).set(pub, (rawUnmapped.get(dsp).get(pub) || 0) + cad);
  }
  const key = [dsp, month, client, p, pub, dealType, source, how || (partner ? "?" : "none")].join("\u0001");
  const a = acc.get(key) || { cad: 0, imps: 0 };
  a.cad += cad;
  a.imps += imps || 0;
  acc.set(key, a);
}

// ─── FX ──────────────────────────────────────────────────────────────────────
const fx = await fetchRatesToCad(["USD"], [YEAR]);
const toCad = (amount, cur) => (String(cur || "CAD").toUpperCase().startsWith("USD") ? amount * fx[YEAR].USD.rate : amount);
console.log(`USD→CAD ${fx[YEAR].USD.rate} (${fx[YEAR].USD.basis})`);

// ─── BigQuery helpers ────────────────────────────────────────────────────────
const bq = new BigQuery({ projectId: BQ_PROJECT });
function bqCli(sql) {
  // Drive-backed external tables need the gcloud user login (Drive scope).
  const out = execFileSync(
    process.platform === "win32" ? "bq.cmd" : "bq",
    ["query", `--project_id=${BQ_PROJECT}`, "--location=northamerica-northeast1", "--use_legacy_sql=false", "--format=json", "--max_rows=100000", sql],
    {
      encoding: "utf8",
      maxBuffer: 512 * 1024 * 1024,
      shell: process.platform === "win32",
      // bq is Python: without this it prints accents in the Windows code page.
      env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1" },
    }
  );
  return JSON.parse(out.slice(out.indexOf("[")));
}

// ─── DV360 ───────────────────────────────────────────────────────────────────
async function loadDv360() {
  const sdf = new Map(
    bqCli(
      "SELECT CAST(Inventory_Source_Id AS STRING) id, ANY_VALUE(PLUSCO_MEDIA_PARTNER) p, ANY_VALUE(Publisher_Seller) s FROM `plusco-media-invest-solutions.Prog_DV360_BQ_Dataset.SDF_Master_File` GROUP BY 1"
    ).map((r) => [r.id, { partner: r.p, seller: r.s }])
  );
  const clientMap = new Map(
    bqCli("SELECT Advertiser a, ANY_VALUE(PLUSCO_CLIENT_NAME) c FROM `plusco-media-invest-solutions.Prog_DV360_BQ_Dataset.SDF_Client_Mapping` WHERE Advertiser IS NOT NULL AND PLUSCO_CLIENT_NAME IS NOT NULL GROUP BY 1")
      .filter((r) => r.a && r.c && r.c !== "#N/A")
      .map((r) => [fold(r.a), r.c.trim()])
  );
  console.log(`DV360: ${sdf.size} SDF deals, ${clientMap.size} mapped advertisers`);
  const [rows] = await bq.query({
    location: "northamerica-northeast1",
    query: `
      WITH d AS (
        SELECT REPLACE(Month,'/','-') month, Partner, Advertiser, Advertiser_Currency cur, Exchange,
          IFNULL(Inventory_Source_ID,'') src_id, Inventory_Source src, Inventory_Commitment commit, App_URL url,
          Media_Cost_Advertiser_Currency cost, Impressions imps
        FROM \`${BQ_PROJECT}.Prog_DV360_BQ_Dataset.Prog_DV360_Combined\`
        WHERE Month BETWEEN '${YEAR}/01' AND '${YEAR}/11'),
      big_urls AS (
        SELECT url FROM d WHERE src_id IN ('','0','-') AND Exchange NOT LIKE 'YouTube%'
        GROUP BY url HAVING SUM(cost) >= 500)
      SELECT month, Partner partner, Advertiser advertiser, cur, Exchange exchange, src_id, ANY_VALUE(src) src, ANY_VALUE(commit) commit,
        IF(src_id IN ('','0','-') AND Exchange NOT LIKE 'YouTube%', IFNULL(b.url, '(long tail sites)'), NULL) url,
        SUM(cost) cost, SUM(imps) imps
      FROM d LEFT JOIN big_urls b USING (url)
      GROUP BY month, partner, advertiser, cur, exchange, src_id, url`,
  });
  console.log(`DV360: ${rows.length} aggregated rows`);
  for (const r of rows) {
    const isYt = /^YouTube/i.test(r.exchange || "");
    const isDeal = !isYt && !["", "0", "-"].includes(r.src_id);
    const s = isDeal ? sdf.get(r.src_id) : null;
    let m = null;
    if (isYt) m = { partner: "GOOGLE INC", how: "YouTube" };
    else if (s?.partner && PARTNERS.has(String(s.partner).trim())) m = { partner: String(s.partner).trim(), how: "SDF deal mapping" };
    else m = matchPartner(isDeal ? [r.src, s?.seller] : [r.url]);
    add({
      dsp: "DV360",
      month: r.month,
      client: clientFor(r.advertiser, clientMap),
      partner: m?.partner,
      how: m?.how,
      publisher: isDeal ? s?.seller || r.src : r.url,
      dealType: isYt ? "YouTube" : isDeal ? (/non/i.test(r.commit || "") ? "Non-guaranteed deal" : /guarant/i.test(r.commit || "") ? "Guaranteed deal" : "Deal (type unknown)") : "Open exchange",
      source: "BigQuery DV360",
      cad: toCad(Number(r.cost) || 0, r.cur),
      imps: Number(r.imps) || 0,
    });
  }
}

// ─── Amazon ──────────────────────────────────────────────────────────────────
async function loadAmazon() {
  const rl = readline.createInterface({ input: fs.createReadStream(inDir("amazon_ytd.csv")) });
  let H = null, n = 0;
  for await (const line of rl) {
    const r = parseCsvLine(line);
    if (!H) { H = r.map((h) => h.replace(/^﻿/, "").trim()); continue; }
    const o = Object.fromEntries(H.map((h, i) => [h, r[i]]));
    n++;
    const supply = o["Supply source"], site = o["Site or app"], deal = o["Deal name"];
    const m = matchPartner([deal, supply, site]);
    add({
      dsp: "Amazon",
      month: toMonth(o.Month),
      client: clientFor(o["Advertiser account name"]),
      partner: m?.partner,
      how: m?.how,
      publisher: site && site !== "Unknown" ? site : supply || "(blank supply source)",
      dealType: dealTypeFrom(o["Deal type"]),
      source: "Amazon YTD export",
      cad: toCad(num(o["Total cost"]), o["Budget currency"]),
      imps: num(o.Impressions),
    });
  }
  console.log(`Amazon: ${n} rows`);
}

// ─── TTD ─────────────────────────────────────────────────────────────────────
async function loadTtd() {
  let n = 0;
  for await (const o of xlsxRows(inDir("ttd_updated.xlsx"))) {
    if (!o.Advertiser) continue;
    n++;
    const contract = o["Inventory Contract"];
    const m = matchPartner([contract, o["Publisher Name"], o["Seller Domain"]]);
    add({
      dsp: "TTD",
      month: toMonth(o.Month),
      client: clientFor(o.Advertiser),
      partner: m?.partner,
      how: m?.how,
      publisher: contract || "(open market, no site in export)",
      dealType: dealTypeFrom(o["Inventory Contract Type"]),
      source: "TTD YTD export",
      cad: toCad(num(o["Advertiser Cost (Adv Currency)"]), o["Advertiser Currency Code"]),
      imps: num(o.Impressions),
    });
  }
  console.log(`TTD: ${n} rows`);
}

// ─── Yahoo ───────────────────────────────────────────────────────────────────
async function loadYahoo() {
  const seen = new Set(); // month|advertiser covered by a detailed export
  for (const [file, cur] of [["yahoo_ca.xlsx", "CAD"], ["yahoo_us.xlsx", "USD"]]) {
    let n = 0;
    for await (const o of xlsxRows(inDir(file))) {
      if (!o["Advertiser Name"]) continue; // the export's trailing total row
      n++;
      const month = toMonth(o.Month);
      const adv = String(o["Advertiser Name"]);
      seen.add(`${month}|${adv.replace(/\s*\((CAD|USD)\)\s*$/, "")}`);
      const deal = o.Deal && o.Deal !== "N/A" ? o.Deal : null;
      const m = matchPartner([deal, o["Jounce Publisher Name"], o.Domain, o["App Name"]]);
      add({
        dsp: "Yahoo",
        month,
        client: clientFor(adv),
        partner: m?.partner,
        how: m?.how,
        publisher: o["Jounce Publisher Name"] && o["Jounce Publisher Name"] !== "Not Yet Mapped" ? o["Jounce Publisher Name"] : o.Domain,
        dealType: deal ? dealTypeFrom(deal) : "Open exchange",
        source: "Yahoo YTD export",
        cad: toCad(num(o["Advertiser Spending"]), o["Currency Code"] || cur),
        imps: num(o.Impressions),
      });
    }
    console.log(`Yahoo ${file}: ${n} rows`);
  }
  // Fallback: the template's Yahoo tab, for (month, advertiser) pairs the cut-off exports miss.
  const tab = JSON.parse(fs.readFileSync(inDir("yahoo_tab.json"), "utf8")).values.slice(2).filter((r) => r.length > 5);
  let used = 0;
  for (const r of tab) {
    const month = toMonth(typeof r[10] === "number" ? r[10] : r[10]);
    const adv = String(r[3] ?? "");
    if (seen.has(`${month}|${adv.replace(/\s*\((CAD|USD)\)\s*$/, "")}`)) continue;
    used++;
    const deal = r[6];
    const m = matchPartner([deal]);
    add({
      dsp: "Yahoo",
      month,
      client: clientFor(adv),
      partner: m?.partner,
      how: m?.how,
      publisher: "(no publisher detail: template tab)",
      dealType: dealTypeFrom(deal),
      source: "Template Yahoo tab",
      cad: toCad(num(r[13]), r[12]),
      imps: num(r[11]),
    });
  }
  console.log(`Yahoo template fallback: ${used} rows used`);
}

// ─── MIR reference ───────────────────────────────────────────────────────────
async function loadMir() {
  const [rows] = await bq.query({
    location: "northamerica-northeast1",
    query: `
      SELECT CASE PLUSCO_MEDIA_PARTNER WHEN 'AMAZON' THEN 'Amazon' WHEN 'YAHOO' THEN 'Yahoo' WHEN 'THE TRADE DESK' THEN 'TTD'
               WHEN 'QUANTCAST' THEN 'Quantcast' WHEN 'STACKADAPT' THEN 'StackAdapt' ELSE 'DV360' END dsp,
        SUBSTR(MONTH, 1, 7) month, PLUSCO_CLIENT_NAME client, SUM(NET_ORDERED_CAD) cad
      FROM \`${BQ_PROJECT}.PCC_Media_Investment.PCC_Dashboard_NATIVE\`
      WHERE PLUSCO_YEAR = '${YEAR}' AND PLUSCO_PROGRAMMATIC = 'DSP'
        AND PLUSCO_MEDIA_PARTNER IN ('AMAZON','YAHOO','THE TRADE DESK','QUANTCAST','STACKADAPT','GOOGLE-DV360','MONKS-GOOGLE DV360','BRAINLABS (DV360 RESELLER)')
      GROUP BY 1, 2, 3 HAVING ABS(cad) >= 1`,
  });
  return rows.map((r) => [r.dsp, r.month, r.client, Math.round(Number(r.cad))]).filter((r) => MONTHS.includes(r[1]));
}

// ─── Run ─────────────────────────────────────────────────────────────────────
await loadDv360();
await loadAmazon();
await loadTtd();
await loadYahoo();
const mir = await loadMir();

// Keep the biggest unmapped publisher names per DSP; roll the rest up.
const keepRaw = new Map(
  [...rawUnmapped].map(([dsp, m]) => [dsp, new Set([...m].sort((a, b) => b[1] - a[1]).slice(0, RAW_PUBLISHERS_PER_DSP).map(([k]) => k))])
);
const final = new Map();
for (const [key, v] of acc) {
  const [dsp, month, client, partner, pub, dealType, source, how] = key.split("\u0001");
  const publisher = partner === "(unmapped)" && !keepRaw.get(dsp)?.has(pub) ? "(other unmapped publishers)" : pub;
  const k2 = [dsp, month, client, partner, publisher, dealType, source, how].join("\u0001");
  const a = final.get(k2) || { cad: 0, imps: 0 };
  a.cad += v.cad;
  a.imps += v.imps;
  final.set(k2, a);
}
const COLUMNS = ["dsp", "month", "client", "partner", "local", "publisher", "dealType", "source", "mappedBy", "spendCad", "impressions"];
const rows = [...final]
  .map(([k, v]) => {
    const [dsp, month, client, partner, publisher, dealType, source, how] = k.split("\u0001");
    const local = partner === "(unmapped)" ? "UNMAPPED" : PARTNERS.get(partner)?.local || "UNKNOWN";
    return [dsp, month, client, partner, local, publisher, dealType, source, how, Math.round(v.cad * 100) / 100, Math.round(v.imps)];
  })
  .filter((r) => Math.abs(r[9]) >= 0.5);

// ─── Summary ─────────────────────────────────────────────────────────────────
const sum = (rs, f) => rs.reduce((s, r) => s + f(r), 0);
console.log(`\n${rows.length} rows`);
for (const dsp of ["DV360", "Amazon", "TTD", "Yahoo"]) {
  const rs = rows.filter((r) => r[0] === dsp);
  const tot = sum(rs, (r) => r[9]);
  const mapped = sum(rs.filter((r) => r[3] !== "(unmapped)"), (r) => r[9]);
  const local = sum(rs.filter((r) => r[4] === "LOCAL"), (r) => r[9]);
  const mirTot = sum(mir.filter((r) => r[0] === dsp), (r) => r[3]);
  const unmappedClients = [...new Set(rs.filter((r) => r[2].startsWith("(unmapped)")).map((r) => r[2]))];
  console.log(
    `${dsp.padEnd(7)} data $${(tot / 1e6).toFixed(2)}M | MIR $${(mirTot / 1e6).toFixed(2)}M | publisher mapped ${((100 * mapped) / tot).toFixed(0)}% | local $${(local / 1e6).toFixed(2)}M` +
      (unmappedClients.length ? ` | unmapped clients: ${unmappedClients.join(", ")}` : "")
  );
}

const meta = {
  generatedAt: new Date().toISOString(),
  year: YEAR,
  months: MONTHS,
  columns: COLUMNS,
  fx: { USD: fx[YEAR].USD },
  mirColumns: ["dsp", "month", "client", "mirCad"],
  mir,
  docCount: Math.ceil(rows.length / ROWS_PER_DOC),
};
fs.writeFileSync(inDir("programmatic_preview.json"), JSON.stringify({ meta, rows }));
console.log(`Saved ${inDir("programmatic_preview.json")}`);

if (WRITE) {
  admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: FIREBASE_PROJECT });
  const db = admin.firestore();
  const old = await db.collection(COLLECTION).listDocuments();
  for (const d of old) await d.delete();
  for (let i = 0; i < meta.docCount; i++) {
    const chunk = rows.slice(i * ROWS_PER_DOC, (i + 1) * ROWS_PER_DOC);
    // Firestore can't store nested arrays: each row is a JSON string.
    await db.doc(`${COLLECTION}/rows_${String(i).padStart(3, "0")}`).set({ rows: chunk.map((r) => JSON.stringify(r)) });
  }
  await db.doc(`${COLLECTION}/meta`).set({ ...meta, mir: meta.mir.map((r) => JSON.stringify(r)) });
  console.log(`Wrote ${meta.docCount} row docs + meta to ${COLLECTION}.`);
}
