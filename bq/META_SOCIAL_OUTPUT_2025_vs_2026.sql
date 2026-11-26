-- filepath: bq/META_SOCIAL_OUTPUT_2025_vs_2026.sql
-- Meta share vs target per client x month. Reads NATIVE, labs_pacing_wide and forecaster_1 (RFQ3). Synced by sync-meta-social-output.mjs; read by SOCIAL_PARTNER_MIX.
-- Versioned 2026-11-26 from the SQL BigQuery last ran (job history), as run for the Nov 2026 MIR.
-- plusco-media-invest-solutions.PCC_Media_Investment.META_SOCIAL_OUTPUT_2025_vs_2026
-- CHANGE: social forecast repointed RFQ2 -> RFQ3, off canadian-sandbox.mediabox_1.forecast_clean
--   and onto pluscoops.forecaster_1. Only forecast_monthly / forecast_annual / forecast_client_dims
--   changed (+ new cur / sheet_dims CTEs). native_metrics, targets, flags, all aliases UNCHANGED.
--
-- Definition (tie-out proven: forecaster_1 media 'Social' RFQ2 = 75,845,646 = forecast_clean 75,845,648):
--   social_forecast (old FO_Channel='SOCIAL')  -> axis='media' AND category='Social'
--   miq_social_forecast (old FO_Partner='MIQ-SOCIAL') -> axis='labs' AND category='MIQ-Social'
--   Output aliases kept as rfq1/rfq2 for Looker compatibility.
--   Rules: deduped currency x1.3978, all buckets, test client + is_hidden excluded.
--   scenario_meta_mapping + Client_Status_2026 stay sourced from the Google Sheet, as-is.

CREATE OR REPLACE TABLE `plusco-media-invest-solutions.PCC_Media_Investment.META_SOCIAL_OUTPUT_2025_vs_2026` AS
WITH cur AS (
  -- One row per client_id (dedupes the clients fan-out): dims, currency, hidden flag.
  SELECT
    client_id,
    ANY_VALUE(client)        AS client_name,
    ANY_VALUE(agency)        AS agency,
    ANY_VALUE(region)        AS bu_region,
    ANY_VALUE(business_lead) AS business_lead,
    ANY_VALUE(gm_pod)        AS gm_pod,
    ANY_VALUE(currency)      AS currency,
    LOGICAL_OR(is_hidden)    AS is_hidden
  FROM `pluscoops.forecaster_1.clients`
  GROUP BY client_id
),
sheet_dims AS (
  -- scenario_meta_mapping + Client_Status_2026 kept from the Google Sheet, as-is.
  SELECT
    FO_Client,
    MAX(Client_Status_2026) AS Client_Status_2026,
    MAX(Scenario)           AS scenario_meta_mapping
  FROM `canadian-sandbox.mediabox_1.forecast_clean`
  WHERE Submission_version_Year = 'RFQ 2-BL-2026'
  GROUP BY FO_Client
),
native_metrics AS (
  -- One row per (PLUSCO_CLIENT_ID, MONTH). Dimensions pulled via MAX() to prevent
  -- row multiplication when a client appears under multiple AGENCY/BU/BUSINESS_LEAD/
  -- GM_POD/CLIENT_STATUS combos in the same month. PLUSCO_YEAR is functionally
  -- determined by MONTH so it stays in GROUP BY without splitting rows.
  SELECT
    PLUSCO_CLIENT_ID,
    MAX(PLUSCO_CLIENT_NAME)        AS PLUSCO_CLIENT_NAME,
    MAX(INITCAP(AGENCY))           AS AGENCY,
    MAX(BU_REGION)                 AS BU_REGION,
    MAX(BUSINESS_LEAD)             AS BUSINESS_LEAD,
    MAX(GM_POD)                    AS GM_POD,
    MAX(CLIENT_STATUS_IN_2026)     AS CLIENT_STATUS_IN_2026,
    PLUSCO_YEAR,
    MONTH,
    SUM(CASE 
      WHEN UPPER(PLUSCO_MEDIA_PARTNER) = 'META' 
        AND UPPER(PLUSCO_MEDIA_CHANNEL) = 'SOCIAL' 
        AND PLUSCO_YEAR = '2026' 
      THEN NET_ORDERED_CAD ELSE 0 
    END) AS meta_2026,
    SUM(CASE
      WHEN PLUSCO_YEAR = '2026'
        AND (
          UPPER(PLUSCO_MEDIA_CHANNEL) = 'SOCIAL'
          OR (UPPER(PLUSCO_MEDIA_PARTNER) = 'MIQ' AND UPPER(BUYTYPE) = 'SOCIAL')
        )
      THEN NET_ORDERED_CAD ELSE 0 
    END) AS social_2026,
    SUM(CASE 
      WHEN UPPER(PLUSCO_MEDIA_PARTNER) = 'META' 
        AND UPPER(PLUSCO_MEDIA_CHANNEL) = 'SOCIAL' 
        AND PLUSCO_YEAR = '2025' 
      THEN NET_ORDERED_CAD ELSE 0 
    END) AS meta_2025,
    SUM(CASE
      WHEN PLUSCO_YEAR = '2025'
        AND (
          UPPER(PLUSCO_MEDIA_CHANNEL) = 'SOCIAL'
          OR (UPPER(PLUSCO_MEDIA_PARTNER) = 'MIQ' AND UPPER(BUYTYPE) = 'SOCIAL')
        )
      THEN NET_ORDERED_CAD ELSE 0 
    END) AS social_2025,
    -- MIQ-Social spend from native (2026 only)
    SUM(CASE
      WHEN UPPER(PLUSCO_MEDIA_PARTNER) = 'MIQ'
        AND UPPER(BUYTYPE) = 'SOCIAL'
        AND PLUSCO_YEAR = '2026'
      THEN NET_ORDERED_CAD ELSE 0
    END) AS miq_social_mir_2026
  FROM `plusco-media-invest-solutions.PCC_Media_Investment.PCC_Dashboard_NATIVE`
  WHERE
    (
      UPPER(PLUSCO_MEDIA_CHANNEL) = 'SOCIAL'
      OR (UPPER(PLUSCO_MEDIA_PARTNER) = 'MIQ' AND UPPER(BUYTYPE) = 'SOCIAL')
    )
    AND NET_ORDERED_CAD != 0
  GROUP BY PLUSCO_CLIENT_ID, PLUSCO_YEAR, MONTH
),
-- Annual 2025 + 2026 totals
annual_for_target AS (
  SELECT
    PLUSCO_CLIENT_ID,
    SUM(CASE 
      WHEN UPPER(PLUSCO_MEDIA_PARTNER) = 'META' 
        AND UPPER(PLUSCO_MEDIA_CHANNEL) = 'SOCIAL' 
        AND PLUSCO_YEAR = '2025'
      THEN NET_ORDERED_CAD ELSE 0 
    END) AS meta_2025_annual,
    SUM(CASE
      WHEN PLUSCO_YEAR = '2025'
        AND (
          UPPER(PLUSCO_MEDIA_CHANNEL) = 'SOCIAL'
          OR (UPPER(PLUSCO_MEDIA_PARTNER) = 'MIQ' AND UPPER(BUYTYPE) = 'SOCIAL')
        )
      THEN NET_ORDERED_CAD ELSE 0 
    END) AS social_2025_annual,
    SUM(CASE 
      WHEN UPPER(PLUSCO_MEDIA_PARTNER) = 'META' 
        AND UPPER(PLUSCO_MEDIA_CHANNEL) = 'SOCIAL' 
        AND PLUSCO_YEAR = '2026'
      THEN NET_ORDERED_CAD ELSE 0 
    END) AS meta_2026_annual,
    SUM(CASE
      WHEN PLUSCO_YEAR = '2026'
        AND (
          UPPER(PLUSCO_MEDIA_CHANNEL) = 'SOCIAL'
          OR (UPPER(PLUSCO_MEDIA_PARTNER) = 'MIQ' AND UPPER(BUYTYPE) = 'SOCIAL')
        )
      THEN NET_ORDERED_CAD ELSE 0
    END) AS social_2026_annual
  FROM `plusco-media-invest-solutions.PCC_Media_Investment.PCC_Dashboard_NATIVE`
  GROUP BY 1
),
-- 2025 meta share per (client × month) for v2 same-period target
monthly_share_2025 AS (
  SELECT
    PLUSCO_CLIENT_ID,
    CONCAT('2026-', SUBSTR(MONTH, 6, 2)) AS comparable_month_key,
    SUM(CASE 
      WHEN UPPER(PLUSCO_MEDIA_PARTNER) = 'META' 
        AND UPPER(PLUSCO_MEDIA_CHANNEL) = 'SOCIAL' 
      THEN NET_ORDERED_CAD ELSE 0 
    END) AS month_meta_2025,
    SUM(CASE
      WHEN (UPPER(PLUSCO_MEDIA_CHANNEL) = 'SOCIAL'
            OR (UPPER(PLUSCO_MEDIA_PARTNER) = 'MIQ' AND UPPER(BUYTYPE) = 'SOCIAL'))
      THEN NET_ORDERED_CAD ELSE 0 
    END) AS month_social_2025
  FROM `plusco-media-invest-solutions.PCC_Media_Investment.PCC_Dashboard_NATIVE`
  WHERE PLUSCO_YEAR = '2025'
    AND (
      UPPER(PLUSCO_MEDIA_CHANNEL) = 'SOCIAL'
      OR (UPPER(PLUSCO_MEDIA_PARTNER) = 'MIQ' AND UPPER(BUYTYPE) = 'SOCIAL')
    )
  GROUP BY 1, 2
),
-- Forecast at MONTHLY grain  (REPOINTED to forecaster_1 RFQ3)
-- social_forecast_rfq2 = media 'Social'; miq_social_forecast_rfq2 = labs 'MIQ-Social'.
-- Dims from clients (cur); scenario + status from the sheet (sheet_dims). Aliases unchanged.
forecast_monthly AS (
  SELECT
    f.client_id AS FO_Client,
    CONCAT(CAST(f.year AS STRING), '-', FORMAT('%02d', f.month)) AS forecast_month_key,
    ANY_VALUE(cur.client_name)          AS CL_Name,
    ANY_VALUE(cur.agency)               AS CL_Agency,
    ANY_VALUE(cur.gm_pod)               AS GM_Pod,
    ANY_VALUE(cur.bu_region)            AS CL_Business_Unit_Region,
    ANY_VALUE(cur.business_lead)        AS CL_Business_Lead,
    ANY_VALUE(sd.Client_Status_2026)    AS Client_Status_2026,
    ANY_VALUE(sd.scenario_meta_mapping) AS scenario_meta_mapping,
    SUM(CASE
      WHEN f.axis = 'media' AND UPPER(f.category) = 'SOCIAL'
      THEN f.amount * CASE WHEN UPPER(TRIM(cur.currency)) = 'USD' THEN 1.3978 ELSE 1 END
      ELSE 0
    END) AS social_forecast_rfq2,
    SUM(CASE
      WHEN f.axis = 'labs' AND UPPER(f.category) = 'MIQ-SOCIAL'
      THEN f.amount * CASE WHEN UPPER(TRIM(cur.currency)) = 'USD' THEN 1.3978 ELSE 1 END
      ELSE 0
    END) AS miq_social_forecast_rfq2
  FROM `pluscoops.forecaster_1.forecast` AS f
  LEFT JOIN cur        ON cur.client_id = f.client_id
  LEFT JOIN sheet_dims sd ON sd.FO_Client = f.client_id
  WHERE f.year = 2026
    AND f.revision = 'RFQ3'
    AND (
      (f.axis = 'media' AND UPPER(f.category) = 'SOCIAL')
      OR (f.axis = 'labs' AND UPPER(f.category) = 'MIQ-SOCIAL')
    )
    AND f.client_id <> 'CL_1_TEST_CLIENT_1782846811711'
    AND COALESCE(cur.is_hidden, FALSE) = FALSE
  GROUP BY f.client_id, f.year, f.month
),
-- Annual forecast  (REPOINTED to forecaster_1 RFQ3)
forecast_annual AS (
  SELECT
    f.client_id AS FO_Client,
    SUM(CASE
      WHEN f.axis = 'media' AND UPPER(f.category) = 'SOCIAL'
      THEN f.amount * CASE WHEN UPPER(TRIM(cur.currency)) = 'USD' THEN 1.3978 ELSE 1 END
      ELSE 0
    END) AS social_forecast_annual,
    SUM(CASE
      WHEN f.axis = 'labs' AND UPPER(f.category) = 'MIQ-SOCIAL'
      THEN f.amount * CASE WHEN UPPER(TRIM(cur.currency)) = 'USD' THEN 1.3978 ELSE 1 END
      ELSE 0
    END) AS miq_social_forecast_annual
  FROM `pluscoops.forecaster_1.forecast` AS f
  LEFT JOIN cur ON cur.client_id = f.client_id
  WHERE f.year = 2026
    AND f.revision = 'RFQ3'
    AND (
      (f.axis = 'media' AND UPPER(f.category) = 'SOCIAL')
      OR (f.axis = 'labs' AND UPPER(f.category) = 'MIQ-SOCIAL')
    )
    AND f.client_id <> 'CL_1_TEST_CLIENT_1782846811711'
    AND COALESCE(cur.is_hidden, FALSE) = FALSE
  GROUP BY f.client_id
),
-- Client dims  (REPOINTED: dims from clients; scenario + status from the sheet)
forecast_client_dims AS (
  SELECT
    c.client_id              AS FO_Client,
    c.client_name            AS CL_Name,
    c.agency                 AS CL_Agency,
    c.gm_pod                 AS GM_Pod,
    c.bu_region              AS CL_Business_Unit_Region,
    c.business_lead          AS CL_Business_Lead,
    sd.Client_Status_2026    AS Client_Status_2026,
    sd.scenario_meta_mapping AS scenario_meta_mapping
  FROM cur AS c
  LEFT JOIN sheet_dims sd ON sd.FO_Client = c.client_id
),
labs_pacing_metrics AS (
  SELECT
    client_id,
    FORMAT('%d-%02d',
      SAFE_CAST(SPLIT(year_month, '-')[OFFSET(1)] AS INT64),
      SAFE_CAST(SPLIT(year_month, '-')[OFFSET(0)] AS INT64)
    ) AS month_key,
    SUM(total_labs_booked)   AS total_labs_booked,
    MAX(total_labs_forecast) AS total_labs_forecast_monthly
  FROM `plusco-media-invest-solutions.PCC_Media_Investment.labs_pacing_wide`
  GROUP BY client_id, year_month
),
labs_forecast_annual AS (
  SELECT
    client_id,
    SUM(total_labs_forecast) AS total_labs_forecast_annual
  FROM (
    SELECT DISTINCT client_id, year_month, total_labs_forecast
    FROM `plusco-media-invest-solutions.PCC_Media_Investment.labs_pacing_wide`
  )
  GROUP BY client_id
),
-- OPTION 1: Monthly target using ANNUAL 2025 meta share
monthly_target_annual_share AS (
  SELECT
    fm.FO_Client AS client_id,
    fm.forecast_month_key,
    CASE
      WHEN COALESCE(fm.social_forecast_rfq2, 0) = 0
        THEN 0
      WHEN COALESCE(a.social_2025_annual, 0) = 0
        OR COALESCE(a.meta_2025_annual, 0) = 0
        THEN fm.social_forecast_rfq2 * 0.67 * 0.70
      ELSE
        fm.social_forecast_rfq2 * SAFE_DIVIDE(a.meta_2025_annual, a.social_2025_annual) * 0.70
    END AS target_annual_share
  FROM forecast_monthly fm
  LEFT JOIN annual_for_target a
    ON fm.FO_Client = a.PLUSCO_CLIENT_ID
),
-- OPTION 2 (v2): Monthly target using SAME-PERIOD 2025 meta share
monthly_target_same_period AS (
  SELECT
    fm.FO_Client AS client_id,
    fm.forecast_month_key,
    CASE
      WHEN COALESCE(fm.social_forecast_rfq2, 0) = 0
        THEN 0
      -- Tier 1: Same-month 2025 data exists
      WHEN COALESCE(s.month_social_2025, 0) > 0
        AND COALESCE(s.month_meta_2025, 0) > 0
        THEN fm.social_forecast_rfq2 * SAFE_DIVIDE(s.month_meta_2025, s.month_social_2025) * 0.70
      -- Tier 2: No same-month data but annual 2025 history exists
      WHEN COALESCE(a.social_2025_annual, 0) > 0
        AND COALESCE(a.meta_2025_annual, 0) > 0
        THEN fm.social_forecast_rfq2 * SAFE_DIVIDE(a.meta_2025_annual, a.social_2025_annual) * 0.70
      -- Tier 3: No 2025 history → 67% × 0.70 fallback
      ELSE
        fm.social_forecast_rfq2 * 0.67 * 0.70
    END AS target_same_period_share
  FROM forecast_monthly fm
  LEFT JOIN monthly_share_2025 s
    ON fm.FO_Client = s.PLUSCO_CLIENT_ID
    AND fm.forecast_month_key = s.comparable_month_key
  LEFT JOIN annual_for_target a
    ON fm.FO_Client = a.PLUSCO_CLIENT_ID
),
-- Annual target (used by old pre-computed columns)
annual_target AS (
  SELECT
    fa.FO_Client AS client_id,
    CASE
      WHEN COALESCE(fa.social_forecast_annual, 0) = 0
        THEN 0
      WHEN COALESCE(a.social_2025_annual, 0) = 0
        OR COALESCE(a.meta_2025_annual, 0) = 0
        THEN fa.social_forecast_annual * 0.67 * 0.70
      ELSE
        fa.social_forecast_annual * SAFE_DIVIDE(a.meta_2025_annual, a.social_2025_annual) * 0.70
    END AS target_meta_spend_2026_annual
  FROM forecast_annual fa
  LEFT JOIN annual_for_target a
    ON fa.FO_Client = a.PLUSCO_CLIENT_ID
),
canonical_month AS (
  SELECT
    PLUSCO_CLIENT_ID,
    MIN(CASE WHEN PLUSCO_YEAR = '2026' THEN MONTH END) AS canonical_month_2026,
    MIN(CASE WHEN PLUSCO_YEAR = '2025' THEN MONTH END) AS canonical_month_2025
  FROM `plusco-media-invest-solutions.PCC_Media_Investment.PCC_Dashboard_NATIVE`
  WHERE
    (
      UPPER(PLUSCO_MEDIA_CHANNEL) = 'SOCIAL'
      OR (UPPER(PLUSCO_MEDIA_PARTNER) = 'MIQ' AND UPPER(BUYTYPE) = 'SOCIAL')
    )
    AND NET_ORDERED_CAD != 0
  GROUP BY 1
),
-- Full client universe from PCC_Dashboard_NATIVE (all channels)
-- Uses GROUP BY + MAX to guarantee exactly ONE row per PLUSCO_CLIENT_ID.
all_clients AS (
  SELECT
    PLUSCO_CLIENT_ID,
    MAX(PLUSCO_CLIENT_NAME)          AS PLUSCO_CLIENT_NAME,
    MAX(INITCAP(AGENCY))             AS AGENCY,
    MAX(BU_REGION)                   AS BU_REGION,
    MAX(BUSINESS_LEAD)               AS BUSINESS_LEAD,
    MAX(GM_POD)                      AS GM_POD,
    MAX(CLIENT_STATUS_IN_2026)       AS CLIENT_STATUS_IN_2026
  FROM `plusco-media-invest-solutions.PCC_Media_Investment.PCC_Dashboard_NATIVE`
  WHERE PLUSCO_CLIENT_ID IS NOT NULL
  GROUP BY 1
),
-- =====================================================================
-- EXPANDED client_month_universe:
-- Includes native social rows + forecast rows + all KPI-universe clients
-- =====================================================================
client_month_universe AS (
  -- Branch 1: clients with actual social spend rows
  SELECT DISTINCT
    PLUSCO_CLIENT_ID AS client_id,
    MONTH AS month_key
  FROM native_metrics
  WHERE PLUSCO_CLIENT_ID IS NOT NULL

  UNION DISTINCT

  -- Branch 2: clients with forecast rows
  SELECT DISTINCT
    FO_Client AS client_id,
    forecast_month_key AS month_key
  FROM forecast_monthly
  WHERE FO_Client IS NOT NULL

  UNION DISTINCT

  -- Branch 3: clients in KPI universe but not in branches 1 or 2
  SELECT
    ac.PLUSCO_CLIENT_ID AS client_id,
    '2026-01' AS month_key
  FROM all_clients ac
  WHERE ac.PLUSCO_CLIENT_ID NOT IN (
    SELECT DISTINCT PLUSCO_CLIENT_ID FROM native_metrics WHERE PLUSCO_CLIENT_ID IS NOT NULL
  )
  AND ac.PLUSCO_CLIENT_ID NOT IN (
    SELECT DISTINCT FO_Client FROM forecast_monthly WHERE FO_Client IS NOT NULL
  )
)
SELECT
  -- Dimensions
  COALESCE(n.PLUSCO_CLIENT_NAME, fcd.CL_Name, ac.PLUSCO_CLIENT_NAME)          AS PLUSCO_CLIENT_NAME,
  u.client_id                                                                  AS PLUSCO_CLIENT_ID,
  COALESCE(NULLIF(n.AGENCY, '#N/A'), INITCAP(fcd.CL_Agency), ac.AGENCY)       AS AGENCY,
  COALESCE(NULLIF(n.BU_REGION, '#N/A'), fcd.CL_Business_Unit_Region, ac.BU_REGION) AS BU_REGION,
  COALESCE(NULLIF(n.BUSINESS_LEAD, '#N/A'), fcd.CL_Business_Lead, ac.BUSINESS_LEAD) AS BUSINESS_LEAD,
  COALESCE(NULLIF(n.GM_POD, '#N/A'), fcd.GM_Pod, ac.GM_POD)                   AS GM_POD,
  COALESCE(NULLIF(n.CLIENT_STATUS_IN_2026, '#N/A'), fcd.Client_Status_2026, ac.CLIENT_STATUS_IN_2026) AS CLIENT_STATUS_IN_2026,
  fcd.scenario_meta_mapping                                                    AS scenario_meta_mapping,
  -- Raw spend metrics (per row = per month)
  COALESCE(n.meta_2026, 0)                                             AS meta_2026,
  COALESCE(n.social_2026, 0)                                           AS social_2026,
  COALESCE(n.meta_2025, 0)                                             AS meta_2025,
  COALESCE(n.social_2025, 0)                                           AS social_2025,
  COALESCE(n.social_2026, 0) - COALESCE(n.meta_2026, 0)                AS other_platforms_spend_2026,
  COALESCE(n.social_2025, 0) - COALESCE(n.meta_2025, 0)                AS other_platforms_spend_2025,
  -- MIQ-Social spend from native (2026)
  COALESCE(n.miq_social_mir_2026, 0)                                   AS miq_social_mir_2026,
  -- Forecast and target metrics (monthly grain)
  -- Source = forecaster_1 RFQ3 (rfq2 cols); output aliases kept as rfq1 for Looker compatibility
  COALESCE(fm.social_forecast_rfq2, 0)                                 AS social_forecast_rfq1,
  COALESCE(fm.miq_social_forecast_rfq2, 0)                             AS miq_social_forecast_rfq1,
  -- MIQ-Social pacing (spend vs forecast)
  SAFE_DIVIDE(
    COALESCE(n.miq_social_mir_2026, 0),
    NULLIF(fm.miq_social_forecast_rfq2, 0)
  )                                                                    AS miq_social_pacing,
  -- TARGET OPTIONS
  -- OPTION 1: Annual 2025 meta share × monthly forecast × 0.70
  COALESCE(mta.target_annual_share, 0)                                 AS target_meta_spend_2026,
  -- OPTION 2 (v2): Same-month 2025 meta share × monthly forecast × 0.70
  COALESCE(mtsp.target_same_period_share, 0)                           AS target_meta_spend_2026_v2,
  -- Labs metrics
  COALESCE(lpm.total_labs_forecast_monthly, 0)                         AS total_labs_forecast,
  COALESCE(lpm.total_labs_booked, 0)                                   AS total_labs_booked,
  -- ====================================================================
  -- OLD PRE-COMPUTED COLUMNS (kept for backward compatibility)
  -- ====================================================================
  SAFE_DIVIDE(a.meta_2026_annual, a.social_2026_annual)                AS meta_share_social_2026,
  SAFE_DIVIDE(a.meta_2025_annual, a.social_2025_annual)                AS meta_share_social_2025,
  SAFE_DIVIDE(a.meta_2026_annual, a.social_2026_annual)
  - SAFE_DIVIDE(a.meta_2025_annual, a.social_2025_annual)              AS meta_share_variance,
  SAFE_DIVIDE(a.meta_2026_annual, a.social_2026_annual)
  - SAFE_DIVIDE(antt.target_meta_spend_2026_annual, fa.social_forecast_annual) AS meta_share_vs_target,
  SAFE_DIVIDE(a.meta_2026_annual, antt.target_meta_spend_2026_annual)  AS spend_pacing,
  SAFE_DIVIDE(EXTRACT(MONTH FROM CURRENT_DATE()), 12)                  AS pct_year_complete,
  SAFE_DIVIDE(
    SAFE_DIVIDE(a.meta_2026_annual, antt.target_meta_spend_2026_annual),
    SAFE_DIVIDE(EXTRACT(MONTH FROM CURRENT_DATE()), 12)
  ) * 100                                                              AS pacing_index,
  SAFE_DIVIDE(
    a.meta_2026_annual - a.meta_2025_annual,
    a.meta_2025_annual
  )                                                                    AS meta_spend_variance_yoy,
  SAFE_DIVIDE(a.meta_2026_annual, a.social_2026_annual)
  - SAFE_DIVIDE(a.meta_2025_annual, a.social_2025_annual)              AS meta_share_variance_annual,
  SAFE_DIVIDE(antt.target_meta_spend_2026_annual, fa.social_forecast_annual) AS target_meta_share_2026,
  -- ====================================================================
  -- Meta Share Trend (3 categories)
  -- ====================================================================
  CASE
    -- Exclude BRP (Meta spend not reported in Mediaocean)
    WHEN UPPER(COALESCE(n.PLUSCO_CLIENT_NAME, fcd.CL_Name, ac.PLUSCO_CLIENT_NAME)) = 'BRP'
      THEN NULL
    WHEN COALESCE(a.meta_2025_annual, 0) = 0
      AND COALESCE(a.meta_2026_annual, 0) = 0
      THEN 'Divested Meta Share'
    WHEN COALESCE(a.meta_2025_annual, 0) > 0
      AND COALESCE(a.meta_2026_annual, 0) = 0
      THEN 'Divested Meta Share'
    WHEN COALESCE(a.meta_2025_annual, 0) = 0
      AND COALESCE(a.meta_2026_annual, 0) > 0
      THEN 'Increasing Meta Share'
    WHEN SAFE_DIVIDE(a.meta_2026_annual, a.social_2026_annual)
       - SAFE_DIVIDE(a.meta_2025_annual, a.social_2025_annual) <= -0.01
      THEN 'Divested Meta Share'
    WHEN SAFE_DIVIDE(a.meta_2026_annual, a.social_2026_annual)
       - SAFE_DIVIDE(a.meta_2025_annual, a.social_2025_annual) >= 0.01
      THEN 'Increasing Meta Share'
    ELSE 'Flat Meta Share'
  END                                                                  AS meta_share_trend,
  CASE
    WHEN COALESCE(fa.social_forecast_annual, 0) = 0
      AND COALESCE(a.meta_2026_annual, 0) = 0                          THEN 'No Social Forecast'
    WHEN COALESCE(fa.social_forecast_annual, 0) = 0
      AND COALESCE(a.social_2026_annual, 0) > 0                        THEN 'Social Forecast Missing in MBF'
    WHEN COALESCE(a.meta_2026_annual, 0) = 0
      AND COALESCE(fa.social_forecast_annual, 0) > 0                   THEN 'No Meta Spend Yet'
    WHEN SAFE_DIVIDE(
      SAFE_DIVIDE(a.meta_2026_annual, antt.target_meta_spend_2026_annual),
      SAFE_DIVIDE(EXTRACT(MONTH FROM CURRENT_DATE()), 12)
    ) * 100 >= 100                                                      THEN 'Overpacing'
    ELSE 'OK'
  END                                                                  AS meta_spend_pacing_trend,
  CASE
    WHEN COALESCE(a.meta_2025_annual, 0) = 0
      THEN 'No Data'
    WHEN SAFE_DIVIDE(
      a.meta_2026_annual - a.meta_2025_annual,
      a.meta_2025_annual
    ) <= -0.30
      THEN 'YOY Divestment of min. 30%'
    WHEN SAFE_DIVIDE(
      a.meta_2026_annual - a.meta_2025_annual,
      a.meta_2025_annual
    ) > -0.30
      THEN 'Divestment Shortfall'
    ELSE 'No Data'
  END                                                                  AS Flag_Meta_Spend_YOY,
  CASE
    WHEN COALESCE(a.social_2026_annual, 0) = 0
      THEN 'No Data'
    WHEN SAFE_DIVIDE(a.meta_2026_annual, a.social_2026_annual)
       - SAFE_DIVIDE(antt.target_meta_spend_2026_annual, fa.social_forecast_annual) <= 0
      THEN 'Divestment Target Achieved'
    WHEN SAFE_DIVIDE(a.meta_2026_annual, a.social_2026_annual)
       - SAFE_DIVIDE(antt.target_meta_spend_2026_annual, fa.social_forecast_annual) > 0
      THEN 'Divestment Target Unmet'
    ELSE 'No Data'
  END                                                                  AS Flag_Meta_Share_vs_Target,
  CASE
    WHEN COALESCE(fa.social_forecast_annual, 0) = 0
      AND COALESCE(a.meta_2026_annual, 0) = 0                          THEN 'No Social Forecast'
    WHEN COALESCE(fa.social_forecast_annual, 0) = 0
      AND COALESCE(a.social_2026_annual, 0) > 0                        THEN 'Social Forecast Missing in MBF'
    WHEN COALESCE(a.meta_2026_annual, 0) = 0
      AND COALESCE(fa.social_forecast_annual, 0) > 0                   THEN 'No Meta Spend Yet'
    WHEN SAFE_DIVIDE(
      SAFE_DIVIDE(a.meta_2026_annual, antt.target_meta_spend_2026_annual),
      SAFE_DIVIDE(EXTRACT(MONTH FROM CURRENT_DATE()), 12)
    ) * 100 >= 100                                                      THEN 'Overpacing'
    ELSE 'OK'
  END                                                                  AS Flag_Meta_Spend_vs_Target,
  -- Date identifiers
  CASE
    WHEN STARTS_WITH(u.month_key, '2026') THEN '2026'
    WHEN STARTS_WITH(u.month_key, '2025') THEN '2025'
    ELSE NULL
  END                                                                  AS PLUSCO_YEAR,
  u.month_key                                                          AS MONTH,
  PARSE_DATE('%Y-%m', u.month_key)                                     AS MONTH_DATE,
  FORMAT_DATE('%b %Y', PARSE_DATE('%Y-%m', u.month_key))               AS month_label
FROM client_month_universe u
LEFT JOIN native_metrics n
  ON u.client_id = n.PLUSCO_CLIENT_ID
  AND u.month_key = n.MONTH
LEFT JOIN forecast_monthly fm
  ON u.client_id = fm.FO_Client
  AND u.month_key = fm.forecast_month_key
LEFT JOIN forecast_annual fa
  ON u.client_id = fa.FO_Client
LEFT JOIN forecast_client_dims fcd
  ON u.client_id = fcd.FO_Client
LEFT JOIN monthly_target_annual_share mta
  ON u.client_id = mta.client_id
  AND u.month_key = mta.forecast_month_key
LEFT JOIN monthly_target_same_period mtsp
  ON u.client_id = mtsp.client_id
  AND u.month_key = mtsp.forecast_month_key
LEFT JOIN annual_target antt
  ON u.client_id = antt.client_id
LEFT JOIN annual_for_target a
  ON u.client_id = a.PLUSCO_CLIENT_ID
LEFT JOIN labs_pacing_metrics lpm
  ON u.client_id = lpm.client_id
  AND u.month_key = lpm.month_key
LEFT JOIN labs_forecast_annual lfa
  ON u.client_id = lfa.client_id
LEFT JOIN all_clients ac
  ON u.client_id = ac.PLUSCO_CLIENT_ID
ORDER BY PLUSCO_CLIENT_NAME, u.month_key;
