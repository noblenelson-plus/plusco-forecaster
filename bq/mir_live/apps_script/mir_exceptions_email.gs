/**
 * MIR: clients and vendors to confirm — morning e-mail from MIR_Live.exceptions (bq/mir_live/07_exceptions.sql).
 *
 * Sent when something new appeared overnight, and every Monday with the full open list.
 *
 * Setup (once, signed in as the schedule owner):
 *   1. script.google.com → New project → paste this file.
 *   2. Services (+) → BigQuery API → Add.
 *   3. Run `installTrigger` and accept the permissions (BigQuery, Gmail send).
 *   4. Optional: run `sendNow` to get today's list immediately.
 */

const PROJECT_ID = 'plusco-media-invest-solutions';
const RECIPIENTS = ['noble.nelson@pluscompany.com', 'adriana.novoa@pluscompany.com'];
const MO_CLIENT_KEY_URL = 'https://docs.google.com/spreadsheets/d/1XhxXJK4UjnW9vrUMUB24MpQzFbN0FGROt4OTFkuEnVM/edit';
const VENDOR_DB_URL = 'https://docs.google.com/spreadsheets/d/1RBhj3hvQf2PwmsTZfFwg_DHTfRs4lesS2KpYEpwcTtQ/edit';

/** Daily trigger, 8 AM Montreal (the MIR rebuilds at 6 PM the evening before). */
function installTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'dailyEmail')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('dailyEmail').timeBased().everyDays(1).atHour(8).inTimezone('America/Montreal').create();
}

function dailyEmail() {
  send_(false);
}

function sendNow() {
  send_(true);
}

function send_(force) {
  const rows = query_(`
    SELECT kind, issue, code, name, agency, media, cad_2025, cad_2026, cad_2027, lines,
           sample_estimate, suggestion, CAST(first_seen AS STRING) AS first_seen, is_new, CAST(as_of AS STRING) AS as_of
    FROM \`${PROJECT_ID}.MIR_Live.exceptions\`
    ORDER BY kind, issue, ABS(cad_2025) + ABS(cad_2026) + ABS(cad_2027) DESC`);
  const isMonday = new Date().getDay() === 1;
  const fresh = rows.filter(r => r.is_new === 'true' && r.code !== 'NETWORK GROUPS');
  if (!force && !isMonday && fresh.length === 0) return;

  const asOf = rows.length ? rows[0].as_of : Utilities.formatDate(new Date(), 'America/Montreal', 'yyyy-MM-dd');
  const open = rows.filter(r => r.code !== 'NETWORK GROUPS');
  const gap = rows.find(r => r.code === 'NETWORK GROUPS');
  const clients = open.filter(r => r.kind === 'client').length;
  const vendors = open.filter(r => r.kind === 'vendor').length;

  let html = `<div style="font-family:Arial,sans-serif;font-size:13px;color:#222">`;
  html += `<p>Automated MIR as of ${asOf}: <b>${fresh.length} new</b> item(s) to confirm; ${clients} client(s) and ${vendors} vendor(s) open in total.</p>`;
  html += `<p>Fix them in the <a href="${MO_CLIENT_KEY_URL}">MO Client Key</a> or the <a href="${VENDOR_DB_URL}">Vendor Database 2.0</a>; they drop off the list after the next nightly build.</p>`;
  if (fresh.length) html += section_('New since yesterday', fresh);
  if (isMonday || force) {
    const older = open.filter(r => r.is_new !== 'true');
    if (older.length) html += section_('Still open', older);
  }
  if (gap) {
    html += `<p style="color:#666">Known gap, not counted above: ${money_(num_(gap.cad_2025) + num_(gap.cad_2026) + num_(gap.cad_2027))} of network TV booked on group stations can't be split by network until MediaOcean enables the Spot order file.</p>`;
  }
  html += `<p style="color:#888;font-size:11px">Source: BigQuery ${PROJECT_ID}.MIR_Live.exceptions</p></div>`;

  const subject = `MIR: ${fresh.length ? fresh.length + ' new ' : ''}clients and vendors to confirm (${asOf})`;
  GmailApp.sendEmail(RECIPIENTS.join(','), subject, 'This e-mail needs an HTML-capable client.', { htmlBody: html, name: 'Automated MIR' });
}

function section_(title, rows) {
  let html = `<h3 style="margin:18px 0 6px">${title}</h3>`;
  for (const kind of ['client', 'vendor']) {
    const list = rows.filter(r => r.kind === kind);
    if (!list.length) continue;
    html += `<table cellpadding="4" style="border-collapse:collapse;font-size:12px;margin-bottom:10px">
      <tr style="background:#222;color:#fff"><th align="left">${kind === 'client' ? 'Client' : 'Vendor'}</th><th align="left">Issue</th>
      <th align="left">Agency</th><th>Media</th><th align="right">2025</th><th align="right">2026</th><th align="right">2027</th>
      <th align="left">Example</th><th align="left">Suggestion</th></tr>`;
    list.forEach((r, i) => {
      html += `<tr style="background:${i % 2 ? '#f4f4f4' : '#fff'}"><td><b>${esc_(r.code)}</b> ${esc_(r.name)}</td><td>${esc_(r.issue)}</td>
        <td>${esc_(r.agency)}</td><td align="center">${esc_(r.media)}</td><td align="right">${money_(r.cad_2025)}</td>
        <td align="right">${money_(r.cad_2026)}</td><td align="right">${money_(r.cad_2027)}</td>
        <td>${esc_(r.sample_estimate)}</td><td>${esc_(r.suggestion)}</td></tr>`;
    });
    html += `</table>`;
  }
  return html;
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

function num_(v) {
  return v === null || v === undefined ? 0 : Number(v);
}

function money_(v) {
  const n = Math.round(num_(v));
  return n === 0 ? '' : '$' + n.toLocaleString('en-US');
}

function esc_(v) {
  return v === null || v === undefined ? '' : String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
