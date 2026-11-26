/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS helper scripts (see README.md) */
// MIR (Mediaocean) booked net for the demo partners, 2026, by client x month x channel.
const { BigQuery } = require("@google-cloud/bigquery");
const fs = require("fs");

const QUERY = `
  SELECT PLUSCO_MEDIA_PARTNER AS partner, PLUSCO_CLIENT_NAME AS client, MONTH AS month,
    UPPER(PLUSCO_MEDIA_CHANNEL) AS channel, AGENCY AS agency, SUM(NET_ORDERED_CAD) AS net
  FROM \`plusco-media-invest-solutions.PCC_Media_Investment.PCC_Dashboard_NATIVE\`
  WHERE PLUSCO_YEAR = '2026' AND PLUSCO_MEDIA_PARTNER IN ('QUANTCAST', 'AMAZON', 'BILLUPS')
    AND PLUSCO_MEDIA_CHANNEL != 'N/A'
  GROUP BY 1, 2, 3, 4, 5`;

(async () => {
  const bq = new BigQuery({ projectId: "plusco-media-invest-solutions" });
  const [rows] = await bq.query({ query: QUERY, location: "northamerica-northeast1" });
  const [[src]] = await bq.query({
    query: "SELECT ANY_VALUE(SOURCE) AS s FROM `plusco-media-invest-solutions.PCC_Media_Investment.PCC_Dashboard_NATIVE` WHERE PLUSCO_YEAR='2026'",
    location: "northamerica-northeast1",
  });
  const out = rows.map((r) => ({ ...r, net: Number(r.net) || 0 }));
  fs.writeFileSync("in/mir.json", JSON.stringify({ source: src.s, rows: out }));
  const by = {};
  for (const r of out) by[`${r.partner}|${r.channel}`] = Math.round((by[`${r.partner}|${r.channel}`] || 0) + r.net);
  console.log(src.s, out.length, by);
})();
