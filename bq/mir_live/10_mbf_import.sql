-- MIR_Live.mbf_import — the MediaOcean reference rows (the pink strip on the forecast page's Media and Labs tabs)
-- in Bulk Edit's import layout, built from a MIR in PCC_Dashboard_NATIVE's layout.
--
-- Replaces the manual MIR's four pivots (MBF_Media_$CAD / $USD, MBF_Labs_$CAD / $USD) and the MBF_Import Media /
-- Labs tabs pasted from them. Same rules as the pivots:
--   - one row per client × year × channel (Media) or Labs partner (Labs) × estimate, months Jan–Dec;
--   - CAD clients (MEDIABOX_FO_CURRENCY = 'CAD') in NET_ORDERED_CAD, USD clients in NET_ORDERED (as the $USD
--     pivots: buys in CAD on a USD client stay in CAD);
--   - Media keeps the eight Forecaster channels, Labs the Labs partners the pivots list;
--   - rows with no Forecaster client id are left out (the import would reject them).
-- Columns are Bulk Edit's export columns, in order (spaces as underscores; Type = "Media Type" or "Partner"):
-- paste the rows under the header of a sheet exported from Bulk Edit (Admin Input, Media + Labs). The estimate
-- goes in Level 1, so each row is a detail line and the channel row is their sum.
--
-- Checked 2026-11-02: on PCC_Dashboard_NATIVE (MIR OCT 27) it gives the manual MBF_Import tabs to the dollar
-- (5,285 Media and 1,225 Labs lines, no month off by more than $1; the QA external tables
-- MIR_Live.manual_mbf_media / manual_mbf_labs read those tabs). The automated MIR of the same evening
-- (MIR_Live_snapshots.MIR_NATIVE_20261027) is +0.16 % on Media and +0.39 % on Labs for 2026; most of the
-- difference is TV and radio (Spot), see README.
--
--   SELECT * FROM `plusco-media-invest-solutions.MIR_Live.mbf_import`(
--     TABLE `plusco-media-invest-solutions.MIR_Live.MIR_NATIVE`, 'media', 'MIR LIVE 2026-11-02')
--   WHERE Year = '2026' ORDER BY ClientId, Type, Level_1;
--
-- QA: the same call on PCC_Dashboard_NATIVE (the last manual MIR) gives the manual MBF_Import tabs.

CREATE OR REPLACE TABLE FUNCTION `plusco-media-invest-solutions.MIR_Live.mbf_import`(
  mir TABLE<ESTIMATE STRING, MONTH STRING, PLUSCO_YEAR STRING, PLUSCO_CLIENT_ID STRING, PLUSCO_CLIENT_NAME STRING,
            MEDIABOX_FO_CURRENCY STRING, PLUSCO_MEDIA_CHANNEL STRING, Labs_Partners STRING,
            NET_ORDERED FLOAT64, NET_ORDERED_CAD FLOAT64>,
  axis STRING,
  source_label STRING)
AS (
  WITH lines AS (
    SELECT
      PLUSCO_CLIENT_ID AS client_id,
      PLUSCO_CLIENT_NAME AS client_name,
      PLUSCO_YEAR AS year,
      IF(axis = 'media', PLUSCO_MEDIA_CHANNEL, Labs_Partners) AS type,
      ESTIMATE AS estimate,
      CAST(SUBSTR(MONTH, 6, 2) AS INT64) AS m,
      IF(MEDIABOX_FO_CURRENCY = 'USD', NET_ORDERED, NET_ORDERED_CAD) AS amount
    FROM mir
    WHERE MEDIABOX_FO_CURRENCY IN ('CAD', 'USD')
      AND PLUSCO_CLIENT_ID IS NOT NULL AND PLUSCO_CLIENT_ID NOT IN ('', '#N/A', 'no match')
      AND IF(axis = 'media',
        PLUSCO_MEDIA_CHANNEL IN ('Digital Direct', 'OOH', 'Print', 'Programmatic', 'Radio', 'SEM', 'Social', 'TV'),
        Labs_Partners IN ('AMAZON', 'BILLUPS-OOH', 'BILLUPS-PRINT', 'MIQ-PROG', 'MIQ-SOCIAL', 'QUANTCAST', 'REDDIT',
                          'STACKADAPT', 'YAHOO'))
  ),
  -- The pivots show a month only when it has a line, so an exact 0 is kept and an empty month stays NULL.
  sums AS (
    SELECT client_id, ANY_VALUE(client_name) AS client_name, year, type, estimate, m, ROUND(SUM(amount), 2) AS amount
    FROM lines
    GROUP BY client_id, year, type, estimate, m
  )
  SELECT
    client_id AS ClientId,
    ANY_VALUE(client_name) AS ClientName,
    year AS Year,
    'ANNUAL' AS RFQ,
    'Admin' AS Section,
    source_label AS Project,
    type AS Type,
    '' AS Note,
    estimate AS Level_1,
    '' AS Level_2,
    '' AS Level_3,
    MAX(IF(m = 1, amount, NULL)) AS Jan,
    MAX(IF(m = 2, amount, NULL)) AS Feb,
    MAX(IF(m = 3, amount, NULL)) AS Mar,
    MAX(IF(m = 4, amount, NULL)) AS Apr,
    MAX(IF(m = 5, amount, NULL)) AS May,
    MAX(IF(m = 6, amount, NULL)) AS Jun,
    MAX(IF(m = 7, amount, NULL)) AS Jul,
    MAX(IF(m = 8, amount, NULL)) AS Aug,
    MAX(IF(m = 9, amount, NULL)) AS Sep,
    MAX(IF(m = 10, amount, NULL)) AS Oct,
    MAX(IF(m = 11, amount, NULL)) AS Nov,
    MAX(IF(m = 12, amount, NULL)) AS Dec
  FROM sums
  GROUP BY client_id, year, type, estimate
);
