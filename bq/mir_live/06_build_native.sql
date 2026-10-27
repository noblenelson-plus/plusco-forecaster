-- MIR_Live.build_native — the automated MIR in the manual MIR's layout: the same 72 columns,
-- in the same order and with the same types, as PCC_Media_Investment.PCC_Dashboard_NATIVE.
--
-- Built from MIR_Live.MIR (amounts, MediaOcean keys) plus the same lookups and rules the
-- manual sheet uses:
--   Clients  Finance_mediabox.MO_Client_Key (by client code; intercompany clients by
--            client + product code), then the Forecaster clients (pluscoops.forecaster_1).
--   Vendors  Finance_mediabox.MIR_VENDOR_DATABASE ("Vendor Database 2.0"), by VENDOR_CODE_MIR.
--   Rules    PBB = SREP present; Programmatic & SEM split; MIQ + Social buy type; Labs partners;
--            NET_ORDERED_CAD = NET_ORDERED × 1.3978 for USD clients.
--   MediaOcean fields the export carries: PO (estimate user field 1), SREP (Spot special rep),
--            billed / paid (print_buy_summary for Prisma, spot billed / paid summaries for Spot).
--   NATIVE's own columns (Labs targets, IS_LABS_PARTNER, MediaBox client) as in its query.
--
-- Args: mir_table    — e.g. 'plusco-media-invest-solutions.MIR_Live.MIR'
--       target_table — e.g. 'plusco-media-invest-solutions.MIR_Live.MIR_NATIVE'
--       source_label — written to SOURCE, e.g. 'MIR LIVE 2026-10-27'

CREATE OR REPLACE PROCEDURE `plusco-media-invest-solutions.MIR_Live.build_native`(
  mir_table STRING, target_table STRING, source_label STRING)
BEGIN
  DECLARE sql STRING DEFAULT r'''
CREATE OR REPLACE TABLE `{{TARGET}}`
OPTIONS (description = 'Automated MIR in the PCC_Dashboard_NATIVE layout (bq/mir_live/06_build_native.sql). Source: {{SOURCE}}')
AS
WITH
-- MediaOcean strings carry a case-insensitive collation; drop it so regex and output behave like NATIVE.
mir AS (
  SELECT
    COLLATE(MEDIA_CODE, '') AS MEDIA_CODE, COLLATE(MEDIA_NAME, '') AS MEDIA_NAME,
    COLLATE(CLIENT_CODE, '') AS CLIENT_CODE, COLLATE(CLIENT_NAME, '') AS CLIENT_NAME,
    COLLATE(PRODUCT_CODE, '') AS PRODUCT_CODE, COLLATE(PRODUCT_NAME, '') AS PRODUCT_NAME,
    COLLATE(ESTIMATE_CODE, '') AS ESTIMATE_CODE, COLLATE(ESTIMATE_NAME, '') AS ESTIMATE_NAME,
    COLLATE(MCPE, '') AS MCPE, COLLATE(MCPE_MIR, '') AS MCPE_MIR,
    COLLATE(VENDOR_CODE, '') AS VENDOR_CODE, COLLATE(VENDOR_CODE_MIR, '') AS VENDOR_CODE_MIR, COLLATE(VENDOR_NAME, '') AS VENDOR_NAME,
    COLLATE(MONTH, '') AS MONTH, COLLATE(PAYREP_CODE, '') AS PAYREP_CODE, COLLATE(PAYREP, '') AS PAYREP,
    COLLATE(BUY_TYPE, '') AS BUY_TYPE, CAST(OFFICE_CODE AS STRING) AS OFFICE_CODE, COLLATE(OFFICE, '') AS OFFICE,
    COLLATE(PLUSCO_QUARTER, '') AS PLUSCO_QUARTER, COLLATE(PLUSCO_YEAR, '') AS PLUSCO_YEAR,
    COLLATE(BILLING_FORMULA, '') AS BILLING_FORMULA,
    NET_ORDERED
  FROM `{{MIR}}`
),
-- PO = the estimate's user field 1 (Prisma estimates live in the print system).
po AS (
  SELECT media_code, client_code, product_code, FORMAT('%03d', est_num) AS estimate_code, ANY_VALUE(user1_value) AS po
  FROM `mediaocean-data.mo_raw_print.print_estimate`
  GROUP BY 1, 2, 3, 4
  UNION ALL
  SELECT IF(media_code = 'C', 'N', media_code), client_code, product_code, FORMAT('%03d', SAFE_CAST(est_code AS INT64)), ANY_VALUE(user1_value)
  FROM `mediaocean-data.mo_raw_spot.spot_estimate`
  WHERE media_code IN ('R', 'T', 'C')
  GROUP BY 1, 2, 3, 4
),
-- SREP = Spot special rep, written "code NAME" like the export.
srep AS (
  SELECT
    SB.media_code, SB.client_code, SB.product_code, FORMAT('%03d', SAFE_CAST(SB.estimate_code AS INT64)) AS estimate_code,
    TRIM(SB.station_code) AS station_code,
    ANY_VALUE(CONCAT(LPAD(CAST(SB.special_rep AS STRING), 3, '0'), ' ', IFNULL(R.rep_name, ''))) AS srep
  FROM `mediaocean-data.mo_raw_spot.spot_buyline` SB
  LEFT JOIN `mediaocean-data.mo_raw_spot.spot_rep` R
    ON R.rep_code = CAST(SB.special_rep AS STRING) AND R.media = IF(SB.media_code = 'N', 'C', SB.media_code)
  WHERE SB.special_rep IS NOT NULL
  GROUP BY 1, 2, 3, 4, 5
),
prisma_billed AS (
  SELECT
    CONCAT(PB.media_code, '-', PB.client_code, '-', PB.product_code, '-', FORMAT('%03d', PB.estimate)) AS MCPE,
    FORMAT_DATE('%Y-%m', PB.insertion_date) AS month,
    PB.pub_number AS vendor_code,
    SUM(PBS.billed_gross - PBS.billed_commission) AS billed_net,
    SUM(PBS.paid_gross - PBS.paid_commission) AS paid_net
  FROM `mediaocean-data.mo_raw_print.print_buy` PB
  JOIN `mediaocean-data.mo_raw_print.print_buy_summary` PBS ON PB.print_buy_key = PBS.print_buy_key
  WHERE PBS.is_buyline_total = 'Y'
  GROUP BY 1, 2, 3
),
spot_billed AS (
  SELECT MCPE, month, vendor_code, SUM(billed_net) AS billed_net, SUM(paid_net) AS paid_net
  FROM (
    SELECT CONCAT(media_code, '-', client_code, '-', product_code, '-', FORMAT('%03d', SAFE_CAST(estimate_code AS INT64))) AS MCPE,
      SUBSTR(CAST(month_start AS STRING), 1, 7) AS month, IF(media_code = 'N', '*', TRIM(station_code)) AS vendor_code, billed_net, 0 AS paid_net
    FROM `mediaocean-data.mo_raw_spot.spot_billed_summary`
    UNION ALL
    SELECT CONCAT(media_code, '-', client_code, '-', product_code, '-', FORMAT('%03d', SAFE_CAST(estimate_code AS INT64))),
      SUBSTR(CAST(month_start AS STRING), 1, 7), IF(media_code = 'N', '*', TRIM(station_code)), 0, paid_net
    FROM `mediaocean-data.mo_raw_spot.spot_paid_summary`
  )
  GROUP BY 1, 2, 3
),
-- MO Client Key: one row per client code, and per client + product for intercompany clients.
mo_key AS (
  SELECT * EXCEPT (rn) FROM (
    SELECT
      TRIM(MO_client_id) AS client_code, TRIM(IFNULL(MO_product_code, '')) AS product_code,
      IFNULL(CLIENT_INTERCO, '') AS client_interco, forecaster_client_id, forecaster_client_name, CLIENT_CURRENCY_MO,
      ROW_NUMBER() OVER (PARTITION BY TRIM(MO_client_id), TRIM(IFNULL(MO_product_code, '')) ORDER BY forecaster_client_id) AS rn
    FROM `plusco-media-invest-solutions.Finance_mediabox.MO_Client_Key`
    WHERE IFNULL(TRIM(MO_client_id), '') != ''
  ) WHERE rn = 1
),
mo_client AS (
  SELECT client_code, ANY_VALUE(client_interco) AS client_interco, ANY_VALUE(forecaster_client_id) AS id,
    ANY_VALUE(forecaster_client_name) AS name, ANY_VALUE(CLIENT_CURRENCY_MO) AS currency
  FROM mo_key GROUP BY 1
),
-- forecaster_1.clients can hold several rows per client (edits); keep the latest.
fc AS (
  SELECT c.client_id, c.agency, c.region, c.business_lead, c.gm_pod, c.currency, s.status
  FROM (
    SELECT * FROM `pluscoops.forecaster_1.clients`
    QUALIFY ROW_NUMBER() OVER (PARTITION BY client_id ORDER BY updated_at DESC) = 1
  ) c
  LEFT JOIN `pluscoops.forecaster_1.clients_status` s ON s.client_id = c.client_id AND s.year = 2026
),
vdb AS (
  SELECT * EXCEPT (rn) FROM (
    SELECT v.*, ROW_NUMBER() OVER (PARTITION BY TRIM(VENDOR_CODE_MIR) ORDER BY VENDOR) AS rn
    FROM `plusco-media-invest-solutions.Finance_mediabox.MIR_VENDOR_DATABASE` v
    WHERE IFNULL(TRIM(VENDOR_CODE_MIR), '') != ''
  ) WHERE rn = 1
),
mediabox AS (
  SELECT tac_billing_id AS MCPE, ANY_VALUE(campaign) AS campaign
  FROM `plusco-media-invest-solutions.Finance_mediabox.finance_Mediabox_combined`
  WHERE tac_billing_id IS NOT NULL
  GROUP BY 1
),
-- The export's client names are MediaOcean's 20-character short names.
client_short AS (
  SELECT client_code, ANY_VALUE(COLLATE(name, '')) AS name
  FROM (
    SELECT client_code, name, 1 AS pri FROM `mediaocean-data.mo_raw_print.print_client`
    UNION ALL
    SELECT client_code, name, 2 FROM `mediaocean-data.mo_raw_spot.spot_client`
  )
  WHERE pri = 1 OR client_code NOT IN (SELECT client_code FROM `mediaocean-data.mo_raw_print.print_client`)
  GROUP BY 1
),
-- Prisma keeps the full estimate name (the master estimate's is cut at 20 characters).
prisma_estimate AS (
  SELECT CONCAT(media_code, '-', advertiser_code, '-', product_code, '-', estimate_code) AS MCPE, ANY_VALUE(COLLATE(estimate_name, '')) AS name
  FROM `mediaocean-data.mo_raw_prisma.placements`
  WHERE estimate_name IS NOT NULL
  GROUP BY 1
),
lines0 AS (
  SELECT
    m.*,
    IF(m.MEDIA_CODE IN ('N', 'R', 'T'), m.VENDOR_CODE_MIR, LTRIM(m.VENDOR_CODE, '0')) AS vcode,
    UPPER(IF(m.MEDIA_CODE IN ('N', 'R', 'T'), NULL, m.BUY_TYPE)) AS buytype,
    COALESCE(cs.name, m.CLIENT_NAME) AS client_short,
    REPLACE(CONCAT(m.PRODUCT_CODE, ' ', m.PRODUCT_NAME), '_', ' ') AS product_txt,
    REPLACE(CONCAT(IF(m.MEDIA_CODE IN ('N', 'R', 'T'), m.ESTIMATE_CODE, CAST(CAST(m.ESTIMATE_CODE AS INT64) AS STRING)), ' ',
      COALESCE(pe.name, m.ESTIMATE_NAME)), '_', ' ') AS estimate_txt,
    -- Billed / paid are kept per MCPE × month × vendor (network: per MCPE × month); the lines sharing them split them pro rata.
    COALESCE(
      SAFE_DIVIDE(m.NET_ORDERED, SUM(m.NET_ORDERED) OVER w),
      IF(ROW_NUMBER() OVER (w ORDER BY m.BUY_TYPE) = 1, 1, 0)) AS share,
    IFNULL(ki.client_interco, k.client_interco) AS pc_interco,
    -- Intercompany: the end client comes from the product code.
    IF(k.client_interco = 'INTERCO', ki.forecaster_client_name, k.name) AS pc_name,
    IF(k.client_interco = 'INTERCO', ki.forecaster_client_id, k.id) AS pc_id,
    IF(k.client_interco = 'INTERCO', ki.CLIENT_CURRENCY_MO, k.currency) AS pc_currency,
    p.po,
    s.srep,
    COALESCE(pb.billed_net, sb.billed_net, 0) AS billed_total,
    COALESCE(pb.paid_net, sb.paid_net, 0) AS paid_total
  FROM mir m
  LEFT JOIN client_short cs ON cs.client_code = m.CLIENT_CODE
  LEFT JOIN prisma_estimate pe ON m.MEDIA_CODE NOT IN ('N', 'R', 'T') AND pe.MCPE = m.MCPE
  LEFT JOIN mo_client k ON k.client_code = m.CLIENT_CODE
  LEFT JOIN mo_key ki ON ki.client_code = m.CLIENT_CODE AND ki.product_code = m.PRODUCT_CODE AND k.client_interco = 'INTERCO'
  LEFT JOIN po p ON p.media_code = m.MEDIA_CODE AND p.client_code = m.CLIENT_CODE AND p.product_code = m.PRODUCT_CODE AND p.estimate_code = m.ESTIMATE_CODE
  LEFT JOIN srep s ON s.media_code = m.MEDIA_CODE AND s.client_code = m.CLIENT_CODE AND s.product_code = m.PRODUCT_CODE
    AND s.estimate_code = m.ESTIMATE_CODE AND s.station_code = m.VENDOR_CODE
  LEFT JOIN prisma_billed pb ON m.MEDIA_CODE NOT IN ('N', 'R', 'T') AND pb.MCPE = m.MCPE AND pb.month = m.MONTH AND pb.vendor_code = m.VENDOR_CODE
  -- Radio billing uses the MIR's station code (CKFGF); spot TV uses call letters (CHEK for CHEKT / CHEK-TV); network TV
  -- is billed per affiliate station, so it is matched per MCPE × month and spread over the network lines.
  LEFT JOIN spot_billed sb ON m.MEDIA_CODE IN ('N', 'R', 'T') AND sb.MCPE = m.MCPE AND sb.month = m.MONTH
    AND sb.vendor_code = CASE m.MEDIA_CODE
      WHEN 'T' THEN COALESCE(NULLIF(SPLIT(m.VENDOR_CODE_MIR, '-')[SAFE_OFFSET(0)], 'no match'), m.VENDOR_CODE)
      WHEN 'N' THEN '*'
      ELSE m.VENDOR_CODE END
  WINDOW w AS (PARTITION BY m.MCPE, m.MONTH, IF(m.MEDIA_CODE = 'N', '*', m.VENDOR_CODE))
),
lines AS (
  SELECT * EXCEPT (billed_total, paid_total, share),
    billed_total * share AS billed_net,
    paid_total * share AS paid_net
  FROM lines0
),
tagged AS (
  SELECT
    l.*,
    f.status, f.currency AS fo_currency, f.agency, f.business_lead, f.region, f.gm_pod,
    v.VENDOR_CODE_MIR AS v_found,
    v.PLUSCO_MEDIA_CHANNEL AS v_channel, v.PLUSCO_PROGRAMMATIC AS v_prog, v.PLUSCO_LOCAL_MEDIA AS v_local,
    v.PLUSCO_PAY_REP AS v_pay_rep, v.PLUSCO_DEALS_2026 AS v_deals, v.PLUSCO_DEALS_Category AS v_deals_cat,
    v.PLUSCO_DEALS_Channel AS v_deals_ch, v.PLUSCO_DEALS_Type AS v_deals_type, v.PLUSCO_MEDIA_PARTNER AS v_partner_raw, UPPER(TRIM(v.PLUSCO_MEDIA_PARTNER)) AS v_partner,
    v.PLUSCO_PARTNER_RepHouseTag AS v_rephouse, v.PLUSCO_MEDIA_OWNER AS v_owner,
    v.PLUSCO_VENDOR_COUNTRY AS v_country, v.PLUSCO_VENDOR_PROVINCE AS v_province, v.PLUSCO_VENDOR_MARKET AS v_market,
    v.PLUSCO_VENDOR_LANGUAGE AS v_language, v.PLUSCO_VENDOR_LANGUAGE_Detail AS v_language_detail,
    v.PLUSCO_VENDOR_AUDIENCE AS v_audience, v.PLUSCO_CONVENTIONAL_SPECIALTY AS v_conv_spec, v.SPOT_Type AS v_spot_type,
    v.SPOT_MARKET_CODE AS v_spot_market_code, v.SPOT_MARKET_NAME AS v_spot_market_name,
    -- Programmatic & SEM split (search buy type, or SEM / MOTS / SEARCH / SM — not ISM, ASM, OSM — in the product or estimate).
    v.PLUSCO_MEDIA_CHANNEL = 'Programmatic & SEM' AS is_prog_sem,
    l.buytype = 'SEARCH'
      OR REGEXP_CONTAINS(UPPER(CONCAT(l.product_txt, ' | ', l.estimate_txt)), r'SEM|MOTS|SEARCH')
      OR (REGEXP_CONTAINS(UPPER(l.product_txt), r'SM') AND NOT REGEXP_CONTAINS(UPPER(l.product_txt), r'ISM|ASM|OSM'))
      OR (REGEXP_CONTAINS(UPPER(l.estimate_txt), r'SM') AND NOT REGEXP_CONTAINS(UPPER(l.estimate_txt), r'ISM|ASM|OSM')) AS is_sem
  FROM lines l
  LEFT JOIN fc f ON f.client_id = l.pc_id
  LEFT JOIN vdb v ON TRIM(v.VENDOR_CODE_MIR) = l.vcode
),
ruled AS (
  SELECT
    t.*,
    CASE
      WHEN t.v_partner = 'MIQ' AND t.buytype = 'SOCIAL' THEN 'Social'
      WHEN t.is_prog_sem AND t.is_sem THEN 'SEM'
      WHEN t.is_prog_sem THEN 'Programmatic'
      ELSE t.v_channel
    END AS channel,
    CASE
      WHEN t.v_partner = 'MIQ' AND t.buytype = 'SOCIAL' THEN NULL
      WHEN t.is_prog_sem AND t.is_sem THEN NULL
      ELSE t.v_prog
    END AS programmatic,
    CASE
      WHEN t.v_partner = 'MIQ' AND t.buytype = 'SOCIAL' THEN 'FOREIGN'
      WHEN t.is_prog_sem AND t.is_sem THEN 'FOREIGN'
      WHEN t.is_prog_sem THEN 'HYBRID'
      ELSE t.v_local
    END AS local_media
  FROM tagged t
),
base AS (
  SELECT
    '{{SOURCE}}' AS SOURCE,
    r.MEDIA_CODE,
    CASE r.MEDIA_CODE WHEN 'B' THEN 'B PRE-BILL' WHEN 'I' THEN 'I DIGITAL' WHEN 'M' THEN 'M PRINT' WHEN 'O' THEN 'O OUTDOOR'
      WHEN 'R' THEN 'R SPOT RADIO' WHEN 'N' THEN 'N NETWORK TV' WHEN 'T' THEN 'T SPOT TV' ELSE r.MEDIA_NAME END AS MEDIA,
    r.CLIENT_CODE,
    CONCAT(r.CLIENT_CODE, ' ', r.client_short) AS CLIENT,
    r.PRODUCT_CODE,
    r.product_txt AS PRODUCT,
    r.ESTIMATE_CODE,
    r.estimate_txt AS ESTIMATE,
    r.vcode AS VENDOR_CODE,
    r.VENDOR_NAME AS VENDOR,
    r.MONTH,
    r.po AS PO,
    IF(r.PAYREP_CODE = 'no match', 'N/A*', r.PAYREP_CODE) AS PAYREP_CODE,
    IF(r.PAYREP = 'no match', 'N/A*', r.PAYREP) AS PAYREP,
    CASE r.OFFICE_CODE WHEN '2' THEN 'CC' WHEN '3' THEN 'JC' WHEN '1' THEN 'PT' WHEN '6' THEN 'PK' WHEN '5' THEN 'MU' ELSE r.OFFICE_CODE END AS OFFICE_CODE,
    CASE r.OFFICE_CODE WHEN '2' THEN 'Cossette Media' WHEN '3' THEN 'Jungle' WHEN '1' THEN 'Showroom' WHEN '6' THEN 'K72' WHEN '5' THEN 'Mekanism' ELSE r.OFFICE END AS OFFICE,
    r.buytype AS BUYTYPE,
    r.srep AS SREP,
    IF(IFNULL(r.srep, '') != '', 'PBB', NULL) AS PBB,
    r.PLUSCO_QUARTER,
    CAST(r.PLUSCO_YEAR AS STRING) AS PLUSCO_YEAR,
    r.MCPE_MIR AS MCPE,
    FORMAT('%.2f', IF(r.NET_ORDERED = 0, 0, 100 * r.billed_net / r.NET_ORDERED)) AS PCT_BILLED,
    FORMAT('%.2f', IF(r.NET_ORDERED = 0, 0, 100 * r.paid_net / r.NET_ORDERED)) AS PCT_PAID,
    -- 'N + 7.0000%N' -> 'N+7%N', as in the export.
    REGEXP_REPLACE(REGEXP_REPLACE(REPLACE(r.BILLING_FORMULA, ' ', ''), r'(\.\d*?)0+%', r'\1%'), r'\.%', '%') AS BILLING_FORMULA,
    NULLIF(r.pc_interco, '') AS CLIENT_INTERCO,
    r.pc_name AS PLUSCO_CLIENT_NAME,
    r.pc_id AS PLUSCO_CLIENT_ID,
    r.pc_currency AS CLIENT_CURRENCY_MO,
    r.status AS CLIENT_STATUS_IN_2026,
    r.fo_currency AS MEDIABOX_FO_CURRENCY,
    r.agency AS AGENCY,
    r.business_lead AS BUSINESS_LEAD,
    r.region AS BU_REGION,
    r.gm_pod AS GM_POD,
    r.channel AS PLUSCO_MEDIA_CHANNEL,
    r.programmatic AS PLUSCO_PROGRAMMATIC,
    r.v_pay_rep AS PLUSCO_PAY_REP,
    r.v_deals_cat AS PLUSCO_DEALS_Category,
    r.v_deals_ch AS PLUSCO_DEALS_Channel,
    r.v_deals_type AS PLUSCO_DEALS_Type,
    r.v_partner_raw AS PLUSCO_MEDIA_PARTNER,
    r.v_rephouse AS PLUSCO_PARTNER_RepHouseTag,
    r.v_owner AS PLUSCO_MEDIA_OWNER,
    r.local_media AS PLUSCO_LOCAL_MEDIA,
    r.v_country AS PLUSCO_VENDOR_COUNTRY,
    r.v_province AS PLUSCO_VENDOR_PROVINCE,
    r.v_market AS PLUSCO_VENDOR_MARKET,
    r.v_language AS PLUSCO_VENDOR_LANGUAGE,
    r.v_language_detail AS PLUSCO_VENDOR_LANGUAGE_Detail,
    r.v_audience AS PLUSCO_VENDOR_AUDIENCE,
    r.v_conv_spec AS PLUSCO_CONVENTIONAL_SPECIALTY,
    r.v_spot_type AS SPOT_Type,
    r.v_spot_market_code AS SPOT_MARKET_CODE,
    r.v_spot_market_name AS SPOT_MARKET_NAME,
    r.v_found AS present_in_Database_2_0,
    IF(r.is_prog_sem, 'Programmatic & SEM', NULL) AS Prog_and_SEM,
    r.v_deals AS PLUSCO_2026_DEALS,
    mb.MCPE AS Mediabox_2_0_MCPE,
    mb.campaign AS Mediabox_2_0_Campaign_Name,
    CASE
      WHEN r.v_partner = 'MIQ' THEN IF(r.buytype = 'SOCIAL', 'MIQ-SOCIAL', 'MIQ-PROG')
      WHEN r.v_partner = 'BILLUPS' THEN IF(r.channel = 'Print', 'BILLUPS-PRINT', 'BILLUPS-OOH')
      WHEN r.v_partner IN ('YAHOO', 'QUANTCAST', 'AMAZON', 'AIM', 'STACKADAPT', 'REDDIT') THEN r.v_partner
    END AS Labs_Partners,
    CAST(r.NET_ORDERED AS FLOAT64) AS NET_ORDERED,
    CAST(IF(r.pc_currency = 'USD', r.NET_ORDERED * 1.3978, r.NET_ORDERED) AS FLOAT64) AS NET_ORDERED_CAD,
    CAST(r.NET_ORDERED - r.billed_net AS FLOAT64) AS BILLABLE_NET,
    CAST(r.billed_net AS FLOAT64) AS BILLED_NET,
    CAST(r.NET_ORDERED - r.paid_net AS FLOAT64) AS PAYABLE_NET,
    CAST(r.paid_net AS FLOAT64) AS PAID_NET
  FROM ruled r
  LEFT JOIN mediabox mb ON mb.MCPE = r.MCPE_MIR
),
-- From here on: PCC_Dashboard_NATIVE's own query (v3), unchanged.
mo_client_lookup AS (
  SELECT
    LOWER(TRIM(forecaster_client_id)) AS forecaster_client_id_key,
    ANY_VALUE(mb_2_0_client_id) AS mb_2_0_client_id,
    ANY_VALUE(mb_2_0_client_name) AS mb_2_0_client_name
  FROM `plusco-media-invest-solutions.Finance_mediabox.MO_Client_Key`
  WHERE forecaster_client_id IS NOT NULL
    AND TRIM(forecaster_client_id) NOT IN ('', '-', '#N/A')
  GROUP BY forecaster_client_id_key
)
SELECT
  base.*,
  CASE
    WHEN UPPER(base.PLUSCO_MEDIA_PARTNER) = 'YAHOO'             AND UPPER(base.PLUSCO_DEALS_Type) IN ('LABS', 'LABS - BRP') THEN  7500000.0 / COUNT(*) OVER (PARTITION BY UPPER(base.PLUSCO_MEDIA_PARTNER), base.PLUSCO_YEAR)
    WHEN UPPER(base.PLUSCO_MEDIA_PARTNER) = 'MIQ'               AND UPPER(base.PLUSCO_DEALS_Type) IN ('LABS', 'LABS - BRP') THEN 24000000.0 / COUNT(*) OVER (PARTITION BY UPPER(base.PLUSCO_MEDIA_PARTNER), base.PLUSCO_YEAR)
    WHEN UPPER(base.PLUSCO_MEDIA_PARTNER) = 'QUANTCAST'         AND UPPER(base.PLUSCO_DEALS_Type) IN ('LABS', 'LABS - BRP') THEN  8000000.0 / COUNT(*) OVER (PARTITION BY UPPER(base.PLUSCO_MEDIA_PARTNER), base.PLUSCO_YEAR)
    WHEN UPPER(base.PLUSCO_MEDIA_PARTNER) = 'REDDIT'            AND UPPER(base.PLUSCO_DEALS_Type) IN ('LABS', 'LABS - BRP') THEN 15340000.0 / COUNT(*) OVER (PARTITION BY UPPER(base.PLUSCO_MEDIA_PARTNER), base.PLUSCO_YEAR)
    WHEN UPPER(base.PLUSCO_MEDIA_PARTNER) = 'AMAZON'            AND UPPER(base.PLUSCO_DEALS_Type) IN ('LABS', 'LABS - BRP') THEN  9000000.0 / COUNT(*) OVER (PARTITION BY UPPER(base.PLUSCO_MEDIA_PARTNER), base.PLUSCO_YEAR)
    WHEN UPPER(base.PLUSCO_MEDIA_PARTNER) = 'BILLUPS'           AND UPPER(base.PLUSCO_DEALS_Type) IN ('LABS', 'LABS - BRP') THEN 38500000.0 / COUNT(*) OVER (PARTITION BY UPPER(base.PLUSCO_MEDIA_PARTNER), base.PLUSCO_YEAR)
    WHEN UPPER(base.PLUSCO_MEDIA_PARTNER) = 'SIRIUS XM'         AND UPPER(base.PLUSCO_DEALS_Type) IN ('LABS', 'LABS - BRP') THEN  1200000.0 / COUNT(*) OVER (PARTITION BY UPPER(base.PLUSCO_MEDIA_PARTNER), base.PLUSCO_YEAR)
    WHEN UPPER(base.PLUSCO_MEDIA_PARTNER) = 'MEDIA PULSE'       AND UPPER(base.PLUSCO_DEALS_Type) IN ('LABS', 'LABS - BRP') THEN  2000000.0 / COUNT(*) OVER (PARTITION BY UPPER(base.PLUSCO_MEDIA_PARTNER), base.PLUSCO_YEAR)
    WHEN UPPER(base.PLUSCO_MEDIA_PARTNER) = 'STACKADAPT'        AND UPPER(base.PLUSCO_DEALS_Type) IN ('LABS', 'LABS - BRP') THEN  4000000.0 / COUNT(*) OVER (PARTITION BY UPPER(base.PLUSCO_MEDIA_PARTNER), base.PLUSCO_YEAR)
    WHEN UPPER(base.PLUSCO_MEDIA_PARTNER) = 'I HEART MEDIA'     AND UPPER(base.PLUSCO_DEALS_Type) IN ('LABS', 'LABS - BRP') THEN  4193400.0 / COUNT(*) OVER (PARTITION BY UPPER(base.PLUSCO_MEDIA_PARTNER), base.PLUSCO_YEAR)
    WHEN UPPER(base.PLUSCO_MEDIA_PARTNER) = 'TRADER INTERACTIVE' AND UPPER(base.PLUSCO_DEALS_Type) IN ('LABS', 'LABS - BRP') THEN  2795600.0 / COUNT(*) OVER (PARTITION BY UPPER(base.PLUSCO_MEDIA_PARTNER), base.PLUSCO_YEAR)
    ELSE NULL
  END AS media_spend_target_distributed,
  CASE WHEN lp.PLUSCO_MEDIA_PARTNER IS NOT NULL THEN TRUE ELSE FALSE END AS IS_LABS_PARTNER,
  mo.mb_2_0_client_id AS mb_2_0_client_id,
  mo.mb_2_0_client_name AS mb_2_0_client_name
FROM base
LEFT JOIN `plusco-media-invest-solutions.PCC_Media_Investment.labs_partners_by_year` lp
  ON CAST(base.PLUSCO_YEAR AS STRING) = lp.PLUSCO_YEAR
  AND UPPER(TRIM(base.PLUSCO_MEDIA_PARTNER)) = lp.PLUSCO_MEDIA_PARTNER
LEFT JOIN mo_client_lookup mo
  ON LOWER(TRIM(base.PLUSCO_CLIENT_ID)) = mo.forecaster_client_id_key
''';
  EXECUTE IMMEDIATE REPLACE(REPLACE(REPLACE(sql, '{{MIR}}', mir_table), '{{TARGET}}', target_table), '{{SOURCE}}', source_label);
END;
