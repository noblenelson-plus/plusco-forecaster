CREATE OR REPLACE TABLE `plusco-media-invest-solutions.PCC_Media_Investment.CHANNEL_MIX_2025_vs_2026` AS
WITH channel_totals AS (
  SELECT
    SUM(CASE WHEN PLUSCO_YEAR = '2025' THEN NET_ORDERED_CAD ELSE 0 END) AS total_2025,
    SUM(CASE WHEN PLUSCO_YEAR = '2026' THEN NET_ORDERED_CAD ELSE 0 END) AS total_2026
  FROM `plusco-media-invest-solutions.PCC_Media_Investment.PCC_Dashboard_NATIVE`
),
channel_spend AS (
  SELECT
    PLUSCO_MEDIA_CHANNEL,
    SUM(CASE WHEN PLUSCO_YEAR = '2025' THEN NET_ORDERED_CAD ELSE 0 END) AS spend_2025,
    SUM(CASE WHEN PLUSCO_YEAR = '2026' THEN NET_ORDERED_CAD ELSE 0 END) AS spend_2026
  FROM `plusco-media-invest-solutions.PCC_Media_Investment.PCC_Dashboard_NATIVE`
  GROUP BY 1
)
SELECT
  c.PLUSCO_MEDIA_CHANNEL,
  c.spend_2025,
  c.spend_2026,
  c.spend_2026 - c.spend_2025                                          AS variance_cad,
  SAFE_DIVIDE(c.spend_2026, t.total_2026)
  - SAFE_DIVIDE(c.spend_2025, t.total_2025)                            AS variance_ppt
FROM channel_spend c
CROSS JOIN channel_totals t
ORDER BY c.spend_2026 DESC