/**
 * MIR daily e-mail: data health + clients and vendors to confirm.
 *
 * 8 AM, every day: health of the raw MediaOcean data and of last night's MIR build (MIR_Live.raw_health,
 * bq/mir_live/11_raw_health.sql — the automated version of Yves's QA_Refresh sheet), then the clients and vendors
 * the MIR couldn't tag (MIR_Live.exceptions, 07_exceptions.sql): new ones daily, the full open list on Mondays.
 * Always sent to ALWAYS; also to RECIPIENTS when there is something to act on (new items, a data problem, Monday).
 * 3 PM: today's loads are checked again; an alert goes to ALERT_TO only if something is wrong, in time to reach
 * MediaOcean before the 5 PM build.
 *
 * Setup (once, signed in as the schedule owner):
 *   1. script.google.com → New project → paste this file.
 *   2. Services (+) → BigQuery API → Add.
 *   3. Run `installTrigger` and accept the permissions (BigQuery, Gmail send).
 *   4. Optional: run `sendNow` to get today's e-mail immediately, `healthCheckNow` for the 3 PM check.
 */

const PROJECT_ID = 'plusco-media-invest-solutions';
const ALWAYS = ['noble.nelson@pluscompany.com'];
const RECIPIENTS = ['noble.nelson@pluscompany.com', 'adriana.novoa@pluscompany.com'];
const ALERT_TO = ['noble.nelson@pluscompany.com'];
const MO_CLIENT_KEY_URL = 'https://docs.google.com/spreadsheets/d/1XhxXJK4UjnW9vrUMUB24MpQzFbN0FGROt4OTFkuEnVM/edit';
const VENDOR_DB_URL = 'https://docs.google.com/spreadsheets/d/1RBhj3hvQf2PwmsTZfFwg_DHTfRs4lesS2KpYEpwcTtQ/edit';
const QA_REFRESH_URL = 'https://docs.google.com/spreadsheets/d/1UiujnZzJyF7dvT4btqfG5X2SfxNThXBw8DZ2qOjtBzo/edit';
const DATASETS = [['mo_raw_prisma', 'Prisma (digital)'], ['mo_raw_print', 'Print'], ['mo_raw_spot', 'Spot (TV, radio)'],
  ['mo_raw_io', 'Prisma invoices'], ['L2_Media', 'Master tables']];
const RED = '#f54236', YELLOW = '#ffc929';

/** 8 AM daily e-mail (the MIR rebuilds at 5 PM the evening before) and the 3 PM data check, Montreal time. */
function installTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(t => ['dailyEmail', 'healthCheck'].includes(t.getHandlerFunction()))
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('dailyEmail').timeBased().everyDays(1).atHour(8).inTimezone('America/Montreal').create();
  ScriptApp.newTrigger('healthCheck').timeBased().everyDays(1).atHour(15).inTimezone('America/Montreal').create();
}

function dailyEmail() {
  send_(false);
}

function sendNow() {
  send_(true);
}

function send_(force) {
  // With the auto-fill (mir_auto_fill.gs, 7 AM), the suggestion says what was written and whether it is a doubt.
  const rows = query_(`
    SELECT e.kind, e.issue, e.code, e.name, e.agency, e.media, e.cad_2025, e.cad_2026, e.cad_2027, e.lines,
           e.sample_estimate,
           CASE
             WHEN f.code IS NULL THEN e.suggestion
             WHEN f.kind = 'vendor' THEN CONCAT(IF(f.sure, 'Auto-filled: ', 'Auto-filled, to confirm (yellow): '),
               JSON_VALUE(f.row_json, '$.PLUSCO_MEDIA_CHANNEL'), ' / ', JSON_VALUE(f.row_json, '$.PLUSCO_MEDIA_PARTNER'))
             ELSE CONCAT(IF(f.sure, 'Auto-filled: ', 'Auto-filled, to confirm (yellow): '),
               IFNULL(JSON_VALUE(f.row_json, '$.forecaster_client_name'), 'client left blank'))
           END AS suggestion,
           CAST(e.first_seen AS STRING) AS first_seen, e.is_new, CAST(e.as_of AS STRING) AS as_of
    FROM \`${PROJECT_ID}.MIR_Live.exceptions\` e
    LEFT JOIN \`${PROJECT_ID}.MIR_Live.fill_suggestions\` f ON f.kind = e.kind AND f.code = e.code
    ORDER BY e.kind, e.issue, ABS(e.cad_2025) + ABS(e.cad_2026) + ABS(e.cad_2027) DESC`);
  const isMonday = new Date().getDay() === 1;
  const fresh = rows.filter(r => r.is_new === 'true' && r.code !== 'NETWORK GROUPS');
  const health = health_();

  const asOf = rows.length ? rows[0].as_of : Utilities.formatDate(new Date(), 'America/Montreal', 'yyyy-MM-dd');
  const open = rows.filter(r => r.code !== 'NETWORK GROUPS');
  const gap = rows.find(r => r.code === 'NETWORK GROUPS');
  const clients = open.filter(r => r.kind === 'client').length;
  const vendors = open.filter(r => r.kind === 'vendor').length;

  let html = `<div style="font-family:Arial,sans-serif;font-size:13px;color:#222">`;
  html += healthSection_(health);
  html += `<h3 style="margin:22px 0 6px">Clients and vendors</h3>`;
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
  html += `<p style="color:#888;font-size:11px">Source: BigQuery ${PROJECT_ID}.MIR_Live.raw_health, run_log and exceptions</p></div>`;

  const notable = force || isMonday || fresh.length > 0 || !health.ok;
  const subject = `MIR daily: ${health.ok ? 'data OK' : '⚠ ' + health.headline}`
    + ` · ${fresh.length ? fresh.length + ' new client(s)/vendor(s) to confirm' : 'nothing new to confirm'} (${asOf})`;
  GmailApp.sendEmail((notable ? RECIPIENTS : ALWAYS).join(','), subject, 'This e-mail needs an HTML-capable client.',
    { htmlBody: html, name: 'Automated MIR' });
}

// ---------------------------------------------------------------------------------------------------------------
// Data health

/** 3 PM: today's loads; e-mails ALERT_TO only when something is wrong. */
function healthCheck() {
  checkToday_(false);
}

function healthCheckNow() {
  checkToday_(true);
}

function checkToday_(force) {
  const issues = query_(`
    SELECT severity, CAST(day AS STRING) AS day, ds, tbl, check_name, message
    FROM \`${PROJECT_ID}.MIR_Live.raw_health\`(CURRENT_DATETIME('America/Montreal'))
    WHERE day = CURRENT_DATE('America/Montreal') AND severity IN ('error', 'warning')
    ORDER BY severity, ds, tbl`);
  if (!issues.length && !force) return;
  const errors = issues.filter(r => r.severity === 'error').length;
  let html = `<div style="font-family:Arial,sans-serif;font-size:13px;color:#222">`;
  if (!issues.length) {
    html += `<p>Today's MediaOcean loads look normal.</p>`;
  } else {
    html += `<p><b>Today's MediaOcean data has ${issues.length} problem(s)${errors ? '' : ' (warnings only)'}.</b>`
      + ` The MIR rebuilds at 5 PM with whatever has arrived by then.</p>`;
    html += issuesTable_(issues);
    html += `<p>What to do: confirm it in Yves's <a href="${QA_REFRESH_URL}">QA_Refresh sheet</a>; if it's real, write to`
      + ` Yves St-Laurent (Munvo) and Elias Makrides at MediaOcean (emakrides@mediaocean.com, Bulk Data).`
      + ` A table "unchanged" for several loads means MediaOcean keeps sending the same data: the MIR still builds,`
      + ` but bookings made since then are missing from it.</p>`;
  }
  html += `<p style="color:#888;font-size:11px">Source: BigQuery ${PROJECT_ID}.MIR_Live.raw_health (mediaocean-data.mo_raw_QA.mo_raw_counts)</p></div>`;
  const what = [...new Set(issues.map(r => label_(r.ds)))].join(', ');
  const subject = issues.length ? `MIR data alert: ${what} (${issues[0].day})` : 'MIR data check: OK';
  GmailApp.sendEmail(ALERT_TO.join(','), subject, 'This e-mail needs an HTML-capable client.', { htmlBody: html, name: 'Automated MIR' });
}

/** Raw data issues (last 7 days), the per-day load grid and last night's build. */
function health_() {
  const now = `CURRENT_DATETIME('America/Montreal')`;
  const issues = query_(`
    SELECT severity, CAST(day AS STRING) AS day, ds, tbl, check_name, message
    FROM \`${PROJECT_ID}.MIR_Live.raw_health\`(${now}) WHERE severity != 'pending'
    ORDER BY day DESC, CASE severity WHEN 'error' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, ds, tbl`);
  const days = query_(`
    SELECT ds, CAST(day AS STRING) AS day, status, FORMAT_TIME('%H:%M', last_time) AS time, total_rows, change_rows
    FROM \`${PROJECT_ID}.MIR_Live.raw_load_days\`(${now})`);
  const runs = query_(`
    SELECT step, detail, CAST(net_ordered_cad AS STRING) AS cad, FORMAT_TIMESTAMP('%b %d %H:%M', run_at, 'America/Montreal') AS run_time
    FROM \`${PROJECT_ID}.MIR_Live.run_log\`
    WHERE run_at > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 52 HOUR) AND step IN ('checks', 'build_native')
    ORDER BY run_at DESC`);

  // Last night's build: its 'checks' row (the MIR) and 'build_native' row (the MIR report); the run before it for the change.
  const checks = runs.filter(r => r.step === 'checks');
  const lastNative = runs.find(r => r.step === 'build_native');
  let build;
  if (!checks.length) {
    build = { ok: false, text: 'The MIR build did not run last night (nothing in MIR_Live.run_log).' };
  } else if (/^FAILED/.test(checks[0].detail)) {
    build = { ok: false, text: `Last night's MIR build stopped: ${checks[0].detail}. The MIR keeps the previous day.` };
  } else if (lastNative && /^FAILED/.test(lastNative.detail)) {
    build = { ok: false, text: `The MIR was rebuilt but the MIR report (MIR_NATIVE) failed: ${lastNative.detail}` };
  } else {
    const change = checks[1] ? num_(checks[0].cad) - num_(checks[1].cad) : null;
    build = { ok: true, text: `Last night's MIR build: OK (${checks[0].run_time}), total ${money_(checks[0].cad)}`
      + (change === null ? '' : ` (${change >= 0 ? '+' : '−'}${money_(Math.abs(change)) || '$0'} vs the build before)`) + '.' };
  }

  const today = Utilities.formatDate(new Date(), 'America/Montreal', 'yyyy-MM-dd');
  const yesterday = Utilities.formatDate(new Date(Date.now() - 864e5), 'America/Montreal', 'yyyy-MM-dd');
  const recent = issues.filter(r => r.day >= yesterday);
  const errors = recent.filter(r => r.severity === 'error');
  const ok = build.ok && !errors.length;
  const headline = !build.ok ? 'MIR build problem' : `${[...new Set(errors.map(r => label_(r.ds)))].join(', ')} data problem`;
  return { ok, headline, build, issues, recent, days, today };
}

function healthSection_(h) {
  let html = `<h3 style="margin:4px 0 6px">Data health</h3>`;
  html += `<p style="margin:4px 0">${h.build.ok ? '✅' : '⚠️'} ${esc_(h.build.text)}</p>`;
  if (!h.recent.some(r => r.severity !== 'info')) {
    html += `<p style="margin:4px 0">✅ Raw MediaOcean data: every load since yesterday looks normal (today's later loads are checked at 3 PM).</p>`;
  }
  if (h.recent.length) html += issuesTable_(h.recent);
  html += grid_(h);
  html += `<p style="color:#888;font-size:11px">Rows after each load (F = weekly full refresh, P = daily update) and the change vs the previous load.`
    + ` Red = problem, yellow = warning. Table by table: <a href="${QA_REFRESH_URL}">QA_Refresh</a>.</p>`;
  return html;
}

function issuesTable_(issues) {
  let html = `<table cellpadding="4" style="border-collapse:collapse;font-size:12px;margin:6px 0">`;
  issues.forEach(r => {
    const bg = r.severity === 'error' ? RED : r.severity === 'warning' ? YELLOW : '#eee';
    const fg = r.severity === 'error' ? '#fff' : '#222';
    html += `<tr><td style="background:${bg};color:${fg}">${esc_(r.severity)}</td><td>${esc_(r.day)}</td>`
      + `<td><b>${esc_(label_(r.ds))}</b>${r.tbl ? ' · ' + esc_(r.tbl) : ''}</td><td>${esc_(r.message)}</td></tr>`;
  });
  return html + `</table>`;
}

/** Datasets × last 7 days, like the QA_Refresh sheet but one line per dataset. */
function grid_(h) {
  const dates = [...new Set(h.days.map(d => d.day))].sort();
  const worst = {};
  h.issues.forEach(r => {
    const k = r.ds + '|' + r.day;
    if (r.severity === 'error' || (r.severity === 'warning' && worst[k] !== 'error')) worst[k] = r.severity;
  });
  let html = `<table cellpadding="4" style="border-collapse:collapse;font-size:11px;margin:8px 0"><tr style="background:#222;color:#fff"><th></th>`;
  dates.forEach(d => {
    const label = Utilities.formatDate(Utilities.parseDate(d, 'America/Montreal', 'yyyy-MM-dd'), 'America/Montreal', 'EEE MMM d');
    html += `<th>${label}</th>`;
  });
  html += `</tr>`;
  DATASETS.filter(([ds]) => ds !== 'L2_Media').forEach(([ds, name]) => {
    html += `<tr><td><b>${name}</b></td>`;
    dates.forEach(d => {
      const x = h.days.find(r => r.ds === ds && r.day === d);
      const w = worst[ds + '|' + d];
      const style = w === 'error' ? `background:${RED};color:#fff` : w === 'warning' ? `background:${YELLOW}` : 'background:#f4f4f4';
      const cell = x ? `${x.status.charAt(0)} ${x.time}<br>${rows_(x.total_rows)} (${signed_(x.change_rows)})` : '—';
      html += `<td align="center" style="${style}">${cell}</td>`;
    });
    html += `</tr>`;
  });
  return html + `</table>`;
}

function label_(ds) {
  const hit = DATASETS.find(([k]) => k === ds);
  return hit ? hit[1] : ds;
}

function rows_(v) {
  const n = num_(v);
  return n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'k' : String(n);
}

function signed_(v) {
  if (v === null || v === undefined) return 'n/a';
  const n = num_(v);
  const a = Math.abs(n);
  const s = a >= 1e6 ? (a / 1e6).toFixed(2) + 'M' : a >= 1e3 ? (a / 1e3).toFixed(1) + 'k' : String(a);
  return (n < 0 ? '−' : '+') + s;
}

// ---------------------------------------------------------------------------------------------------------------
// Clients and vendors

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
