-- MIR_Live.build_mir_table — builds the MIR fact (MCPE × month × vendor × buy type) with the
-- same dimensions as mediaocean-data.L2_Media.MIR_automated_PROC, fixing four of its Spot issues:
--
--   1. Month: the whole spot goes to the calendar month of spot_date (what MediaOcean's report
--      and the manual MIR do). The original spread each spot over its rotation days into
--      broadcast months (±20 % per month). Note: the manual MIR has no spots dated Dec 29–31, 2025
--      (its yearly pulls cover broadcast years, which split at Mon Dec 29); they stay here, in 2025-12.
--   2. Billable/payable are no longer counted once per month a spot touches.
--   3. Station → vendor uses a TRIMmed station code against the live station views (spot_radio /
--      spot_tv / spot_network), not the stale L2_Media.spot_vendor_buy_xref (last built Jan 2026).
--      Untrimmed codes and new stations were silently dropped (~$4M of 2026 spend).
--   4. Unmatched stations are kept (vendor = station code, attributes 'no match'), never dropped.
-- Spot is read from a spot-history table (see 02_refresh_spot_history.sql), so months that fall
-- out of MediaOcean's extract window stay in the MIR.
-- Prisma: programmatic package headers are dropped (their child placements carry the same dollars).
--
-- Args: spot_history_table — e.g. 'plusco-media-invest-solutions.MIR_Live.spot_history'
--       target_table       — e.g. 'plusco-media-invest-solutions.MIR_Live.MIR'
--       source_label       — written to SOURCE, e.g. 'MIR AUTO 2026-10-20'

CREATE OR REPLACE PROCEDURE `plusco-media-invest-solutions.MIR_Live.build_mir_table`(
  spot_history_table STRING, target_table STRING, source_label STRING)
BEGIN
  DECLARE sql STRING DEFAULT r'''
CREATE OR REPLACE TABLE `{{TARGET}}`
OPTIONS (description = 'Automated MIR (bq/mir_live/03_build_mir_table.sql). Source: {{SOURCE}}')
AS
WITH
params AS (
  SELECT '2025-01' AS start_month, NUMERIC '1.3978' AS usd_to_cad
),
-- Station → vendor lookup, rebuilt from the live views on every run.
station_xref AS (
  SELECT media_code, TRIM(station_code_buy_xref) AS station_code, ANY_VALUE(vendor_code) AS vendor_code
  FROM (
    SELECT media_code, vendor_code, vendor_code AS station_code_buy_xref FROM `mediaocean-data.L2_Media.spot_radio`
    UNION ALL
    SELECT media_code, vendor_code, station_code_buy_xref FROM `mediaocean-data.L2_Media.spot_tv`
    UNION ALL
    SELECT media_code, vendor_code, station_code_buy_xref FROM `mediaocean-data.L2_Media.spot_network`
  )
  WHERE station_code_buy_xref IS NOT NULL AND station_code_buy_xref != 'no buys'
  GROUP BY 1, 2
),
spot AS (
  SELECT
    h.media_code,
    h.client_code,
    h.product_code,
    h.estimate_code,
    CONCAT(h.media_code, '-', h.client_code, '-', h.product_code, '-', h.estimate_code) AS MCPE,
    FORMAT_DATE('%Y-%m', h.spot_date) AS month,
    -- Some stations are already stored in vendor form (e.g. 'CKY N'); keep the station code when nothing matches.
    COALESCE(x.vendor_code, mv.vendor_code, h.station_code) AS vendor_code,
    'spot media' AS buy_type,
    h.ordered_net,
    h.post_aff_net
  FROM `{{SPOT}}` h
  LEFT JOIN station_xref x
    ON x.media_code = h.media_code AND x.station_code = h.station_code
  LEFT JOIN `mediaocean-data.L2_Media.master_vendor` mv
    ON mv.media_code = h.media_code AND mv.vendor_code = h.station_code
  -- Exclude Horizon
  WHERE SUBSTR(h.client_code, 2, 1) != 'H'
),
-- Prisma: same logic as MIR_automated_PROC (MIR 1b).
prisma AS (
  SELECT
    AP.media_code,
    AP.advertiser_code AS client_code,
    AP.product_code,
    AP.estimate_code,
    CONCAT(AP.media_code, '-', AP.advertiser_code, '-', AP.product_code, '-', AP.estimate_code) AS MCPE,
    APM.month,
    AP.supplier_code AS vendor_code,
    AP.buy_type,
    APM.planned_amount AS ordered_net,
    CASE WHEN APM.planned_amount < 0 AND ABS(APM.actual_net_billable) = ABS(APM.planned_amount)
         THEN APM.actual_net_billable * -1 ELSE APM.actual_net_billable END AS billable_net,
    CASE WHEN APM.planned_amount < 0 AND ABS(APM.actual_net_payable) = ABS(APM.planned_amount)
         THEN APM.actual_net_payable * -1 ELSE APM.actual_net_payable END AS payable_net
  FROM `mediaocean-data.mo_raw_prisma.placements` AP
  JOIN `mediaocean-data.mo_raw_prisma.placements_monthly` APM
    ON AP.placement_id = APM.placement_id AND AP.estimate_code = APM.estimate_code
  -- A programmatic package header repeats the total of its child placements (same vendor), so
  -- counting both doubled the spend ($2.0M in 2025). Keep the children, drop the header.
  WHERE AP.placement_id NOT IN (
    SELECT programmatic_header_placement_id FROM `mediaocean-data.mo_raw_prisma.placements`
    WHERE programmatic_header_placement_id IS NOT NULL)
),
fact_detail AS (
  SELECT MCPE, client_code, month, vendor_code, buy_type, ordered_net, post_aff_net AS billable_net, post_aff_net AS payable_net FROM spot
  UNION ALL
  SELECT MCPE, client_code, month, vendor_code, buy_type, ordered_net, billable_net, payable_net FROM prisma
),
fact AS (
  SELECT
    f.MCPE, f.month, f.vendor_code, f.buy_type,
    SUM(COALESCE(f.ordered_net, 0)) AS NET_ORDERED,
    SUM(COALESCE(IF(MC.client_currency_mo = 'USD', f.ordered_net * p.usd_to_cad, f.ordered_net), 0)) AS NET_ORDERED_CAD,
    SUM(COALESCE(f.billable_net, 0)) AS BILLABLE_NET,
    SUM(COALESCE(f.payable_net, 0)) AS PAYABLE_NET
  FROM fact_detail f
  JOIN `mediaocean-data.L2_Media.master_client` MC ON MC.client_code = f.client_code
  CROSS JOIN params p
  WHERE f.month >= p.start_month
  GROUP BY 1, 2, 3, 4
),
extract_dates AS (
  SELECT
    (SELECT MAX(extract_date) FROM `mediaocean-data.mo_raw_print.print_agency`) AS print_extract_date,
    (SELECT MAX(extract_date) FROM `mediaocean-data.mo_raw_spot.spot_agency`) AS spot_extract_date
),
cal AS (
  SELECT DISTINCT civic_month, civic_quarter, civic_year FROM `mediaocean-data.L2_Media.master_calendar`
),
dim_mcpe AS (
  SELECT
    ME.MCPE, ME.media_code, MM.media_name, ME.client_code, MC.client_name, ME.product_code, MP.product_name,
    ME.estimate_code, ME.estimate_name, MP.bill_formula,
    MC.agency_code AS office_code, MC.agency_name AS office, MC.client_currency_mo, MC.client_interco_flag,
    MC.plusco_client_name, MC.plusco_client_id, MC.client_status_2026, MC.mediabox_fo_currency,
    MC.agency, MC.business_lead, MC.bu_region, MC.gm_pod
  FROM `mediaocean-data.L2_Media.master_estimate` ME
  JOIN `mediaocean-data.L2_Media.master_media` MM ON ME.media_code = MM.media_code
  JOIN `mediaocean-data.L2_Media.master_client` MC ON ME.client_code = MC.client_code
  JOIN `mediaocean-data.L2_Media.master_product` MP
    ON ME.product_code = MP.product_code AND ME.media_code = MP.media_code AND ME.client_code = MP.client_code
)
SELECT
  '{{SOURCE}}' AS SOURCE,
  FORMAT_DATETIME('%Y-%m-%d %H:%M', CURRENT_DATETIME('America/Montreal')) AS REPORT_DATE_edt,
  CASE WHEN d.media_code IN ('I','O','M','B') THEN FORMAT_DATETIME('%Y-%m-%d %H:%M', DATETIME(ed.print_extract_date, 'America/New_York'))
       WHEN d.media_code IN ('T','N','R','C') THEN FORMAT_DATETIME('%Y-%m-%d %H:%M', DATETIME(ed.spot_extract_date, 'America/New_York'))
  END AS MO_Date_edt,
  d.media_code AS MEDIA_CODE,
  d.media_name AS MEDIA_NAME,
  d.client_code AS CLIENT_CODE,
  d.client_name AS CLIENT_NAME,
  d.product_code AS PRODUCT_CODE,
  d.product_name AS PRODUCT_NAME,
  d.estimate_code AS ESTIMATE_CODE,
  d.estimate_name AS ESTIMATE_NAME,
  f.MCPE,
  -- Key as written in the manual MIR (Network rows use a 'T-' prefix there).
  IF(d.media_code = 'N', CONCAT('T', SUBSTR(f.MCPE, 2)), f.MCPE) AS MCPE_MIR,
  f.vendor_code AS VENDOR_CODE,
  COALESCE(v.vendor_name, 'no match') AS VENDOR_NAME,
  f.month AS MONTH,
  COALESCE(v.payrep_code, 'no match') AS PAYREP_CODE,
  COALESCE(v.payrep, 'no match') AS PAYREP,
  f.buy_type AS BUY_TYPE,
  d.office_code AS OFFICE_CODE,
  d.office AS OFFICE,
  c.civic_quarter AS PLUSCO_QUARTER,
  c.civic_year AS PLUSCO_YEAR,
  f.NET_ORDERED,
  f.NET_ORDERED_CAD,
  f.BILLABLE_NET,
  f.PAYABLE_NET,
  d.bill_formula AS BILLING_FORMULA,
  IF(d.client_interco_flag, 'YES', 'NO') AS CLIENT_INTERCO,
  d.plusco_client_name AS PLUSCO_CLIENT_NAME,
  d.plusco_client_id AS PLUSCO_CLIENT_ID,
  d.client_currency_mo AS CLIENT_CURRENCY_MO,
  d.client_status_2026 AS CLIENT_STATUS_IN_2026,
  d.mediabox_fo_currency AS MEDIABOX_FO_CURRENCY,
  d.agency AS AGENCY,
  d.business_lead AS BUSINESS_LEAD,
  d.bu_region AS BU_REGION,
  d.gm_pod AS GM_POD,
  COALESCE(v.vendor_code_mir, 'no match') AS VENDOR_CODE_MIR,
  COALESCE(v.plusco_media_channel, 'no match') AS PLUSCO_MEDIA_CHANNEL,
  COALESCE(v.plusco_programmatic, 'no match') AS PLUSCO_PROGRAMMATIC,
  COALESCE(v.plusco_pay_rep, 'no match') AS PLUSCO_PAY_REP,
  COALESCE(v.plusco_deals_2026, 'no match') AS PLUSCO_2026_DEALS,
  COALESCE(v.plusco_deals_category, 'no match') AS PLUSCO_DEALS_Category,
  COALESCE(v.plusco_deals_channel, 'no match') AS PLUSCO_DEALS_Channel,
  COALESCE(v.plusco_deals_type, 'no match') AS PLUSCO_DEALS_Type,
  COALESCE(v.plusco_media_partner, 'no match') AS PLUSCO_MEDIA_PARTNER,
  COALESCE(v.plusco_partner_rephousetag, 'no match') AS PLUSCO_PARTNER_RepHouseTag,
  COALESCE(v.plusco_media_owner, 'no match') AS PLUSCO_MEDIA_OWNER,
  COALESCE(v.plusco_local_media, 'no match') AS PLUSCO_LOCAL_MEDIA,
  COALESCE(v.plusco_vendor_country, 'no match') AS PLUSCO_VENDOR_COUNTRY,
  COALESCE(v.plusco_vendor_province, 'no match') AS PLUSCO_VENDOR_PROVINCE,
  COALESCE(v.plusco_vendor_language, 'no match') AS PLUSCO_VENDOR_LANGUAGE,
  COALESCE(v.plusco_vendor_language_detail, 'no match') AS PLUSCO_VENDOR_LANGUAGE_Detail,
  COALESCE(v.plusco_vendor_audience, 'no match') AS PLUSCO_VENDOR_AUDIENCE,
  COALESCE(v.plusco_conventional_specialty, 'no match') AS PLUSCO_CONVENTIONAL_SPECIALTY,
  COALESCE(v.spot_type, 'no match') AS SPOT_Type,
  COALESCE(v.spot_conv_spec_networks, 'no match') AS SPOT_CONV_SPEC_NETWORKS,
  COALESCE(v.spot_market_code, 'no match') AS SPOT_MARKET_CODE,
  COALESCE(v.spot_market_name, 'no match') AS SPOT_MARKET_NAME
FROM fact f
JOIN dim_mcpe d ON f.MCPE = d.MCPE
LEFT JOIN `mediaocean-data.L2_Media.master_vendor` v
  ON v.vendor_code = f.vendor_code AND v.media_code = d.media_code
JOIN cal c ON f.month = c.civic_month
CROSS JOIN extract_dates ed
''';

  SET sql = REPLACE(REPLACE(REPLACE(sql, '{{TARGET}}', target_table), '{{SPOT}}', spot_history_table), '{{SOURCE}}', source_label);
  EXECUTE IMMEDIATE sql;

  EXECUTE IMMEDIATE FORMAT('''
    INSERT INTO `plusco-media-invest-solutions.MIR_Live.run_log` (run_at, step, detail, rows_out, net_ordered_cad)
    SELECT CURRENT_TIMESTAMP(), 'build_mir_table', '%s <- %s', COUNT(*), SUM(NET_ORDERED_CAD) FROM `%s`''',
    target_table, spot_history_table, target_table);
END;
