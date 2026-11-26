-- filepath: bq/BCR_2026.sql
-- NATIVE x MediaBox finance reconciliation (BCR). Reads NATIVE and Finance_mediabox.finance_combined.
-- Versioned 2026-11-26 from the SQL BigQuery last ran (job history), as run for the Nov 2026 MIR.
-- Purpose: Full-outer join of PCC_Dashboard_NATIVE and finance_combined at MCPE x MONTH grain.
--          For finance-only rows (no MIR side), finance fields populate the matching
--          native columns via COALESCE so the dashboard has a single column per concept.
-- Change vs v1: finance-side client name now comes from forecaster_client_name
--          (PLUSCO_CLIENT_NAME was dropped from finance_combined). Output column
--          name PLUSCO_CLIENT_NAME is kept so nothing downstream of BCR_2026 breaks.
-- Change vs v2: Added forecaster_client_id as a fallback for PLUSCO_CLIENT_ID, 
--          and surfaced both forecaster_client_id and forecaster_client_name as distinct columns.

CREATE OR REPLACE TABLE `plusco-media-invest-solutions.PCC_Media_Investment.BCR_2026` AS

WITH

-- 1) Finance aggregated to (tac_billing_id, month). Fields carried internally
--    for COALESCE into native columns in final SELECT; not surfaced as separate columns.
finance_agg AS (
  SELECT
    TRIM(tac_billing_id)                       AS tac_billing_id,
    FORMAT_DATE('%Y-%m', month)                AS month_key,
    ANY_VALUE(forecaster_client_id)            AS forecaster_client_id_finance,
    ANY_VALUE(forecaster_client_name)          AS forecaster_client_name_finance,
    ANY_VALUE(campaign)                        AS campaign_finance,
    ANY_VALUE(media_type)                      AS media_type_finance,
    SUM(monthly_tactic_media_budget)           AS planned
  FROM `plusco-media-invest-solutions.Finance_mediabox.finance_combined`
  WHERE tac_billing_id IS NOT NULL
    AND TRIM(tac_billing_id) NOT IN ('', '-')
    AND month IS NOT NULL
    AND EXTRACT(YEAR FROM month) IN (2025, 2026, 2027)
  GROUP BY tac_billing_id, month_key
),

-- 2) Native aggregated to (MCPE, MONTH).
native_agg AS (
  SELECT
    TRIM(MCPE)                                 AS MCPE,
    MONTH                                      AS month_key,
    SUM(NET_ORDERED)                           AS NET_ORDERED,
    SUM(NET_ORDERED_CAD)                       AS NET_ORDERED_CAD,
    SUM(BILLABLE_NET)                          AS BILLABLE_NET,
    SUM(BILLED_NET)                            AS BILLED_NET,
    SUM(PAYABLE_NET)                           AS PAYABLE_NET,
    SUM(PAID_NET)                              AS PAID_NET,
    ANY_VALUE(SOURCE)                          AS SOURCE,
    ANY_VALUE(MEDIA_CODE)                      AS MEDIA_CODE,
    ANY_VALUE(MEDIA)                           AS MEDIA,
    ANY_VALUE(CLIENT_CODE)                     AS CLIENT_CODE,
    ANY_VALUE(CLIENT)                          AS CLIENT,
    ANY_VALUE(PRODUCT_CODE)                    AS PRODUCT_CODE,
    ANY_VALUE(PRODUCT)                         AS PRODUCT,
    ANY_VALUE(ESTIMATE_CODE)                   AS ESTIMATE_CODE,
    ANY_VALUE(ESTIMATE)                        AS ESTIMATE,
    ANY_VALUE(VENDOR_CODE)                     AS VENDOR_CODE,
    ANY_VALUE(VENDOR)                          AS VENDOR,
    ANY_VALUE(PO)                              AS PO,
    ANY_VALUE(PAYREP_CODE)                     AS PAYREP_CODE,
    ANY_VALUE(PAYREP)                          AS PAYREP,
    ANY_VALUE(OFFICE_CODE)                     AS OFFICE_CODE,
    ANY_VALUE(OFFICE)                          AS OFFICE,
    ANY_VALUE(BUYTYPE)                         AS BUYTYPE,
    ANY_VALUE(SREP)                            AS SREP,
    ANY_VALUE(PBB)                             AS PBB,
    ANY_VALUE(PLUSCO_QUARTER)                  AS PLUSCO_QUARTER,
    ANY_VALUE(PLUSCO_YEAR)                     AS PLUSCO_YEAR,
    ANY_VALUE(PCT_BILLED)                      AS PCT_BILLED,
    ANY_VALUE(PCT_PAID)                        AS PCT_PAID,
    ANY_VALUE(BILLING_FORMULA)                 AS BILLING_FORMULA,
    ANY_VALUE(CLIENT_INTERCO)                  AS CLIENT_INTERCO,
    ANY_VALUE(PLUSCO_CLIENT_NAME)              AS PLUSCO_CLIENT_NAME,
    ANY_VALUE(PLUSCO_CLIENT_ID)                AS PLUSCO_CLIENT_ID,
    ANY_VALUE(CLIENT_CURRENCY_MO)              AS CLIENT_CURRENCY_MO,
    ANY_VALUE(CLIENT_STATUS_IN_2026)           AS CLIENT_STATUS_IN_2026,
    ANY_VALUE(MEDIABOX_FO_CURRENCY)            AS MEDIABOX_FO_CURRENCY,
    ANY_VALUE(AGENCY)                          AS AGENCY,
    ANY_VALUE(BUSINESS_LEAD)                   AS BUSINESS_LEAD,
    ANY_VALUE(BU_REGION)                       AS BU_REGION,
    ANY_VALUE(GM_POD)                          AS GM_POD,
    ANY_VALUE(PLUSCO_MEDIA_CHANNEL)            AS PLUSCO_MEDIA_CHANNEL,
    ANY_VALUE(PLUSCO_PROGRAMMATIC)             AS PLUSCO_PROGRAMMATIC,
    ANY_VALUE(PLUSCO_PAY_REP)                  AS PLUSCO_PAY_REP,
    ANY_VALUE(PLUSCO_2026_DEALS)               AS PLUSCO_2026_DEALS,
    ANY_VALUE(PLUSCO_DEALS_Category)           AS PLUSCO_DEALS_Category,
    ANY_VALUE(PLUSCO_DEALS_Channel)            AS PLUSCO_DEALS_Channel,
    ANY_VALUE(PLUSCO_DEALS_Type)               AS PLUSCO_DEALS_Type,
    ANY_VALUE(PLUSCO_MEDIA_PARTNER)            AS PLUSCO_MEDIA_PARTNER,
    ANY_VALUE(PLUSCO_PARTNER_RepHouseTag)      AS PLUSCO_PARTNER_RepHouseTag,
    ANY_VALUE(PLUSCO_MEDIA_OWNER)              AS PLUSCO_MEDIA_OWNER,
    ANY_VALUE(PLUSCO_LOCAL_MEDIA)              AS PLUSCO_LOCAL_MEDIA,
    ANY_VALUE(PLUSCO_VENDOR_COUNTRY)           AS PLUSCO_VENDOR_COUNTRY,
    ANY_VALUE(PLUSCO_VENDOR_PROVINCE)          AS PLUSCO_VENDOR_PROVINCE,
    ANY_VALUE(PLUSCO_VENDOR_MARKET)            AS PLUSCO_VENDOR_MARKET,
    ANY_VALUE(PLUSCO_VENDOR_LANGUAGE)          AS PLUSCO_VENDOR_LANGUAGE,
    ANY_VALUE(PLUSCO_VENDOR_LANGUAGE_Detail)   AS PLUSCO_VENDOR_LANGUAGE_Detail,
    ANY_VALUE(PLUSCO_VENDOR_AUDIENCE)          AS PLUSCO_VENDOR_AUDIENCE,
    ANY_VALUE(PLUSCO_CONVENTIONAL_SPECIALTY)   AS PLUSCO_CONVENTIONAL_SPECIALTY,
    ANY_VALUE(SPOT_Type)                       AS SPOT_Type,
    ANY_VALUE(SPOT_MARKET_CODE)                AS SPOT_MARKET_CODE,
    ANY_VALUE(SPOT_MARKET_NAME)                AS SPOT_MARKET_NAME,
    ANY_VALUE(present_in_Database_2_0)         AS present_in_Database_2_0,
    ANY_VALUE(Prog_and_SEM)                    AS Prog_and_SEM,
    ANY_VALUE(Mediabox_2_0_MCPE)               AS Mediabox_2_0_MCPE,
    ANY_VALUE(Mediabox_2_0_Campaign_Name)      AS Mediabox_2_0_Campaign_Name,
    ANY_VALUE(LABS_PARTNERS)                   AS LABS_PARTNERS
  FROM `plusco-media-invest-solutions.PCC_Media_Investment.PCC_Dashboard_NATIVE`
  WHERE MCPE IS NOT NULL
    AND TRIM(MCPE) NOT IN ('', '-')
    AND PLUSCO_YEAR IN ('2025', '2026', '2027')
  GROUP BY MCPE, MONTH
)

-- 3) Full outer join. Finance fields fold into native columns via COALESCE
--    so finance-only rows have MCPE / PLUSCO_CLIENT_NAME / Mediabox_2_0_Campaign_Name / MEDIA populated.
SELECT
  COALESCE(n.MCPE, f.tac_billing_id)                                  AS MCPE,
  COALESCE(n.month_key, f.month_key)                                  AS MONTH,

  -- finance metric
  f.planned                                                           AS planned,

  -- native metrics
  n.NET_ORDERED,
  n.NET_ORDERED_CAD,
  n.BILLABLE_NET,
  n.BILLED_NET,
  n.PAYABLE_NET,
  n.PAID_NET,

  -- SOURCE: native value when MIR row exists, else 'MEDIABOX'
  COALESCE(n.SOURCE, 'MEDIABOX')                                      AS SOURCE,

  -- native dimensions (fields with finance fallback are COALESCEd below)
  n.MEDIA_CODE,
  COALESCE(NULLIF(NULLIF(n.MEDIA, '#N/A'), '-'), f.media_type_finance)                           AS MEDIA,
  n.CLIENT_CODE, n.CLIENT,
  n.PRODUCT_CODE, n.PRODUCT, n.ESTIMATE_CODE, n.ESTIMATE,
  n.VENDOR_CODE, n.VENDOR, n.PO, n.PAYREP_CODE, n.PAYREP,
  n.OFFICE_CODE, n.OFFICE, n.BUYTYPE, n.SREP, n.PBB,
  n.PLUSCO_QUARTER, n.PLUSCO_YEAR,
  n.PCT_BILLED, n.PCT_PAID, n.BILLING_FORMULA, n.CLIENT_INTERCO,
  
  -- Client Identifiers (Native + Fallbacks + Standalone Forecaster Fields)
  COALESCE(NULLIF(NULLIF(n.PLUSCO_CLIENT_NAME, '#N/A'), '-'), f.forecaster_client_name_finance)  AS PLUSCO_CLIENT_NAME,
  COALESCE(NULLIF(NULLIF(n.PLUSCO_CLIENT_ID, '#N/A'), '-'), f.forecaster_client_id_finance)      AS PLUSCO_CLIENT_ID,
  f.forecaster_client_id_finance                                                                 AS forecaster_client_id,
  f.forecaster_client_name_finance                                                               AS forecaster_client_name,

  n.CLIENT_CURRENCY_MO, n.CLIENT_STATUS_IN_2026, n.MEDIABOX_FO_CURRENCY,
  n.AGENCY, n.BUSINESS_LEAD, n.BU_REGION, n.GM_POD,
  n.PLUSCO_MEDIA_CHANNEL, n.PLUSCO_PROGRAMMATIC, n.PLUSCO_PAY_REP,
  n.PLUSCO_2026_DEALS, n.PLUSCO_DEALS_Category, n.PLUSCO_DEALS_Channel, n.PLUSCO_DEALS_Type,
  n.PLUSCO_MEDIA_PARTNER, n.PLUSCO_PARTNER_RepHouseTag, n.PLUSCO_MEDIA_OWNER,
  n.PLUSCO_LOCAL_MEDIA,
  n.PLUSCO_VENDOR_COUNTRY, n.PLUSCO_VENDOR_PROVINCE, n.PLUSCO_VENDOR_MARKET,
  n.PLUSCO_VENDOR_LANGUAGE, n.PLUSCO_VENDOR_LANGUAGE_Detail,
  n.PLUSCO_VENDOR_AUDIENCE, n.PLUSCO_CONVENTIONAL_SPECIALTY,
  n.SPOT_Type, n.SPOT_MARKET_CODE, n.SPOT_MARKET_NAME,
  n.present_in_Database_2_0, n.Prog_and_SEM,
  n.Mediabox_2_0_MCPE,
  COALESCE(NULLIF(NULLIF(n.Mediabox_2_0_Campaign_Name, '#N/A'), '-'), f.campaign_finance)  AS Mediabox_2_0_Campaign_Name,
  f.campaign_finance                                                  AS campaign_finance,

  -- Match status based on actual finance presence. MIR's vlookup is unreliable for ~15 MCPEs
  -- where it reports '#N/A' but finance clearly has the MCPE with real campaign data.
  CASE
    WHEN n.MCPE IS NULL                                        THEN 'MB only (no MIR)'
    WHEN n.MCPE IS NOT NULL AND f.tac_billing_id IS NOT NULL   THEN 'MIR + MB (matched)'
    ELSE                                                            'MIR (no MB match)'
  END                                                                 AS mb_match_status,

  n.LABS_PARTNERS,

  -- provenance flags (kept for QA; not duplicates of any other column)
  CASE WHEN n.MCPE IS NOT NULL THEN 1 ELSE 0 END                      AS in_native,
  CASE WHEN f.tac_billing_id IS NOT NULL THEN 1 ELSE 0 END            AS in_finance

FROM native_agg n
FULL OUTER JOIN finance_agg f
  ON n.MCPE = f.tac_billing_id
 AND n.month_key = f.month_key
;
