-- filepath: bq/labs_pacing_unified.sql
-- View PCC_Media_Investment.labs_pacing_unified: Labs forecast (Forecaster, 2026, RFQ3) and booked
-- (PCC_Dashboard_NATIVE) per client × partner × month, long format. Read by labs_pacing_wide.
-- Before 2026-11-20 this view lived only in BigQuery; this file is now its source of truth.
-- CHANGE (MIQ-SEM, 2026-11-20): MIQ search is its own Labs partner (Adriana). Forecast category
--   'MIQ-SEM' is read, and booked MIQ rows with BUYTYPE SEARCH or OTHER become 'MIQ-SEM' (before, they were
--   in no Labs bucket: MIQ-PROG took only Display / Video).
-- CHANGE (AIM split, 2026-11-20): booked AIM rows are split by buy type like MIQ (Adriana): Social ->
--   AIM-SOCIAL, Search / Other -> AIM-SEM, else AIM-PROG. labs_pacing_wide already sums every AIM
--   variant into forecast_aim / booked_aim, so AIM totals are unchanged.
CREATE OR REPLACE VIEW `plusco-media-invest-solutions.PCC_Media_Investment.labs_pacing_unified` AS
WITH cur AS (
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

forecast AS (
  SELECT
    f.client_id                        AS client_id,
    ANY_VALUE(cur.client_name)         AS client_name,
    ANY_VALUE(cur.agency)              AS agency,
    ANY_VALUE(cur.bu_region)           AS bu_region,
    ANY_VALUE(cur.business_lead)       AS business_lead,
    ANY_VALUE(cur.gm_pod)              AS gm_pod,
    UPPER(f.category)                  AS labs_partner,
    f.month                            AS month_num,
    f.year                             AS year,
    FORMAT('%02d-%d', f.month, f.year) AS year_month,
    CASE
      WHEN f.month BETWEEN 1 AND 3   THEN 'Q1'
      WHEN f.month BETWEEN 4 AND 6   THEN 'Q2'
      WHEN f.month BETWEEN 7 AND 9   THEN 'Q3'
      WHEN f.month BETWEEN 10 AND 12 THEN 'Q4'
    END                                AS quarter,
    'Forecast'                         AS metric_type,
    SUM(f.amount * CASE WHEN UPPER(TRIM(cur.currency)) = 'USD' THEN 1.3978 ELSE 1 END) AS value_cad
  FROM `pluscoops.forecaster_1.forecast` AS f
  LEFT JOIN cur ON cur.client_id = f.client_id
  WHERE f.year = 2026
    AND f.axis = 'labs'
    AND f.revision = 'RFQ3'
    AND UPPER(f.category) IN (
      'AMAZON', 'BILLUPS-OOH', 'BILLUPS-PRINT',
      'MIQ-PROG', 'MIQ-SOCIAL', 'MIQ-SEM', 'QUANTCAST', 'YAHOO',
      -- AIM split (added): keep 'AIM' for legacy, add the three new categories.
      'AIM', 'AIM-PROG', 'AIM-SOCIAL', 'AIM-SEM',
      'STACKADAPT', 'REDDIT'
    )
    AND f.client_id <> 'CL_1_TEST_CLIENT_1782846811711'
    AND COALESCE(cur.is_hidden, FALSE) = FALSE
  GROUP BY
    f.client_id,
    UPPER(f.category),
    f.month,
    f.year
),

booked_raw AS (
  SELECT
    PLUSCO_CLIENT_ID                  AS client_id,
    PLUSCO_CLIENT_NAME                AS client_name,
    AGENCY                            AS agency,
    BU_REGION                         AS bu_region,
    BUSINESS_LEAD                     AS business_lead,
    GM_POD                            AS gm_pod,
    CASE
      WHEN UPPER(PLUSCO_MEDIA_PARTNER) = 'AMAZON'        THEN 'AMAZON'
      WHEN UPPER(PLUSCO_MEDIA_PARTNER) = 'QUANTCAST'     THEN 'QUANTCAST'
      WHEN UPPER(PLUSCO_MEDIA_PARTNER) = 'YAHOO'         THEN 'YAHOO'
      WHEN UPPER(PLUSCO_MEDIA_PARTNER) = 'AIM'
        AND UPPER(BUYTYPE) = 'SOCIAL'                    THEN 'AIM-SOCIAL'
      WHEN UPPER(PLUSCO_MEDIA_PARTNER) = 'AIM'
        AND UPPER(BUYTYPE) IN ('SEARCH', 'OTHER')        THEN 'AIM-SEM'
      WHEN UPPER(PLUSCO_MEDIA_PARTNER) = 'AIM'           THEN 'AIM-PROG'
      -- AIM split (added): booked AIM rows already tagged with the split name.
      WHEN UPPER(PLUSCO_MEDIA_PARTNER) = 'AIM-PROG'      THEN 'AIM-PROG'
      WHEN UPPER(PLUSCO_MEDIA_PARTNER) = 'AIM-SOCIAL'    THEN 'AIM-SOCIAL'
      WHEN UPPER(PLUSCO_MEDIA_PARTNER) = 'AIM-SEM'       THEN 'AIM-SEM'
      WHEN UPPER(PLUSCO_MEDIA_PARTNER) = 'STACKADAPT'    THEN 'STACKADAPT'
      WHEN UPPER(PLUSCO_MEDIA_PARTNER) = 'REDDIT'        THEN 'REDDIT'
      WHEN UPPER(PLUSCO_MEDIA_PARTNER) = 'BILLUPS'
        AND UPPER(PLUSCO_MEDIA_CHANNEL) = 'OOH'          THEN 'BILLUPS-OOH'
      WHEN UPPER(PLUSCO_MEDIA_PARTNER) = 'BILLUPS'
        AND UPPER(PLUSCO_MEDIA_CHANNEL) = 'PRINT'        THEN 'BILLUPS-PRINT'
      WHEN UPPER(PLUSCO_MEDIA_PARTNER) = 'MIQ'
        AND UPPER(BUYTYPE) = 'SOCIAL'                    THEN 'MIQ-SOCIAL'
      -- MIQ-SEM (2026-11-20): MIQ search (ChatGPT, SEM), buy type Search or Other.
      WHEN UPPER(PLUSCO_MEDIA_PARTNER) = 'MIQ'
        AND UPPER(BUYTYPE) IN ('SEARCH', 'OTHER')        THEN 'MIQ-SEM'
      WHEN UPPER(PLUSCO_MEDIA_PARTNER) = 'MIQ'
        AND UPPER(BUYTYPE) IN ('DISPLAY','VIDEO','DISPLAY&VIDEO') THEN 'MIQ-PROG'
    END                               AS labs_partner,
    SAFE_CAST(SPLIT(MONTH, '-')[SAFE_OFFSET(1)] AS INT64) AS month_num,
    SAFE_CAST(PLUSCO_YEAR AS INT64)   AS year,
    NET_ORDERED_CAD                   AS value_cad
  FROM `plusco-media-invest-solutions.PCC_Media_Investment.PCC_Dashboard_NATIVE`
  WHERE SAFE_CAST(PLUSCO_YEAR AS INT64) = 2026
),

booked AS (
  SELECT
    client_id,
    client_name,
    agency,
    bu_region,
    business_lead,
    gm_pod,
    labs_partner,
    month_num,
    year,
    FORMAT('%02d-%d', month_num, year) AS year_month,
    CASE
      WHEN month_num BETWEEN 1 AND 3   THEN 'Q1'
      WHEN month_num BETWEEN 4 AND 6   THEN 'Q2'
      WHEN month_num BETWEEN 7 AND 9   THEN 'Q3'
      WHEN month_num BETWEEN 10 AND 12 THEN 'Q4'
    END                               AS quarter,
    'Booked'                          AS metric_type,
    SUM(value_cad)                    AS value_cad
  FROM booked_raw
  WHERE labs_partner IS NOT NULL
  GROUP BY 1,2,3,4,5,6,7,8,9,10,11,12
)

SELECT * FROM forecast
UNION ALL
SELECT * FROM booked;
