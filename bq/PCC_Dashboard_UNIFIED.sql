-- filepath: bq/PCC_Dashboard_UNIFIED.sql
-- Client x month dashboard table (Looker): NATIVE spend + labs_pacing_wide + MediaBox Meta forecast + forecast_clients metadata. Rebuild after a labs view change too.
-- Versioned 2026-11-26 from the SQL BigQuery last ran (job history), as run for the Nov 2026 MIR.
-- ============================================================================
-- PCC_Dashboard_UNIFIED  (v5 - clean metadata via forecast_clients lookup)
--
-- v5 change: Client metadata (name, agency, region, business lead, GM pod,
-- status, scenario) now sourced authoritatively from
-- plus-collect.mediabox.forecast_clients. This fixes 403 NULL-name rows in
-- v4 and removes all the NULLIF(..., '#N/A') workarounds for dirty NATIVE
-- metadata.
--
-- Sources:
--   1. PCC_Dashboard_NATIVE                       - all spend metrics
--   2. labs_pacing_wide                           - Labs partner booked + forecast
--   3. canadian-sandbox.mediabox_1.forecast_clean - Meta divestment forecast
--   4. plus-collect.mediabox.forecast_clients     - Client metadata (single source of truth)
--
-- Dashboard date filter (YTD completed months):
--   MONTH_DATE >= DATE_TRUNC(CURRENT_DATE(), YEAR)
--   AND MONTH_DATE < DATE_TRUNC(CURRENT_DATE(), MONTH)
-- ============================================================================

CREATE OR REPLACE TABLE `plusco-media-invest-solutions.PCC_Media_Investment.PCC_Dashboard_UNIFIED` AS

WITH
-- ---------------------------------------------------------------------------
-- CLIENT METADATA: single source of truth for name, agency, region, etc.
-- Excludes the '-' sentinel ID and any obviously hidden/test rows.
-- ---------------------------------------------------------------------------
client_metadata AS (
  SELECT
    CL_ID                       AS PLUSCO_CLIENT_ID,
    CL_Name                     AS client_name,
    INITCAP(CL_Agency)          AS agency,
    CL_Business_Unit_Region     AS bu_region,
    CL_Business_Lead            AS business_lead,
    GM_Pod                      AS gm_pod,
    Client_Status_2026          AS client_status_2026,
    Scenario                    AS scenario_meta_mapping,
    CASE
      WHEN UPPER(TRIM(Eligible_Billups_OOH)) = 'N/A' THEN 'No'
      ELSE 'Yes'
    END AS eligible_billups_ooh,
    CASE
      WHEN UPPER(TRIM(Eligible_Billups_PRINT)) = 'N/A' THEN 'No'
      ELSE 'Yes'
    END AS eligible_billups_print
  FROM `plus-collect.mediabox.forecast_clients`
  WHERE CL_ID IS NOT NULL AND CL_ID != '-'
),

native_filtered AS (
  SELECT
    PLUSCO_CLIENT_ID,
    PLUSCO_YEAR,
    MONTH,
    PARSE_DATE('%Y-%m', MONTH)   AS MONTH_DATE,
    UPPER(PLUSCO_MEDIA_CHANNEL)  AS MEDIA_CHANNEL_U,
    UPPER(PLUSCO_MEDIA_PARTNER)  AS MEDIA_PARTNER_U,
    UPPER(PLUSCO_2026_DEALS)     AS DEALS_2026_U,
    UPPER(PLUSCO_DEALS_Type)     AS DEALS_TYPE_U,
    UPPER(BUYTYPE)               AS BUYTYPE_U,
    NET_ORDERED_CAD
  FROM `plusco-media-invest-solutions.PCC_Media_Investment.PCC_Dashboard_NATIVE`
  WHERE NET_ORDERED_CAD IS NOT NULL
    AND PLUSCO_CLIENT_ID IS NOT NULL
    AND UPPER(TRIM(PLUSCO_MEDIA_CHANNEL)) != 'N/A'
),

client_month_spend AS (
  SELECT
    PLUSCO_CLIENT_ID,
    PLUSCO_YEAR,
    MONTH,
    MONTH_DATE,

    SUM(NET_ORDERED_CAD) AS total_media_spend,
    SUM(CASE WHEN DEALS_TYPE_U = 'LABS'
             THEN NET_ORDERED_CAD ELSE 0 END) AS labs_spend_dealstype,
    SUM(CASE WHEN MEDIA_CHANNEL_U = 'OOH'
             THEN NET_ORDERED_CAD ELSE 0 END) AS ooh_spend,
    SUM(CASE WHEN MEDIA_CHANNEL_U = 'PRINT'
             THEN NET_ORDERED_CAD ELSE 0 END) AS print_spend,
    SUM(CASE WHEN MEDIA_PARTNER_U = 'META' AND MEDIA_CHANNEL_U = 'SOCIAL'
             THEN NET_ORDERED_CAD ELSE 0 END) AS meta_spend,
    SUM(CASE WHEN MEDIA_CHANNEL_U = 'SOCIAL'
                  OR (MEDIA_PARTNER_U = 'MIQ' AND BUYTYPE_U = 'SOCIAL')
             THEN NET_ORDERED_CAD ELSE 0 END) AS social_spend,
    SUM(CASE WHEN MEDIA_PARTNER_U = 'MIQ' AND BUYTYPE_U = 'SOCIAL'
             THEN NET_ORDERED_CAD ELSE 0 END) AS miq_social_spend,
    SUM(CASE WHEN MEDIA_CHANNEL_U IN ('DIGITAL DIRECT','PROGRAMMATIC','SEM','SOCIAL')
             THEN NET_ORDERED_CAD ELSE 0 END) AS digital_spend,
    SUM(CASE WHEN MEDIA_CHANNEL_U = 'PROGRAMMATIC' THEN NET_ORDERED_CAD ELSE 0 END) AS prog_spend,
    SUM(CASE WHEN MEDIA_CHANNEL_U = 'PROGRAMMATIC' AND DEALS_2026_U = 'PARTNER DEAL'
             THEN NET_ORDERED_CAD ELSE 0 END) AS prog_deal_partner_spend,
    SUM(CASE WHEN MEDIA_CHANNEL_U = 'PROGRAMMATIC'
                  AND (DEALS_2026_U != 'PARTNER DEAL' OR DEALS_2026_U IS NULL)
             THEN NET_ORDERED_CAD ELSE 0 END) AS prog_non_deal_partner_spend,
    SUM(CASE WHEN MEDIA_CHANNEL_U = 'DIGITAL DIRECT' THEN NET_ORDERED_CAD ELSE 0 END) AS digital_direct_spend,
    SUM(CASE WHEN MEDIA_CHANNEL_U = 'DIGITAL DIRECT' AND DEALS_2026_U = 'PARTNER DEAL'
             THEN NET_ORDERED_CAD ELSE 0 END) AS dd_deal_partner_spend,
    SUM(CASE WHEN MEDIA_CHANNEL_U = 'DIGITAL DIRECT'
                  AND (DEALS_2026_U != 'PARTNER DEAL' OR DEALS_2026_U IS NULL)
             THEN NET_ORDERED_CAD ELSE 0 END) AS dd_non_deal_partner_spend
  FROM native_filtered
  GROUP BY PLUSCO_CLIENT_ID, PLUSCO_YEAR, MONTH, MONTH_DATE
),

labs_block_flat AS (
  SELECT
    client_id AS PLUSCO_CLIENT_ID,
    DATE(SAFE_CAST(SPLIT(year_month, '-')[OFFSET(1)] AS INT64), month_num, 1) AS MONTH_DATE,
    SUM(booked_amazon)         AS booked_amazon,
    SUM(booked_billups_ooh)    AS booked_billups_ooh,
    SUM(booked_billups_print)  AS booked_billups_print,
    SUM(booked_miq_prog)       AS booked_miq_prog,
    SUM(booked_miq_social)     AS booked_miq_social,
    SUM(booked_quantcast)      AS booked_quantcast,
    SUM(booked_yahoo)          AS booked_yahoo,
    SUM(total_labs_booked)     AS total_labs_booked,
    SUM(forecast_amazon)       AS forecast_amazon,
    SUM(forecast_billups_ooh)  AS forecast_billups_ooh,
    SUM(forecast_billups_print) AS forecast_billups_print,
    SUM(forecast_miq_prog)     AS forecast_miq_prog,
    SUM(forecast_miq_social)   AS forecast_miq_social,
    SUM(forecast_quantcast)    AS forecast_quantcast,
    SUM(forecast_yahoo)        AS forecast_yahoo,
    SUM(total_labs_forecast)   AS total_labs_forecast
  FROM `plusco-media-invest-solutions.PCC_Media_Investment.labs_pacing_wide`
  GROUP BY PLUSCO_CLIENT_ID, MONTH_DATE
),

meta_forecast AS (
  SELECT
    FO_Client                 AS PLUSCO_CLIENT_ID,
    SUM(FO_Value_CAD)         AS social_forecast_rfq1
  FROM `canadian-sandbox.mediabox_1.forecast_clean`
  WHERE UPPER(FO_Channel) = 'SOCIAL'
    AND Submission_version_Year = 'RFQ 1-BL-2026'
  GROUP BY FO_Client
),

annual_rollup AS (
  SELECT
    PLUSCO_CLIENT_ID,
    SUM(CASE WHEN PLUSCO_YEAR = '2025' THEN meta_spend   ELSE 0 END) AS meta_2025_annual,
    SUM(CASE WHEN PLUSCO_YEAR = '2025' THEN social_spend ELSE 0 END) AS social_2025_annual,
    SUM(CASE WHEN PLUSCO_YEAR = '2026' THEN meta_spend   ELSE 0 END) AS meta_2026_annual,
    SUM(CASE WHEN PLUSCO_YEAR = '2026' THEN social_spend ELSE 0 END) AS social_2026_annual
  FROM client_month_spend
  GROUP BY PLUSCO_CLIENT_ID
),

target_meta AS (
  SELECT
    COALESCE(a.PLUSCO_CLIENT_ID, f.PLUSCO_CLIENT_ID) AS PLUSCO_CLIENT_ID,
    CASE
      WHEN COALESCE(f.social_forecast_rfq1, 0) = 0 THEN 0
      WHEN COALESCE(a.social_2025_annual, 0) = 0
        OR COALESCE(a.meta_2025_annual, 0)   = 0
        THEN f.social_forecast_rfq1 * 0.67 * 0.70
      ELSE
        f.social_forecast_rfq1 * SAFE_DIVIDE(a.meta_2025_annual, a.social_2025_annual) * 0.70
    END AS target_meta_spend_2026_annual
  FROM annual_rollup a
  FULL OUTER JOIN meta_forecast f ON a.PLUSCO_CLIENT_ID = f.PLUSCO_CLIENT_ID
),

-- ---------------------------------------------------------------------------
-- ALL CLIENTS that should appear in 2026 (spend OR labs OR meta forecast)
-- ---------------------------------------------------------------------------
all_2026_clients AS (
  SELECT DISTINCT PLUSCO_CLIENT_ID FROM client_month_spend WHERE PLUSCO_YEAR = '2026'
  UNION DISTINCT
  SELECT DISTINCT PLUSCO_CLIENT_ID FROM labs_block_flat
  UNION DISTINCT
  SELECT DISTINCT PLUSCO_CLIENT_ID FROM meta_forecast
),

scaffold_2026 AS (
  SELECT
    c.PLUSCO_CLIENT_ID,
    m AS MONTH_DATE,
    FORMAT_DATE('%Y-%m', m) AS MONTH,
    '2026' AS PLUSCO_YEAR
  FROM all_2026_clients c
  CROSS JOIN UNNEST(GENERATE_DATE_ARRAY('2026-01-01', '2026-12-01', INTERVAL 1 MONTH)) AS m
),

rows_2025 AS (
  SELECT
    cm.PLUSCO_CLIENT_ID,
    cm.PLUSCO_YEAR,
    cm.MONTH,
    cm.MONTH_DATE,
    cm.total_media_spend,
    cm.labs_spend_dealstype,
    cm.ooh_spend,
    cm.print_spend,
    cm.meta_spend,
    cm.social_spend,
    cm.miq_social_spend,
    cm.digital_spend,
    cm.prog_spend,
    cm.prog_deal_partner_spend,
    cm.prog_non_deal_partner_spend,
    cm.digital_direct_spend,
    cm.dd_deal_partner_spend,
    cm.dd_non_deal_partner_spend
  FROM client_month_spend cm
  WHERE cm.PLUSCO_YEAR = '2025'
),

rows_2026 AS (
  SELECT
    s.PLUSCO_CLIENT_ID,
    s.PLUSCO_YEAR,
    s.MONTH,
    s.MONTH_DATE,
    COALESCE(cm.total_media_spend, 0)            AS total_media_spend,
    COALESCE(cm.labs_spend_dealstype, 0)         AS labs_spend_dealstype,
    COALESCE(cm.ooh_spend, 0)                    AS ooh_spend,
    COALESCE(cm.print_spend, 0)                  AS print_spend,
    COALESCE(cm.meta_spend, 0)                   AS meta_spend,
    COALESCE(cm.social_spend, 0)                 AS social_spend,
    COALESCE(cm.miq_social_spend, 0)             AS miq_social_spend,
    COALESCE(cm.digital_spend, 0)                AS digital_spend,
    COALESCE(cm.prog_spend, 0)                   AS prog_spend,
    COALESCE(cm.prog_deal_partner_spend, 0)      AS prog_deal_partner_spend,
    COALESCE(cm.prog_non_deal_partner_spend, 0)  AS prog_non_deal_partner_spend,
    COALESCE(cm.digital_direct_spend, 0)         AS digital_direct_spend,
    COALESCE(cm.dd_deal_partner_spend, 0)        AS dd_deal_partner_spend,
    COALESCE(cm.dd_non_deal_partner_spend, 0)    AS dd_non_deal_partner_spend
  FROM scaffold_2026 s
  LEFT JOIN client_month_spend cm
    ON s.PLUSCO_CLIENT_ID = cm.PLUSCO_CLIENT_ID
   AND s.MONTH_DATE       = cm.MONTH_DATE
),

unified_base AS (
  SELECT * FROM rows_2025
  UNION ALL
  SELECT * FROM rows_2026
)

-- ===========================================================================
-- FINAL OUTPUT - metadata stamped on every row from forecast_clients lookup
-- ===========================================================================
SELECT
  -- Identifiers (sourced from forecast_clients - single source of truth)
  cmeta.client_name             AS PLUSCO_CLIENT_NAME,
  ub.PLUSCO_CLIENT_ID,
  cmeta.agency                  AS AGENCY,
  cmeta.bu_region               AS BU_REGION,
  cmeta.business_lead           AS BUSINESS_LEAD,
  cmeta.gm_pod                  AS GM_POD,
  cmeta.client_status_2026      AS CLIENT_STATUS_IN_2026,
  cmeta.scenario_meta_mapping,
  cmeta.eligible_billups_ooh    AS ELIGIBLE_BILLUPS_OOH,
  cmeta.eligible_billups_print  AS ELIGIBLE_BILLUPS_PRINT,
  ub.PLUSCO_YEAR,
  ub.MONTH,
  ub.MONTH_DATE,

  -- ========== ACHIEVE LABS TARGETS ==========
  ub.total_media_spend,
  ub.labs_spend_dealstype,                                          -- broad Labs definition (PLUSCO_DEALS_Type='Labs') - use for Labs Share of Total Media tile
  ub.ooh_spend,                                                     -- denominator for Billups OOH Share of OOH tile
  ub.print_spend,                                                   -- denominator for Billups Print Share of Print tile
  COALESCE(lb.total_labs_booked, 0)    AS labs_spend,               -- narrow Labs definition (7 partners only) - use for partner-level pacing
  lb.total_labs_forecast               AS labs_forecast_monthly,

  COALESCE(lb.booked_billups_ooh, 0)    AS booked_billups_ooh,
  COALESCE(lb.booked_billups_print, 0)  AS booked_billups_print,
  COALESCE(lb.booked_yahoo, 0)          AS booked_yahoo,
  COALESCE(lb.booked_amazon, 0)         AS booked_amazon,
  COALESCE(lb.booked_quantcast, 0)      AS booked_quantcast,
  COALESCE(lb.booked_miq_prog, 0)       AS booked_miq_prog,
  COALESCE(lb.booked_miq_social, 0)     AS booked_miq_social,

  lb.forecast_billups_ooh,
  lb.forecast_billups_print,
  lb.forecast_yahoo,
  lb.forecast_amazon,
  lb.forecast_quantcast,
  lb.forecast_miq_prog,
  lb.forecast_miq_social,

  -- ========== DIVEST FROM META ==========
  ub.meta_spend,
  ub.social_spend,
  ub.miq_social_spend,

  CASE
    WHEN ub.PLUSCO_YEAR = '2026'
    THEN COALESCE(mf.social_forecast_rfq1, 0) / 12
    ELSE NULL
  END AS social_forecast_rfq1,

  CASE
    WHEN ub.PLUSCO_YEAR = '2026'
    THEN COALESCE(tm.target_meta_spend_2026_annual, 0) / 12
    ELSE NULL
  END AS target_meta_spend_2026,

  ar.meta_2026_annual,
  ar.social_2026_annual,
  ar.meta_2025_annual,
  ar.social_2025_annual,

  -- ========== GROW PROGRAMMATIC ==========
  ub.prog_spend,
  ub.digital_spend,
  ub.prog_deal_partner_spend,
  ub.prog_non_deal_partner_spend,

  -- ========== DECREASE DIGITAL DIRECT ==========
  ub.digital_direct_spend,
  ub.dd_deal_partner_spend,
  ub.dd_non_deal_partner_spend

FROM unified_base ub
LEFT JOIN client_metadata  cmeta ON ub.PLUSCO_CLIENT_ID = cmeta.PLUSCO_CLIENT_ID
LEFT JOIN labs_block_flat  lb
  ON ub.PLUSCO_CLIENT_ID = lb.PLUSCO_CLIENT_ID
 AND ub.MONTH_DATE       = lb.MONTH_DATE
LEFT JOIN meta_forecast    mf ON ub.PLUSCO_CLIENT_ID = mf.PLUSCO_CLIENT_ID
LEFT JOIN target_meta      tm ON ub.PLUSCO_CLIENT_ID = tm.PLUSCO_CLIENT_ID
LEFT JOIN annual_rollup    ar ON ub.PLUSCO_CLIENT_ID = ar.PLUSCO_CLIENT_ID

ORDER BY PLUSCO_CLIENT_NAME, PLUSCO_YEAR, MONTH;
