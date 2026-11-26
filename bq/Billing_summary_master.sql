-- filepath: bq/Billing_summary_master.sql
-- Typed billing table from the monthly Billing_Summary_2026_<MON> sheet (EXTERNAL). Repoint the FROM line each cycle. Synced by sync-billing-summary-raw.mjs.
-- Versioned 2026-11-26 from the SQL BigQuery last ran (job history), as run for the Nov 2026 MIR.
-- plusco-media-invest-solutions / PCC_Media_Investment
-- Rebuilds Billing_summary_master from the raw (all-STRING) load.
-- Financial columns -> FLOAT64 (strips $ and commas, SAFE so junk -> NULL).
-- Month columns (INVOICE_MONTH, MOSERV, DUEDATE) -> clean yyyy-mm text for month/year filtering.
-- INVOICE_DATE left as-is (string). All other descriptive columns pass through unchanged.
--
-- Change vs prior: surfaces mb_2_0_client_id / mb_2_0_client_name from MO_Client_Key so the
--   MediaBox "Billing Summary" tab can filter on the real MediaBox client id (it previously
--   filtered on forecaster_client_id, which never matches, so the tab came back empty).
--   The mb id/name are assigned ONLY where a client code maps to exactly one distinct mb id.
--   Codes that map to more than one (Cossette intercompany umbrella codes 1IA and 1IB, which
--   bundle several end-clients split by product code) are set to NULL rather than guessed, so
--   their billing is never mislabelled under an arbitrary client. Correct-or-absent, never wrong.
--   Existing forecaster_client_id / forecaster_client_name behaviour is intentionally unchanged.

CREATE OR REPLACE TABLE `plusco-media-invest-solutions.PCC_Media_Investment.Billing_summary_master` AS

WITH Deduplicated_Client_Key AS (
  -- One row per client code to prevent row duplication in the billing table.
  -- Unchanged from the original build: carries the forecaster id/name only.
  SELECT
    MO_client_id,
    forecaster_client_id,
    forecaster_client_name
  FROM (
    SELECT
      MO_client_id,
      forecaster_client_id,
      forecaster_client_name,
      ROW_NUMBER() OVER(PARTITION BY MO_client_id ORDER BY forecaster_client_id DESC) AS rn
    FROM `plusco-media-invest-solutions.Finance_mediabox.MO_Client_Key`
    WHERE MO_client_id IS NOT NULL
  )
  WHERE rn = 1
),

MB_Client_Key AS (
  -- One row per client code carrying the MediaBox 2.0 id/name.
  -- Only assigned when the code maps to a SINGLE distinct mb id; ambiguous codes
  -- (>1 distinct mb id, e.g. 1IA -> Airbus/RTC/Capsana/CAG, 1IB -> York/Princess Margaret)
  -- resolve to NULL so their billing is never tagged to the wrong client.
  -- TRIM on the id so MediaBox's exact-string filter isn't broken by stray whitespace.
  SELECT
    MO_client_id,
    CASE
      WHEN COUNT(DISTINCT TRIM(mb_2_0_client_id)) = 1
      THEN ANY_VALUE(TRIM(mb_2_0_client_id))
    END AS mb_2_0_client_id,
    CASE
      WHEN COUNT(DISTINCT TRIM(mb_2_0_client_id)) = 1
      THEN ANY_VALUE(TRIM(mb_2_0_client_name))
    END AS mb_2_0_client_name
  FROM `plusco-media-invest-solutions.Finance_mediabox.MO_Client_Key`
  WHERE MO_client_id IS NOT NULL
    AND mb_2_0_client_id IS NOT NULL
    AND TRIM(mb_2_0_client_id) != ''
  GROUP BY MO_client_id
)

SELECT
  -- Pass through every column EXCEPT the ones we re-type below
  b.* EXCEPT(
    MOSERV,
    DUEDATE,
    BALANCE,
    BILLEDNET,
    COMMISSION,
    BILNETANDCOM,
    GST,
    HST,
    QST,
    TOTALTAXES,
    TOTALINVAMT,
    CREDITS,
    BILL_TOTAL
  ),

  -- Month columns: "May/2026" -> "2026-05" text (sorts and filters cleanly as a string)
  FORMAT_DATE('%Y-%m', SAFE.PARSE_DATE('%b/%Y', b.MOSERV))  AS MOSERV,
  FORMAT_DATE('%Y-%m', SAFE.PARSE_DATE('%b/%Y', b.DUEDATE)) AS DUEDATE,

  -- Financial columns: strip $ and commas, cast to FLOAT64 (SAFE -> bad values become NULL)
  SAFE_CAST(TRIM(REPLACE(REPLACE(b.BALANCE,      '$', ''), ',', '')) AS FLOAT64) AS BALANCE,
  SAFE_CAST(TRIM(REPLACE(REPLACE(b.BILLEDNET,    '$', ''), ',', '')) AS FLOAT64) AS BILLEDNET,
  SAFE_CAST(TRIM(REPLACE(REPLACE(b.COMMISSION,   '$', ''), ',', '')) AS FLOAT64) AS COMMISSION,
  SAFE_CAST(TRIM(REPLACE(REPLACE(b.BILNETANDCOM, '$', ''), ',', '')) AS FLOAT64) AS BILNETANDCOM,
  SAFE_CAST(TRIM(REPLACE(REPLACE(b.GST,          '$', ''), ',', '')) AS FLOAT64) AS GST,
  SAFE_CAST(TRIM(REPLACE(REPLACE(b.HST,          '$', ''), ',', '')) AS FLOAT64) AS HST,
  SAFE_CAST(TRIM(REPLACE(REPLACE(b.QST,          '$', ''), ',', '')) AS FLOAT64) AS QST,
  SAFE_CAST(TRIM(REPLACE(REPLACE(b.TOTALTAXES,   '$', ''), ',', '')) AS FLOAT64) AS TOTALTAXES,
  SAFE_CAST(TRIM(REPLACE(REPLACE(b.TOTALINVAMT,  '$', ''), ',', '')) AS FLOAT64) AS TOTALINVAMT,
  SAFE_CAST(TRIM(REPLACE(REPLACE(b.CREDITS,      '$', ''), ',', '')) AS FLOAT64) AS CREDITS,
  SAFE_CAST(TRIM(REPLACE(REPLACE(b.BILL_TOTAL,   '$', ''), ',', '')) AS FLOAT64) AS BILL_TOTAL,

  -- Forecaster identifiers (unchanged)
  k.forecaster_client_id,
  k.forecaster_client_name,

  -- MediaBox 2.0 identifiers (new; NULL for ambiguous umbrella codes)
  mbk.mb_2_0_client_id,
  mbk.mb_2_0_client_name

FROM `plusco-media-invest-solutions.PCC_Media_Investment.Billing_Summary_2026_NOV` AS b
LEFT JOIN Deduplicated_Client_Key AS k
  ON b.CLIENT_CODE = k.MO_client_id
LEFT JOIN MB_Client_Key AS mbk
  ON b.CLIENT_CODE = mbk.MO_client_id;
