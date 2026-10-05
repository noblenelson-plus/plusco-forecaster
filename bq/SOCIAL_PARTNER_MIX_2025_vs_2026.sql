CREATE OR REPLACE TABLE `plusco-media-invest-solutions.PCC_Media_Investment.SOCIAL_PARTNER_MIX_2025_vs_2026` AS
WITH base AS (
  SELECT
    AGENCY,
    BU_REGION,
    BUSINESS_LEAD,
    GM_POD,
    PLUSCO_CLIENT_NAME,
    MONTH,
    PLUSCO_YEAR,
    CASE 
      WHEN UPPER(PLUSCO_MEDIA_PARTNER) = 'MIQ' 
        AND UPPER(BUYTYPE) = 'SOCIAL'                THEN 'MIQ-SOCIAL'
      ELSE UPPER(PLUSCO_MEDIA_PARTNER)
    END                                              AS PLUSCO_MEDIA_PARTNER,
    PLUSCO_2026_DEALS,
    NET_ORDERED_CAD
  FROM `plusco-media-invest-solutions.PCC_Media_Investment.PCC_Dashboard_NATIVE`
  WHERE UPPER(PLUSCO_MEDIA_CHANNEL) = 'SOCIAL'
     OR (UPPER(PLUSCO_MEDIA_PARTNER) = 'MIQ' AND UPPER(BUYTYPE) = 'SOCIAL')
),
social_totals AS (
  SELECT
    AGENCY, BU_REGION, BUSINESS_LEAD, GM_POD, PLUSCO_CLIENT_NAME, MONTH,
    SUM(CASE WHEN PLUSCO_YEAR = '2025' THEN NET_ORDERED_CAD ELSE 0 END) AS total_social_2025,
    SUM(CASE WHEN PLUSCO_YEAR = '2026' THEN NET_ORDERED_CAD ELSE 0 END) AS total_social_2026
  FROM base
  GROUP BY 1, 2, 3, 4, 5, 6
),
annual_social_totals AS (
  SELECT
    AGENCY, BU_REGION, BUSINESS_LEAD, GM_POD, PLUSCO_CLIENT_NAME,
    SUM(CASE WHEN PLUSCO_YEAR = '2025' THEN NET_ORDERED_CAD ELSE 0 END) AS total_social_2025_annual,
    SUM(CASE WHEN PLUSCO_YEAR = '2026' THEN NET_ORDERED_CAD ELSE 0 END) AS total_social_2026_annual
  FROM base
  GROUP BY 1, 2, 3, 4, 5
),
partner_spend AS (
  SELECT
    AGENCY, BU_REGION, BUSINESS_LEAD, GM_POD, PLUSCO_CLIENT_NAME,
    PLUSCO_MEDIA_PARTNER,
    MONTH,
    MAX(CASE WHEN PLUSCO_YEAR = '2026' THEN PLUSCO_2026_DEALS END)       AS PLUSCO_2026_DEALS,
    SUM(CASE WHEN PLUSCO_YEAR = '2025' THEN NET_ORDERED_CAD ELSE 0 END)  AS spend_2025,
    SUM(CASE WHEN PLUSCO_YEAR = '2026' THEN NET_ORDERED_CAD ELSE 0 END)  AS spend_2026
  FROM base
  GROUP BY 1, 2, 3, 4, 5, 6, 7
),
partner_spend_annual AS (
  SELECT
    AGENCY, BU_REGION, BUSINESS_LEAD, GM_POD, PLUSCO_CLIENT_NAME,
    PLUSCO_MEDIA_PARTNER,
    SUM(CASE WHEN PLUSCO_YEAR = '2025' THEN NET_ORDERED_CAD ELSE 0 END)  AS spend_2025_annual,
    SUM(CASE WHEN PLUSCO_YEAR = '2026' THEN NET_ORDERED_CAD ELSE 0 END)  AS spend_2026_annual
  FROM base
  GROUP BY 1, 2, 3, 4, 5, 6
),
meta_target AS (
  SELECT
    SUM(target_meta_spend_2026)  AS portfolio_meta_target,
    SUM(social_forecast_rfq1)    AS portfolio_social_forecast
  FROM `plusco-media-invest-solutions.PCC_Media_Investment.META_SOCIAL_OUTPUT_2025_vs_2026`
)
SELECT
  p.AGENCY,
  p.BU_REGION,
  p.BUSINESS_LEAD,
  p.GM_POD,
  p.PLUSCO_CLIENT_NAME,
  p.PLUSCO_MEDIA_PARTNER,
  p.PLUSCO_2026_DEALS,
  p.spend_2025,
  p.spend_2026,
  pa.spend_2026_annual - pa.spend_2025_annual                            AS variance_cad,
  SAFE_DIVIDE(
    pa.spend_2026_annual - pa.spend_2025_annual,
    pa.spend_2025_annual
  )                                                                       AS spend_variance_pct,
  SAFE_DIVIDE(pa.spend_2025_annual, ast.total_social_2025_annual)         AS share_2025,
  SAFE_DIVIDE(pa.spend_2026_annual, ast.total_social_2026_annual)         AS share_2026,
  SAFE_DIVIDE(pa.spend_2026_annual, ast.total_social_2026_annual)
  - SAFE_DIVIDE(pa.spend_2025_annual, ast.total_social_2025_annual)       AS variance_ppt,
  CASE
    WHEN UPPER(p.PLUSCO_MEDIA_PARTNER) = 'META'
      THEN m.portfolio_meta_target
    ELSE NULL
  END                                                                     AS target_meta_spend_2026,
  CASE
    WHEN UPPER(p.PLUSCO_MEDIA_PARTNER) = 'META'
      THEN SAFE_DIVIDE(m.portfolio_meta_target, m.portfolio_social_forecast)
    ELSE NULL
  END                                                                     AS target_meta_share_2026,
  CASE
    WHEN UPPER(p.PLUSCO_MEDIA_PARTNER) = 'META'
      THEN SAFE_DIVIDE(pa.spend_2025_annual, ast.total_social_2025_annual)
    ELSE NULL
  END                                                                     AS meta_share_social_2025,
  CASE
    WHEN UPPER(p.PLUSCO_MEDIA_PARTNER) = 'META'
      THEN SAFE_DIVIDE(pa.spend_2026_annual, ast.total_social_2026_annual)
    ELSE NULL
  END                                                                     AS meta_share_social_2026,
  p.MONTH                                                                 AS MONTH,
  PARSE_DATE('%Y-%m', p.MONTH)                                            AS MONTH_DATE
FROM partner_spend p
JOIN social_totals t
  ON  p.AGENCY              = t.AGENCY
  AND p.BU_REGION           = t.BU_REGION
  AND p.BUSINESS_LEAD       = t.BUSINESS_LEAD
  AND p.GM_POD              = t.GM_POD
  AND p.PLUSCO_CLIENT_NAME  = t.PLUSCO_CLIENT_NAME
  AND p.MONTH               = t.MONTH
JOIN partner_spend_annual pa
  ON  p.AGENCY              = pa.AGENCY
  AND p.BU_REGION           = pa.BU_REGION
  AND p.BUSINESS_LEAD       = pa.BUSINESS_LEAD
  AND p.GM_POD              = pa.GM_POD
  AND p.PLUSCO_CLIENT_NAME  = pa.PLUSCO_CLIENT_NAME
  AND p.PLUSCO_MEDIA_PARTNER = pa.PLUSCO_MEDIA_PARTNER
JOIN annual_social_totals ast
  ON  p.AGENCY              = ast.AGENCY
  AND p.BU_REGION           = ast.BU_REGION
  AND p.BUSINESS_LEAD       = ast.BUSINESS_LEAD
  AND p.GM_POD              = ast.GM_POD
  AND p.PLUSCO_CLIENT_NAME  = ast.PLUSCO_CLIENT_NAME
CROSS JOIN meta_target m
ORDER BY pa.spend_2026_annual DESC, p.MONTH;