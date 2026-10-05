-- MEDIAOCEAN_INVESTMENT_MIX — FIX: blank/null PLUSCO_MEDIA_PARTNER now buckets to
-- 'Other / Direct' so partner-less direct buys are counted (not dropped) by
-- Top Partners. Applies to all channels; KPI table already counts these rows.
CREATE OR REPLACE TABLE `plusco-media-invest-solutions.PCC_Media_Investment.MEDIAOCEAN_INVESTMENT_MIX` AS

WITH base AS (
  SELECT
    CAST(PLUSCO_YEAR AS STRING) AS PLUSCO_YEAR,
    MONTH,
    AGENCY,
    BU_REGION,
    BUSINESS_LEAD,
    GM_POD,
    PLUSCO_CLIENT_NAME,
    PLUSCO_MEDIA_CHANNEL,
    PLUSCO_MEDIA_PARTNER,
    PLUSCO_PROGRAMMATIC,
    PLUSCO_2026_DEALS,
    PLUSCO_DEALS_Type,
    NET_ORDERED_CAD
  FROM `plusco-media-invest-solutions.PCC_Media_Investment.PCC_Dashboard_NATIVE`
  WHERE PLUSCO_MEDIA_CHANNEL IS NOT NULL
    AND UPPER(TRIM(PLUSCO_MEDIA_CHANNEL)) NOT IN ('', '#N/A', 'N/A')
),

agg AS (
  SELECT
    PLUSCO_YEAR,
    MONTH,
    AGENCY,
    BU_REGION,
    BUSINESS_LEAD,
    GM_POD,
    PLUSCO_CLIENT_NAME,
    PLUSCO_MEDIA_CHANNEL,
    -- FIX: normalize blank/null partner to a single catch-all BEFORE grouping,
    -- so all partner-less rows in a client/channel/month/deal collapse into one
    -- 'Other / Direct' row instead of being dropped downstream.
    COALESCE(NULLIF(TRIM(PLUSCO_MEDIA_PARTNER), ''), 'Other / Direct') AS PLUSCO_MEDIA_PARTNER,
    PLUSCO_PROGRAMMATIC,
    PLUSCO_2026_DEALS,
    ANY_VALUE(PLUSCO_DEALS_Type) AS PLUSCO_DEALS_Type,
    ROUND(SUM(NET_ORDERED_CAD), 2) AS NET_ORDERED_CAD
  FROM base
  GROUP BY
    PLUSCO_YEAR,
    MONTH,
    AGENCY,
    BU_REGION,
    BUSINESS_LEAD,
    GM_POD,
    PLUSCO_CLIENT_NAME,
    PLUSCO_MEDIA_CHANNEL,
    -- group on the normalized partner (same expression as the SELECT)
    COALESCE(NULLIF(TRIM(PLUSCO_MEDIA_PARTNER), ''), 'Other / Direct'),
    PLUSCO_PROGRAMMATIC,
    PLUSCO_2026_DEALS
)

SELECT
  PLUSCO_YEAR,
  MONTH,
  SAFE.PARSE_DATE('%Y-%m', MONTH) AS MONTH_DATE,
  AGENCY,
  BU_REGION,
  BUSINESS_LEAD,
  GM_POD,
  PLUSCO_CLIENT_NAME,
  PLUSCO_MEDIA_CHANNEL,
  PLUSCO_MEDIA_PARTNER,
  PLUSCO_PROGRAMMATIC,
  PLUSCO_2026_DEALS,
  PLUSCO_DEALS_Type,
  NET_ORDERED_CAD
FROM agg
ORDER BY PLUSCO_YEAR DESC, NET_ORDERED_CAD DESC, MONTH;