/**
 * MIR auto-fill — writes the proposed rows of MIR_Live.fill_suggestions (bq/mir_live/09_auto_fill.sql) into the
 * Vendor Database 2.0 and the MO Client Key every morning, and e-mails each owner their doubtful rows on Mondays.
 *
 *   - A sure row is written as is, with a short note on the name cell saying where it was copied from.
 *   - A doubtful row is written with the best guess, highlighted yellow, with a "DOUBT" note saying what was
 *     assumed and what to confirm.
 *   - Rows already in the sheet are never overwritten: a vendor / client someone added by hand is skipped, and on
 *     an existing vendor with no partner only the empty cells are filled.
 *   - Monday: one e-mail per owner group listing the yellow rows still open. Once a row is confirmed or
 *     corrected, clear its yellow fill: it drops off the next e-mail.
 *
 * Setup (once, signed in as someone who can edit both sheets):
 *   1. script.google.com → New project → paste this file.
 *   2. Services (+) → BigQuery API → Add.
 *   3. Run `installTriggers` and accept the permissions (BigQuery, Sheets, Gmail send).
 *   4. Optional: run `autoFillNow` to write today's proposals, `doubtsNow` to get the doubts e-mail.
 */

const PROJECT_ID = 'plusco-media-invest-solutions';
const VENDOR_DB_ID = '1RBhj3hvQf2PwmsTZfFwg_DHTfRs4lesS2KpYEpwcTtQ';
const VENDOR_TAB = 'MIR VENDOR DATABASE 2.0';
const VENDOR_WIP_TAB = 'wip_Vendor Update';
const CLIENT_KEY_ID = '1XhxXJK4UjnW9vrUMUB24MpQzFbN0FGROt4OTFkuEnVM';
const CLIENT_TAB = 'MO_Client_Key';
const YELLOW = '#ffff00';

// Who answers which doubts (Adriana, 2026-10-30, to be confirmed). While OWNERS_CONFIRMED is false every
// e-mail goes to FALLBACK only, with the intended owners named in it.
const OWNERS_CONFIRMED = false;
const FALLBACK = ['noble.nelson@pluscompany.com'];
const OWNERS = {
  'New clients': { names: 'Noble / Charlaine', emails: ['noble.nelson@pluscompany.com', 'charlaine.st-amant@cossettemedia.com'] },
  'English broadcast': { names: 'Diane / Brian McDowall', emails: [] },
  'French broadcast': { names: 'Isabelle Fournier / Sandra Wells', emails: ['sandra.wells@pluscompany.com'] },
  'English Digital / Print / OOH': { names: 'Diane / Daniel Jackson', emails: [] },
  'French Digital / Print / OOH': { names: 'Sandra Wells', emails: ['sandra.wells@pluscompany.com'] },
};

// Vendor Database 2.0 columns A:AC (1-based positions used below).
const VENDOR_COLS = ['MEDIA', 'PLUSCO_MEDIA_CHANNEL', 'PLUSCO_PROGRAMMATIC', 'PLUSCO_LOCAL_MEDIA', 'VENDOR_CODE_API',
  'VENDOR_CODE_MIR', 'VENDOR', 'PAYREP_CODE', 'PAYREP', 'PLUSCO_PAY_REP', null, null, null, null, 'PLUSCO_MEDIA_PARTNER',
  'PLUSCO_PARTNER_RepHouseTag', 'PLUSCO_MEDIA_OWNER', 'SPOT_MARKET_CODE', 'SPOT_MARKET_NAME', 'PLUSCO_VENDOR_COUNTRY',
  'PLUSCO_VENDOR_PROVINCE', 'PLUSCO_VENDOR_MARKET', 'PLUSCO_VENDOR_LANGUAGE', 'PLUSCO_VENDOR_LANGUAGE_Detail',
  'PLUSCO_VENDOR_AUDIENCE', 'PLUSCO_CONVENTIONAL_SPECIALTY', 'SPOT_Type'];
const V_CODE = 6, V_NAME = 7, V_DEALS = 11, V_WIDTH = 28;
const CLIENT_COLS = ['MO_client_id', 'MO_client_name', 'MO_product_code', 'MO_product', 'CLIENT_INTERCO',
  'forecaster_client_id', 'forecaster_client_name', 'CLIENT_CURRENCY_MO', 'mb_2_0_client_id', 'mb_2_0_client_name', 'gaia_client_id'];
const C_NAME = 7;

/** 7 AM: write the proposals (the MIR rebuilds at 6 PM the evening before; the e-mail goes at 8 AM). Monday 9 AM: doubts. */
function installTriggers() {
  ScriptApp.getProjectTriggers()
    .filter(t => ['autoFill', 'weeklyDoubts'].includes(t.getHandlerFunction()))
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('autoFill').timeBased().everyDays(1).atHour(7).inTimezone('America/Montreal').create();
  ScriptApp.newTrigger('weeklyDoubts').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(9).inTimezone('America/Montreal').create();
}

function autoFill() {
  const rows = query_(`
    SELECT kind, action, code, sure, note, row_json
    FROM \`${PROJECT_ID}.MIR_Live.fill_suggestions\`
    ORDER BY kind, sure DESC, ABS(cad) DESC`);
  const done = [];
  const vendors = rows.filter(r => r.kind === 'vendor');
  const clients = rows.filter(r => r.kind === 'client');
  if (vendors.length) done.push(...fillVendors_(vendors));
  if (clients.length) done.push(...fillClients_(clients));
  console.log(done.length ? done.join('\n') : 'Nothing to fill.');
}

function autoFillNow() {
  autoFill();
}

function fillVendors_(rows) {
  const book = SpreadsheetApp.openById(VENDOR_DB_ID);
  const main = book.getSheetByName(VENDOR_TAB);
  const wip = book.getSheetByName(VENDOR_WIP_TAB);
  const codes = main.getRange(1, V_CODE, main.getLastRow(), 1).getDisplayValues().map(r => String(r[0]).trim());
  const log = [];
  for (const r of rows) {
    const v = JSON.parse(r.row_json);
    const sure = r.sure === 'true';
    const at = codes.indexOf(String(r.code));
    if (r.action === 'fill_partner') {
      if (at < 0) continue;
      // Existing row: only the empty partner cells.
      const filled = fillBlanks_(main, at + 1, v, ['PLUSCO_PAY_REP', 'PLUSCO_MEDIA_PARTNER', 'PLUSCO_MEDIA_OWNER']);
      if (!filled) continue;
      markRow_(main, at + 1, V_WIDTH, V_NAME, r.note, sure);
      log.push(`vendor ${r.code}: partner filled${sure ? '' : ' (doubt)'}`);
      continue;
    }
    if (at >= 0) continue; // someone added it already
    const rowNo = lastFilledRow_(codes) + 1;
    writeVendorRow_(main, rowNo, v, null);
    markRow_(main, rowNo, V_WIDTH, V_NAME, r.note, sure);
    codes[rowNo - 1] = String(r.code);
    // Same row on the input tab, marked TBC like the other additions.
    if (wip) {
      const wipCodes = wip.getRange(1, V_CODE, Math.max(wip.getLastRow(), 1), 1).getDisplayValues().map(x => String(x[0]).trim());
      if (wipCodes.indexOf(String(r.code)) < 0) {
        const wipRow = lastFilledRow_(wipCodes) + 1;
        writeVendorRow_(wip, wipRow, v, 'TBC');
        markRow_(wip, wipRow, V_WIDTH, V_NAME, r.note, sure);
      }
    }
    log.push(`vendor ${r.code} ${v.VENDOR}: added${sure ? '' : ' (doubt)'}`);
  }
  return log;
}

function writeVendorRow_(sheet, rowNo, v, status) {
  // Codes stay plain text (vendor codes E:F, paying rep code H, market code R): a numeric code turned into a
  // number breaks every MIR lookup on column F, and '0147' would lose its zero.
  sheet.getRange(rowNo, 5, 1, 6).setNumberFormat('@');
  sheet.getRange(rowNo, 18).setNumberFormat('@');
  const values = VENDOR_COLS.map(c => (c ? (v[c] === null || v[c] === undefined ? '' : String(v[c])) : ''));
  if (status) values.push(status);
  sheet.getRange(rowNo, 1, 1, values.length).setValues([values]);
  // K:N: the same Key_2026_Deals lookups as the rows above.
  const deals = [2, 3, 4, 5].map(k => `=VLOOKUP(O${rowNo},Key_2026_Deals!A:E,${k},FALSE)`);
  sheet.getRange(rowNo, V_DEALS, 1, 4).setFormulas([deals]);
}

function fillClients_(rows) {
  const sheet = SpreadsheetApp.openById(CLIENT_KEY_ID).getSheetByName(CLIENT_TAB);
  const data = sheet.getRange(1, 1, sheet.getLastRow(), 3).getDisplayValues();
  const keyOf = (client, product) => `${String(client).trim()}|${String(product || '').trim()}`;
  const keys = data.map(r => keyOf(r[0], r[2]));
  const ids = data.map(r => String(r[0]).trim());
  const log = [];
  for (const r of rows) {
    const c = JSON.parse(r.row_json);
    const sure = r.sure === 'true';
    if (r.action === 'check_id') {
      // The key already has the client but points to a Forecaster id that no longer exists: flag its rows.
      ids.forEach((id, i) => { if (id === c.MO_client_id) markRow_(sheet, i + 1, CLIENT_COLS.length, C_NAME, r.note, false); });
      log.push(`client ${r.code}: flagged (Forecaster id not found)`);
      continue;
    }
    const key = keyOf(c.MO_client_id, c.MO_product_code);
    if (keys.indexOf(key) >= 0) continue;
    const rowNo = lastFilledRow_(ids) + 1;
    sheet.getRange(rowNo, 1, 1, CLIENT_COLS.length).setNumberFormat('@')
      .setValues([CLIENT_COLS.map(k => (c[k] === null || c[k] === undefined ? '' : String(c[k])))]);
    markRow_(sheet, rowNo, CLIENT_COLS.length, C_NAME, r.note, sure);
    keys[rowNo - 1] = key;
    ids[rowNo - 1] = String(c.MO_client_id);
    log.push(`client ${r.code}: added${sure ? '' : ' (doubt)'}`);
  }
  return log;
}

/** Fill the named columns of an existing vendor row where they are empty; true when something was written. */
function fillBlanks_(sheet, rowNo, v, cols) {
  let wrote = false;
  for (const c of cols) {
    const cell = sheet.getRange(rowNo, VENDOR_COLS.indexOf(c) + 1);
    const now = String(cell.getDisplayValue()).trim();
    if ((now === '' || now === '#N/A') && v[c]) {
      cell.setValue(String(v[c]));
      wrote = true;
    }
  }
  return wrote;
}

function markRow_(sheet, rowNo, width, noteCol, note, sure) {
  sheet.getRange(rowNo, noteCol).setNote(note);
  if (!sure) sheet.getRange(rowNo, 1, 1, width).setBackground(YELLOW);
}

/** Last row with a value in a column read with getDisplayValues (a filter or blank rows below don't matter). */
function lastFilledRow_(column) {
  for (let i = column.length - 1; i >= 0; i--) if (column[i] !== '') return i + 1;
  return 1;
}

// ---------------------------------------------------------------------------------------------------------------
// Monday e-mail: the yellow rows with a DOUBT note, one e-mail per owner group.

function weeklyDoubts() {
  sendDoubts_();
}

function doubtsNow() {
  sendDoubts_();
}

function sendDoubts_() {
  const groups = {};
  const add = (group, item) => (groups[group] = groups[group] || []).push(item);

  const vbook = SpreadsheetApp.openById(VENDOR_DB_ID);
  const vsheet = vbook.getSheetByName(VENDOR_TAB);
  for (const d of openDoubts_(vsheet, V_WIDTH, V_NAME)) {
    const media = String(d.values[0]).charAt(0);
    const french = /french/i.test(String(d.values[22]));
    const broadcast = ['R', 'T', 'N'].includes(media);
    const group = `${french ? 'French' : 'English'} ${broadcast ? 'broadcast' : 'Digital / Print / OOH'}`;
    add(group, { what: `${d.values[5]} ${d.values[6]}`, detail: `${d.values[1]} · partner ${d.values[14]}`, note: d.note,
      link: `https://docs.google.com/spreadsheets/d/${VENDOR_DB_ID}/edit#gid=${vsheet.getSheetId()}&range=A${d.row}` });
  }
  const csheet = SpreadsheetApp.openById(CLIENT_KEY_ID).getSheetByName(CLIENT_TAB);
  for (const d of openDoubts_(csheet, CLIENT_COLS.length, C_NAME)) {
    add('New clients', { what: `${d.values[0]}${d.values[2] ? ' / ' + d.values[2] : ''} ${d.values[3] || d.values[1]}`,
      detail: d.values[6] ? `filled as ${d.values[6]}` : 'not filled', note: d.note,
      link: `https://docs.google.com/spreadsheets/d/${CLIENT_KEY_ID}/edit#gid=${csheet.getSheetId()}&range=A${d.row}` });
  }

  for (const [group, items] of Object.entries(groups)) {
    const owner = OWNERS[group] || { names: '?', emails: [] };
    const to = OWNERS_CONFIRMED && owner.emails.length ? owner.emails : FALLBACK;
    let html = `<div style="font-family:Arial,sans-serif;font-size:13px;color:#222">`;
    html += `<p>Hi,</p><p>New ${group === 'New clients' ? 'clients' : 'vendors'} in MediaOcean were added to the MIR lookups automatically. `
      + `<b>${items.length} need a quick check</b>: each line says what was assumed. A one-word answer is enough (reply to this e-mail), `
      + `or correct the row and clear its yellow fill.</p>`;
    if (!OWNERS_CONFIRMED) html += `<p style="color:#888">[Test mode: for ${esc_(owner.names)}; sent to ${FALLBACK.join(', ')} only.]</p>`;
    html += `<table cellpadding="5" style="border-collapse:collapse;font-size:12px">
      <tr style="background:#222;color:#fff"><th align="left">${group === 'New clients' ? 'Client' : 'Vendor'}</th><th align="left">Filled as</th><th align="left">To confirm</th></tr>`;
    items.forEach((it, i) => {
      html += `<tr style="background:${i % 2 ? '#f4f4f4' : '#fff'}"><td><a href="${it.link}">${esc_(it.what)}</a></td>
        <td>${esc_(it.detail)}</td><td>${esc_(it.note.replace(/^DOUBT \([^)]*\):\s*/, ''))}</td></tr>`;
    });
    html += `</table><p>Thanks!</p></div>`;
    GmailApp.sendEmail(to.join(','), `MIR: ${items.length} new ${group === 'New clients' ? 'client' : 'vendor'}(s) to confirm — ${group}`,
      'This e-mail needs an HTML-capable client.', { htmlBody: html, name: 'Automated MIR' });
  }
}

/** Rows whose name cell has a DOUBT note and whose fill is still yellow. */
function openDoubts_(sheet, width, noteCol) {
  const n = sheet.getLastRow();
  const notes = sheet.getRange(1, noteCol, n, 1).getNotes();
  const backgrounds = sheet.getRange(1, 1, n, 1).getBackgrounds();
  const out = [];
  for (let i = 1; i < n; i++) {
    if (!/^DOUBT/.test(notes[i][0]) || backgrounds[i][0].toLowerCase() !== YELLOW) continue;
    out.push({ row: i + 1, note: notes[i][0], values: sheet.getRange(i + 1, 1, 1, width).getDisplayValues()[0] });
  }
  return out;
}

function query_(sql) {
  let res = BigQuery.Jobs.query({ query: sql, useLegacySql: false, location: 'northamerica-northeast1' }, PROJECT_ID);
  const jobId = res.jobReference.jobId;
  while (!res.jobComplete) {
    Utilities.sleep(1000);
    res = BigQuery.Jobs.getQueryResults(PROJECT_ID, jobId, { location: 'northamerica-northeast1' });
  }
  const names = res.schema.fields.map(f => f.name);
  return (res.rows || []).map(row => Object.fromEntries(row.f.map((c, i) => [names[i], c.v])));
}

function esc_(v) {
  return v === null || v === undefined ? '' : String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
