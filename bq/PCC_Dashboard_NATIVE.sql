-- filepath: bq/PCC_Dashboard_NATIVE.sql
-- Main MIR fact table, from PCC_Dashboard_RAW_COMBINED + Finance_mediabox.MO_Client_Key. Rebuild first after loading a new month.
-- Versioned 2026-11-26 from the SQL BigQuery last ran (job history), as run for the Nov 2026 MIR.
-- Change (v3): Added mb_2_0_client_id and mb_2_0_client_name from
--              `plusco-media-invest-solutions.Finance_mediabox.MO_Client_Key`,
--              joined NATIVE.PLUSCO_CLIENT_ID = MO_Client_Key.forecaster_client_id.
-- Safety:      Lookup is pre-aggregated to ONE row per forecaster_client_id via a
--              GROUP BY + ANY_VALUE, so the LEFT JOIN cannot fan out NATIVE rows
--              even if MO_Client_Key later gains duplicate rows. Junk keys
--              ('', '-', '#N/A') are excluded so they never attach a wrong client.
--              All v2 logic, columns, and values are unchanged. The 2 new columns
--              are appended at the very end of the SELECT.
-- Verify:      Confirm the live schema spells the columns mb_2_0_client_id and
--              mb_2_0_client_name (CSV export shows dotted mb_2.0_..., but BigQuery
--              stores underscores).

CREATE OR REPLACE TABLE `plusco-media-invest-solutions.PCC_Media_Investment.PCC_Dashboard_NATIVE` AS

WITH base AS (
  SELECT
    SOURCE,
    MEDIA_CODE,
    MEDIA,
    CLIENT_CODE,
    CLIENT,
    PRODUCT_CODE,
    PRODUCT,
    ESTIMATE_CODE,
    ESTIMATE,
    VENDOR_CODE,
    VENDOR,
    COALESCE(
      SAFE.FORMAT_DATE('%Y-%m', SAFE.PARSE_DATE('%b %Y', MONTH)),
      SAFE.FORMAT_DATE('%Y-%m', SAFE.PARSE_DATE('%m/%d/%Y', MONTH)),
      SAFE.FORMAT_DATE('%Y-%m', SAFE.PARSE_DATE('%Y-%m-%d', MONTH)),
      SAFE.FORMAT_DATE('%Y-%m', SAFE.PARSE_DATE('%b/%Y', MONTH)),
      SAFE.FORMAT_DATE('%Y-%m', SAFE.PARSE_DATE('%b/ %Y', MONTH)),
      MONTH
    ) AS MONTH,
    PO,
    PAYREP_CODE,
    PAYREP,
    OFFICE_CODE,
    OFFICE,
    BUYTYPE,
    SREP,
    PBB,
    PLUSCO_QUARTER,
    PLUSCO_YEAR,
    MCPE,
    PCT_BILLED,
    PCT_PAID,
    BILLING_FORMULA,
    CLIENT_INTERCO,
    PLUSCO_CLIENT_NAME,
    PLUSCO_CLIENT_ID,
    CLIENT_CURRENCY_MO,
    CLIENT_STATUS_IN_2026,
    MEDIABOX_FO_CURRENCY,
    AGENCY,
    BUSINESS_LEAD,
    BU_REGION,
    GM_POD,
    PLUSCO_MEDIA_CHANNEL,
    PLUSCO_PROGRAMMATIC,
    PLUSCO_PAY_REP,
    PLUSCO_DEALS_Category,
    PLUSCO_DEALS_Channel,
    PLUSCO_DEALS_Type,
    PLUSCO_MEDIA_PARTNER,
    PLUSCO_PARTNER_RepHouseTag,
    PLUSCO_MEDIA_OWNER,
    PLUSCO_LOCAL_MEDIA,
    PLUSCO_VENDOR_COUNTRY,
    PLUSCO_VENDOR_PROVINCE,
    PLUSCO_VENDOR_MARKET,
    PLUSCO_VENDOR_LANGUAGE,
    PLUSCO_VENDOR_LANGUAGE_Detail,
    PLUSCO_VENDOR_AUDIENCE,
    PLUSCO_CONVENTIONAL_SPECIALTY,
    SPOT_Type,
    SPOT_MARKET_CODE,
    SPOT_MARKET_NAME,
    present_in_Database_2_0,
    Prog_and_SEM,
    PLUSCO_2026_DEALS,
    Mediabox_2_0_MCPE,
    Mediabox_2_0_Campaign_Name,
    Labs_Partners,
    SAFE_CAST(REPLACE(REPLACE(CAST(NET_ORDERED AS STRING), '$', ''), ',', '') AS FLOAT64) AS NET_ORDERED,
    SAFE_CAST(REPLACE(REPLACE(CAST(NET_ORDERED_CAD AS STRING), '$', ''), ',', '') AS FLOAT64) AS NET_ORDERED_CAD,
    SAFE_CAST(REPLACE(REPLACE(CAST(BILLABLE_NET AS STRING), '$', ''), ',', '') AS FLOAT64) AS BILLABLE_NET,
    SAFE_CAST(REPLACE(REPLACE(CAST(BILLED_NET AS STRING), '$', ''), ',', '') AS FLOAT64) AS BILLED_NET,
    SAFE_CAST(REPLACE(REPLACE(CAST(PAYABLE_NET AS STRING), '$', ''), ',', '') AS FLOAT64) AS PAYABLE_NET,
    SAFE_CAST(REPLACE(REPLACE(CAST(PAID_NET AS STRING), '$', ''), ',', '') AS FLOAT64) AS PAID_NET
  FROM `plusco-media-invest-solutions.PCC_Media_Investment.PCC_Dashboard_RAW_COMBINED`
  WHERE SOURCE IS NOT NULL AND SOURCE != 'SOURCE'
),

-- One row per forecaster_client_id. ANY_VALUE is safe because the two target
-- columns are 1:1 with forecaster_client_id for every real key. Junk keys are
-- filtered out so they cannot attach a wrong client or fan out rows.
mo_client_lookup AS (
  SELECT
    LOWER(TRIM(forecaster_client_id))   AS forecaster_client_id_key,
    ANY_VALUE(mb_2_0_client_id)         AS mb_2_0_client_id,
    ANY_VALUE(mb_2_0_client_name)       AS mb_2_0_client_name
  FROM `plusco-media-invest-solutions.Finance_mediabox.MO_Client_Key`
  WHERE forecaster_client_id IS NOT NULL
    AND TRIM(forecaster_client_id) NOT IN ('', '-', '#N/A')
  GROUP BY forecaster_client_id_key
)

SELECT
  base.*,
  CASE
    -- Plain Labs partners
    WHEN UPPER(base.PLUSCO_MEDIA_PARTNER) = 'YAHOO'             AND UPPER(base.PLUSCO_DEALS_Type) IN ('LABS', 'LABS - BRP') THEN  7500000.0 / COUNT(*) OVER (PARTITION BY UPPER(base.PLUSCO_MEDIA_PARTNER), base.PLUSCO_YEAR)
    WHEN UPPER(base.PLUSCO_MEDIA_PARTNER) = 'MIQ'               AND UPPER(base.PLUSCO_DEALS_Type) IN ('LABS', 'LABS - BRP') THEN 24000000.0 / COUNT(*) OVER (PARTITION BY UPPER(base.PLUSCO_MEDIA_PARTNER), base.PLUSCO_YEAR)
    WHEN UPPER(base.PLUSCO_MEDIA_PARTNER) = 'QUANTCAST'         AND UPPER(base.PLUSCO_DEALS_Type) IN ('LABS', 'LABS - BRP') THEN  8000000.0 / COUNT(*) OVER (PARTITION BY UPPER(base.PLUSCO_MEDIA_PARTNER), base.PLUSCO_YEAR)
    WHEN UPPER(base.PLUSCO_MEDIA_PARTNER) = 'REDDIT'            AND UPPER(base.PLUSCO_DEALS_Type) IN ('LABS', 'LABS - BRP') THEN 15340000.0 / COUNT(*) OVER (PARTITION BY UPPER(base.PLUSCO_MEDIA_PARTNER), base.PLUSCO_YEAR)
    WHEN UPPER(base.PLUSCO_MEDIA_PARTNER) = 'AMAZON'            AND UPPER(base.PLUSCO_DEALS_Type) IN ('LABS', 'LABS - BRP') THEN  9000000.0 / COUNT(*) OVER (PARTITION BY UPPER(base.PLUSCO_MEDIA_PARTNER), base.PLUSCO_YEAR)
    WHEN UPPER(base.PLUSCO_MEDIA_PARTNER) = 'BILLUPS'           AND UPPER(base.PLUSCO_DEALS_Type) IN ('LABS', 'LABS - BRP') THEN 38500000.0 / COUNT(*) OVER (PARTITION BY UPPER(base.PLUSCO_MEDIA_PARTNER), base.PLUSCO_YEAR)
    WHEN UPPER(base.PLUSCO_MEDIA_PARTNER) = 'SIRIUS XM'         AND UPPER(base.PLUSCO_DEALS_Type) IN ('LABS', 'LABS - BRP') THEN  1200000.0 / COUNT(*) OVER (PARTITION BY UPPER(base.PLUSCO_MEDIA_PARTNER), base.PLUSCO_YEAR)
    WHEN UPPER(base.PLUSCO_MEDIA_PARTNER) = 'MEDIA PULSE'       AND UPPER(base.PLUSCO_DEALS_Type) IN ('LABS', 'LABS - BRP') THEN  2000000.0 / COUNT(*) OVER (PARTITION BY UPPER(base.PLUSCO_MEDIA_PARTNER), base.PLUSCO_YEAR)
    WHEN UPPER(base.PLUSCO_MEDIA_PARTNER) = 'STACKADAPT'        AND UPPER(base.PLUSCO_DEALS_Type) IN ('LABS', 'LABS - BRP') THEN  4000000.0 / COUNT(*) OVER (PARTITION BY UPPER(base.PLUSCO_MEDIA_PARTNER), base.PLUSCO_YEAR)
    -- Labs - BRP partners
    WHEN UPPER(base.PLUSCO_MEDIA_PARTNER) = 'I HEART MEDIA'     AND UPPER(base.PLUSCO_DEALS_Type) IN ('LABS', 'LABS - BRP') THEN  4193400.0 / COUNT(*) OVER (PARTITION BY UPPER(base.PLUSCO_MEDIA_PARTNER), base.PLUSCO_YEAR)
    WHEN UPPER(base.PLUSCO_MEDIA_PARTNER) = 'TRADER INTERACTIVE' AND UPPER(base.PLUSCO_DEALS_Type) IN ('LABS', 'LABS - BRP') THEN  2795600.0 / COUNT(*) OVER (PARTITION BY UPPER(base.PLUSCO_MEDIA_PARTNER), base.PLUSCO_YEAR)
    ELSE NULL
  END AS media_spend_target_distributed,
  -- Year-aware Labs partner flag (driven by labs_partners_by_year view; now includes LABS + LABS - BRP)
  CASE WHEN lp.PLUSCO_MEDIA_PARTNER IS NOT NULL THEN TRUE ELSE FALSE END AS IS_LABS_PARTNER,
  -- NEW: client keys from MO_Client_Key lookup (appended last, additive)
  mo.mb_2_0_client_id   AS mb_2_0_client_id,
  mo.mb_2_0_client_name AS mb_2_0_client_name
FROM base
LEFT JOIN `plusco-media-invest-solutions.PCC_Media_Investment.labs_partners_by_year` lp
  ON CAST(base.PLUSCO_YEAR AS STRING) = lp.PLUSCO_YEAR
  AND UPPER(TRIM(base.PLUSCO_MEDIA_PARTNER)) = lp.PLUSCO_MEDIA_PARTNER
LEFT JOIN mo_client_lookup mo
  ON LOWER(TRIM(base.PLUSCO_CLIENT_ID)) = mo.forecaster_client_id_key
