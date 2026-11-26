-- filepath: bq/PCC_Dashboard_NATIVE_LOCAL.sql
-- NATIVE with hybrid local/foreign rows split into LOCAL and FOREIGN by fixed channel ratios (Billups / DV360). Reads NATIVE.
-- Versioned 2026-11-26 from the SQL BigQuery last ran (job history), as run for the Nov 2026 MIR.
CREATE OR REPLACE TABLE `plusco-media-invest-solutions.PCC_Media_Investment.PCC_Dashboard_NATIVE_LOCAL` AS

WITH hybrid_ratios AS (
  -- Sources: Billups Spend Report (OOH, Print) | DV360 Jan-April 2026 excl BRP & YouTube (Programmatic)
  SELECT 'OOH' AS channel, 0.06 AS foreign_pct, 0.94 AS local_pct UNION ALL
  SELECT 'Print', 0.11, 0.89 UNION ALL
  SELECT 'Programmatic', 0.47, 0.53
),

src AS (
  SELECT * REPLACE (
    CASE WHEN PLUSCO_LOCAL_MEDIA = 'HYBRID/FOREIGN' THEN 'FOREIGN'
         ELSE PLUSCO_LOCAL_MEDIA END
    AS PLUSCO_LOCAL_MEDIA
  )
  FROM `plusco-media-invest-solutions.PCC_Media_Investment.PCC_Dashboard_NATIVE`
),

hybrid_split AS (
  SELECT
    s.* REPLACE (
      t.target_label AS PLUSCO_LOCAL_MEDIA,
      s.NET_ORDERED * t.pct AS NET_ORDERED,
      s.NET_ORDERED_CAD * t.pct AS NET_ORDERED_CAD,
      s.BILLABLE_NET * t.pct AS BILLABLE_NET,
      s.BILLED_NET * t.pct AS BILLED_NET,
      s.PAYABLE_NET * t.pct AS PAYABLE_NET,
      s.PAID_NET * t.pct AS PAID_NET,
      s.media_spend_target_distributed * t.pct AS media_spend_target_distributed
    )
  FROM src s
  JOIN hybrid_ratios r ON s.PLUSCO_MEDIA_CHANNEL = r.channel
  CROSS JOIN UNNEST([
    STRUCT('FOREIGN' AS target_label, r.foreign_pct AS pct),
    STRUCT('LOCAL' AS target_label, r.local_pct AS pct)
  ]) t
  WHERE s.PLUSCO_LOCAL_MEDIA = 'HYBRID'
),

passthrough AS (
  SELECT s.*
  FROM src s
  LEFT JOIN hybrid_ratios r ON s.PLUSCO_MEDIA_CHANNEL = r.channel
  WHERE s.PLUSCO_LOCAL_MEDIA != 'HYBRID'
     OR s.PLUSCO_LOCAL_MEDIA IS NULL
     OR r.channel IS NULL
)

SELECT * FROM passthrough
UNION ALL
SELECT * FROM hybrid_split
