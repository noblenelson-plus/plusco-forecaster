-- Copy of the "Concatenated_finance_table" scheduled query (plusco-media-invest-solutions,
-- northamerica-northeast1, daily 13:00 UTC). The schedule is the source of truth: after
-- editing it in BigQuery, refresh this copy (and vice versa).

-- finance_pipeline_daily_rebuild_v1.sql
-- Scheduled query: daily full rebuild of the finance mapping chain
-- Project: plusco-media-invest-solutions
--
-- Runs as ONE multi-statement script so ordering is guaranteed:
--   1. Finance_mediabox.finance_combined                         (from mediabox_3.finance, fresh daily)
--   2. Finance_mediabox.finance_Mediabox_combined                (from finance_combined + forecast_clients)
--   3. PCC_Media_Investment.finance_master_mapping               (v11 logic)
--   4. PCC_Media_Investment.finance_mapped_client_segmentation
--
-- Scheduled query setup: paste this whole script, leave the destination
-- table BLANK (each statement writes its own destination). Schedule after
-- the mediabox_3.finance morning export completes.
--
-- NOTE: this scheduled script is the source of truth. Editing the
-- individual .sql files does NOT update this schedule - re-paste here.


-- ============================================================
-- STEP 1 of 4: finance_combined (v5, 2026-10-20)
-- plusco-media-invest-solutions.Finance_mediabox.finance_combined
--
-- Sources (MediaBox v1 and v2 now come from two separate tables, the layout
-- Emmanuelle plans to keep from 2027 on):
--   - MediaBox v2: mediabox-1cd44.mediabox_3.finance — one row per tactic x
--     month x value_category (the media budget, or one fee). Pivoted here to one
--     row per tactic x month: monthly_tactic_media_budget = Planned Net, plus
--     commission / taxes / other_fees (labels mapped by
--     Finance_mediabox.fee_label_mapping; unmapped labels = other_fees).
--   - MediaBox v1: canadian-sandbox.mediabox_3.finance WHERE data_source = 'mediabox-v1'.
-- Cleanup kept from v4: "Pursuit (James Copy)" (client id 9ngu7r7t) excluded;
-- v1 tactics that also exist in v2 (campaigns migrated "[MB1] ...") dropped.
-- Client key: the Forecaster app's own MediaBox links (clients.CL_MediaBox_IDs,
-- set in the client drawer; BigQuery mirror pluscoops.forecaster_1.clients),
-- replacing the MO_Client_Key sheet. A finance client_id that is itself a
-- Forecaster client id (e.g. BRP) still matches directly.
-- ============================================================

CREATE OR REPLACE TABLE `plusco-media-invest-solutions.Finance_mediabox.finance_combined` AS

WITH fee_map AS (
  SELECT LOWER(TRIM(value_category)) AS k, cost_bucket
  FROM `plusco-media-invest-solutions.Finance_mediabox.fee_label_mapping`
),

v2_rows AS (
  SELECT f.*, COALESCE(m.cost_bucket, 'Other fees') AS cost_bucket
  FROM `mediabox-1cd44.mediabox_3.finance` AS f
  LEFT JOIN fee_map AS m ON m.k = LOWER(TRIM(IFNULL(f.value_category, '')))
  WHERE IFNULL(f.client, '') NOT LIKE '%(James Copy)%'
    AND IFNULL(f.client_id, '') != '9ngu7r7t'
),

-- One row per tactic x month (tab and version kept in the key: a tab copied
-- with its tactic ids stays two rows, as before).
v2 AS (
  SELECT
    'mediabox-v2'                                   AS data_source,
    tactic_id, client_id,
    ANY_VALUE(campaign_id)                          AS campaign_id,
    version_id, tab_id,
    ANY_VALUE(section_id)                           AS section_id,
    ANY_VALUE(publisher_id)                         AS publisher_id,
    ANY_VALUE(path_params)                          AS path_params,
    ANY_VALUE(agency)                               AS agency,
    ANY_VALUE(office)                               AS office,
    ANY_VALUE(client)                               AS client,
    ANY_VALUE(campaign)                             AS campaign,
    ANY_VALUE(lob)                                  AS lob,
    ANY_VALUE(cmp_po)                               AS cmp_po,
    ANY_VALUE(tac_po)                               AS tac_po,
    ANY_VALUE(key_po)                               AS key_po,
    ANY_VALUE(cmp_billing_id)                       AS cmp_billing_id,
    ANY_VALUE(tac_billing_id)                       AS tac_billing_id,
    ANY_VALUE(key_billing_id)                       AS key_billing_id,
    ANY_VALUE(fee_billing_id)                       AS fee_billing_id,
    ANY_VALUE(client_external_id)                   AS client_external_id,
    ANY_VALUE(cmp_start_date)                       AS cmp_start_date,
    ANY_VALUE(cmp_end_date)                         AS cmp_end_date,
    ANY_VALUE(cmp_status)                           AS cmp_status,
    CAST(NULL AS STRING)                            AS media_plan_status,
    ANY_VALUE(tac_label)                            AS tactic_label,
    ANY_VALUE(media_type)                           AS media_type,
    CAST(NULL AS STRING)                            AS buying_method,
    ANY_VALUE(publisher)                            AS publisher,
    ANY_VALUE(inventory)                            AS inventory,
    ANY_VALUE(programmatic_buying_method)           AS programmatic_buying_method,
    CAST(NULL AS STRING)                            AS channel,
    CAST(NULL AS STRING)                            AS placement_location,
    ANY_VALUE(market)                               AS market,
    ANY_VALUE(publisher_features)                   AS publisher_features,
    CAST(NULL AS STRING)                            AS language,
    CAST(NULL AS STRING)                            AS format,
    ANY_VALUE(tac_start_date)                       AS tactic_start_date,
    ANY_VALUE(tac_end_date)                         AS tactic_end_date,
    CAST(NULL AS INT64)                             AS total_tactic_days,
    month,
    CAST(NULL AS INT64)                             AS tactic_days_in_month,
    ANY_VALUE(cmp_ref_currency)                     AS ref_currency,
    MAX(IF(cost_bucket = 'Planned Net', total_value_ref_currency, NULL)) AS total_tactic_media_budget_ref_currency,
    SUM(IF(cost_bucket = 'Planned Net', monthly_value_ref_currency, 0)) AS monthly_tactic_media_budget,
    SUM(IF(cost_bucket = 'Commission',  monthly_value_ref_currency, 0)) AS commission,
    SUM(IF(cost_bucket = 'Taxes',       monthly_value_ref_currency, 0)) AS taxes,
    SUM(IF(cost_bucket = 'Other fees',  monthly_value_ref_currency, 0)) AS other_fees,
    STRING_AGG(DISTINCT IF(cost_bucket = 'Commission', value_category, NULL), ' | ') AS commission_labels,
    STRING_AGG(DISTINCT IF(cost_bucket = 'Taxes',      value_category, NULL), ' | ') AS tax_labels,
    STRING_AGG(DISTINCT IF(cost_bucket = 'Other fees', COALESCE(NULLIF(value_category, ''), '(blank)'), NULL), ' | ') AS other_fee_labels
  FROM v2_rows
  GROUP BY tactic_id, client_id, version_id, tab_id, month
),

v2_tactics AS (
  SELECT DISTINCT tactic_id FROM v2 WHERE tactic_id IS NOT NULL   -- a NULL here would make NOT IN drop every v1 row
),

v1 AS (
  SELECT
    f.*,
    CAST(NULL AS FLOAT64) AS commission,
    CAST(NULL AS FLOAT64) AS taxes,
    CAST(NULL AS FLOAT64) AS other_fees,
    CAST(NULL AS STRING)  AS commission_labels,
    CAST(NULL AS STRING)  AS tax_labels,
    CAST(NULL AS STRING)  AS other_fee_labels
  FROM `canadian-sandbox.mediabox_3.finance` AS f
  WHERE f.data_source = 'mediabox-v1'
    AND IFNULL(f.client, '') NOT LIKE '%(James Copy)%'
    AND f.tactic_id NOT IN (SELECT tactic_id FROM v2_tactics)
),

finance_source AS (
  SELECT * FROM v2
  UNION ALL
  SELECT * FROM v1
),

-- MediaBox client id -> Forecaster client (the app's CL_MediaBox_IDs).
mb_key AS (
  SELECT TRIM(mediabox_client_id) AS mb_client_id, client_id AS forecaster_client_id, client AS forecaster_client_name
  FROM `pluscoops.forecaster_1.clients`
  WHERE TRIM(IFNULL(mediabox_client_id, '')) NOT IN ('', '-')
    AND client_id NOT LIKE 'CL_1_TEST%'   -- the app's test client (MediaBox "Le Bistro" specs campaigns)
  QUALIFY ROW_NUMBER() OVER (PARTITION BY TRIM(mediabox_client_id) ORDER BY client_id) = 1
),

-- Fallback: the finance client_id is already a Forecaster client id.
fc_key AS (
  SELECT DISTINCT client_id AS forecaster_client_id, client AS forecaster_client_name
  FROM `pluscoops.forecaster_1.clients`
  WHERE client_id NOT LIKE 'CL_1_TEST%'
),

finance_mapped AS (
  SELECT
    f.*,
    COALESCE(mb.forecaster_client_id,   fc.forecaster_client_id)   AS forecaster_client_id,
    COALESCE(mb.forecaster_client_name, fc.forecaster_client_name) AS forecaster_client_name
  FROM finance_source AS f
  LEFT JOIN mb_key AS mb ON TRIM(f.client_id) = mb.mb_client_id
  LEFT JOIN fc_key AS fc ON mb.mb_client_id IS NULL AND TRIM(f.client_id) = fc.forecaster_client_id
),

-- Same channel_type / publisher_key derivation as v3/v4.
with_channel AS (
  SELECT
    fm.*,
    CASE
      WHEN TRIM(IFNULL(media_type, '')) = '' THEN NULL
      WHEN LOWER(TRIM(media_type)) = 'ooh'   THEN 'OOH'
      WHEN LOWER(TRIM(media_type)) = 'radio' THEN 'Radio'
      WHEN LOWER(TRIM(media_type)) = 'tv'    THEN 'TV'
      WHEN LOWER(TRIM(media_type)) = 'print' THEN 'Print'
      WHEN LOWER(TRIM(media_type)) = 'other' THEN 'other'
      ELSE 'Digital'
    END AS channel_type
  FROM finance_mapped AS fm
)

SELECT
  wc.* EXCEPT (commission, taxes, other_fees, commission_labels, tax_labels, other_fee_labels),
  CASE
    WHEN publisher IS NOT NULL AND channel_type IS NOT NULL THEN CONCAT(publisher, '_', channel_type)
    WHEN publisher IS NOT NULL AND channel_type IS NULL     THEN publisher
    WHEN publisher IS NULL     AND channel_type IS NOT NULL THEN channel_type
    ELSE NULL
  END AS publisher_key,
  wc.commission, wc.taxes, wc.other_fees,
  wc.commission_labels, wc.tax_labels, wc.other_fee_labels
FROM with_channel AS wc;


-- ============================================================
-- STEP 2 of 4: finance_Mediabox_combined (v5)
-- plusco-media-invest-solutions.Finance_mediabox.finance_Mediabox_combined
-- Client attributes from the live Forecaster app (forecaster_flat.clients_flat,
-- refreshed daily from Firestore), replacing the Forecaster 1.0
-- plus-collect.mediabox.forecast_clients sheet. Same output columns.
-- ============================================================

CREATE OR REPLACE TABLE `plusco-media-invest-solutions.Finance_mediabox.finance_Mediabox_combined` AS
SELECT
  f.* EXCEPT (commission, taxes, other_fees, commission_labels, tax_labels, other_fee_labels),
  c.CL_ID,
  c.CL_Name,
  c.CL_Agency,
  c.CL_Business_Unit_Region,
  c.CL_Office,
  c.CL_Business_Lead,
  c.CL_Digital_Lead,
  c.GM_Pod,
  c.CL_Currency,
  c.CL_GAIA_Number,
  c.Client_Status_2026,
  f.commission, f.taxes, f.other_fees,
  f.commission_labels, f.tax_labels, f.other_fee_labels
FROM `plusco-media-invest-solutions.Finance_mediabox.finance_combined` AS f
LEFT JOIN (
  SELECT
    COALESCE(NULLIF(TRIM(CL_ID), ''), document_id) AS CL_ID,   -- Manulife's record has no CL_ID field
    CL_Name, CL_Agency, CL_Business_Unit_Region, CL_Office, CL_Business_Lead,
    CL_Digital_Lead, GM_Pod, CL_Currency,
    ARRAY_TO_STRING(CL_GAIA_Number, ', ') AS CL_GAIA_Number,
    Client_Status_2026,
    document_id
  FROM `pluscoops.forecaster_flat.clients_flat`
) AS c
  ON c.document_id = f.forecaster_client_id
-- 2027 included (v5): MediaBox already holds next-year plans; step 3 keeps 2025-2027.
WHERE EXTRACT(YEAR FROM f.month) IN (2025, 2026, 2027);


-- ============================================================
-- STEP 3 of 4: finance_master_mapping (v11)
-- plusco-media-invest-solutions.PCC_Media_Investment.finance_master_mapping
--
-- v11 vs v10: two additions to resolve_channel():
--   1. MIQ + media_type Social  -> PLUSCO_MEDIA_CHANNEL = 'Social' (hard override, wins first)
--   2. media_type Digital       -> 'Digital Direct' in the media_type fallback ladder
-- resolve_channel() now takes resolved_partner as a 4th arg. Everything else identical to v10.
-- ============================================================

CREATE TEMP FUNCTION norm_key(x STRING) AS (
  LOWER(REGEXP_REPLACE(NORMALIZE(IFNULL(x, ''), NFD), r'\p{Mn}', ''))
);

CREATE TEMP FUNCTION norm_partner(x STRING) AS (
  UPPER(TRIM(REGEXP_REPLACE(NORMALIZE(IFNULL(x, ''), NFD), r'\p{Mn}', '')))
);

CREATE TEMP FUNCTION strip_last_word(x STRING) AS (
  TRIM(REGEXP_REPLACE(TRIM(x), r'\s+\S+$', ''))
);

-- Shared channel resolution so the SELECT and the vendor joins agree.
CREATE TEMP FUNCTION resolve_channel(
  publisher STRING, mapped_channel STRING, media_type STRING, resolved_partner STRING
) AS (
  CASE
    -- 1. MIQ + Social hard override (wins first)
    WHEN UPPER(TRIM(resolved_partner)) = 'MIQ'
         AND UPPER(TRIM(media_type)) = 'SOCIAL'
      THEN 'Social'
    -- 2. mapped channel wins when publisher is real
    WHEN TRIM(LOWER(IFNULL(publisher, ''))) NOT IN ('', '-', 'null')
         AND TRIM(IFNULL(mapped_channel, '')) NOT IN ('', '#N/A')
      THEN mapped_channel
    -- 3. media_type fallback with renames
    WHEN UPPER(TRIM(media_type)) = 'PAID SEARCH' THEN 'SEM'
    WHEN UPPER(TRIM(media_type)) = 'OTHER'        THEN 'N/A'
    WHEN UPPER(TRIM(media_type)) = 'DIGITAL'      THEN 'Digital Direct'
    ELSE media_type
  END
);

CREATE OR REPLACE TABLE `plusco-media-invest-solutions.PCC_Media_Investment.finance_master_mapping` AS

WITH map_norm AS (
  SELECT
    norm_key(publisher_key) AS norm_key,
    Publisher_List,
    shortcode_id,
    PLUSCO_MEDIA_PARTNER,
    PLUSCO_MEDIA_CHANNEL,
    PLUSCO_2026_DEALS,
    PLUSCO_DEALS_Type,
    PLUSCO_LOCAL_MEDIA
  FROM `plusco-media-invest-solutions.Finance_mediabox.master_mapping_partners`
  WHERE publisher_key IS NOT NULL
),

mapping_dedup AS (
  SELECT
    norm_key,
    PLUSCO_MEDIA_PARTNER,
    PLUSCO_MEDIA_CHANNEL,
    PLUSCO_2026_DEALS,
    PLUSCO_DEALS_Type,
    PLUSCO_LOCAL_MEDIA
  FROM map_norm
  QUALIFY ROW_NUMBER() OVER (
    PARTITION BY norm_key
    ORDER BY
      UPPER(TRIM(IFNULL(PLUSCO_MEDIA_PARTNER, ''))) IN ('', '#N/A'),
      CASE
        WHEN UPPER(TRIM(Publisher_List)) = 'MB 2.0 LIST' THEN 0
        WHEN UPPER(TRIM(Publisher_List)) = 'MB 1.0 LIST' THEN 1
        ELSE 2
      END,
      shortcode_id,
      TO_JSON_STRING(STRUCT(
        PLUSCO_MEDIA_CHANNEL, PLUSCO_2026_DEALS, PLUSCO_DEALS_Type, PLUSCO_LOCAL_MEDIA
      ))
  ) = 1
),

vendor_dedup_composite AS (
  SELECT
    norm_partner(PLUSCO_MEDIA_PARTNER) AS v_partner_norm,
    UPPER(TRIM(PLUSCO_MEDIA_CHANNEL))  AS v_channel,
    PLUSCO_DEALS_2026,
    PLUSCO_DEALS_Type,
    PLUSCO_LOCAL_MEDIA
  FROM `plusco-media-invest-solutions.Finance_mediabox.MIR_VENDOR_DATABASE`
  WHERE TRIM(IFNULL(PLUSCO_MEDIA_PARTNER, '')) NOT IN ('', '#N/A')
  QUALIFY ROW_NUMBER() OVER (
    PARTITION BY
      norm_partner(PLUSCO_MEDIA_PARTNER),
      UPPER(TRIM(PLUSCO_MEDIA_CHANNEL))
    ORDER BY
      CASE UPPER(TRIM(PLUSCO_DEALS_2026))
        WHEN 'PARTNER DEAL'                THEN 0
        WHEN 'TRADITIONAL & MULTIPLATFORM' THEN 1
        ELSE 2
      END,
      CASE UPPER(TRIM(PLUSCO_LOCAL_MEDIA))
        WHEN 'HYBRID'  THEN 0
        WHEN 'LOCAL'   THEN 1
        WHEN 'FOREIGN' THEN 2
        ELSE 3
      END
  ) = 1
),

vendor_dedup_partner AS (
  SELECT
    norm_partner(PLUSCO_MEDIA_PARTNER) AS v_partner_norm,
    PLUSCO_DEALS_2026,
    PLUSCO_DEALS_Type,
    PLUSCO_LOCAL_MEDIA
  FROM `plusco-media-invest-solutions.Finance_mediabox.MIR_VENDOR_DATABASE`
  WHERE TRIM(IFNULL(PLUSCO_MEDIA_PARTNER, '')) NOT IN ('', '#N/A')
  QUALIFY ROW_NUMBER() OVER (
    PARTITION BY norm_partner(PLUSCO_MEDIA_PARTNER)
    ORDER BY
      CASE UPPER(TRIM(PLUSCO_DEALS_2026))
        WHEN 'PARTNER DEAL'                THEN 0
        WHEN 'TRADITIONAL & MULTIPLATFORM' THEN 1
        ELSE 2
      END,
      CASE UPPER(TRIM(PLUSCO_LOCAL_MEDIA))
        WHEN 'HYBRID'  THEN 0
        WHEN 'LOCAL'   THEN 1
        WHEN 'FOREIGN' THEN 2
        ELSE 3
      END
  ) = 1
),

base AS (
  SELECT
    f.*,
    m.PLUSCO_MEDIA_CHANNEL                        AS mapped_channel,
    m.PLUSCO_2026_DEALS                           AS mapped_deals,
    m.PLUSCO_DEALS_Type                           AS mapped_deals_type,
    m.PLUSCO_LOCAL_MEDIA                          AS mapped_local,
    COALESCE(m.PLUSCO_MEDIA_PARTNER, f.publisher) AS resolved_partner
  FROM `plusco-media-invest-solutions.Finance_mediabox.finance_Mediabox_combined` AS f
  LEFT JOIN mapping_dedup AS m
    ON norm_key(f.publisher_key) = m.norm_key
  WHERE EXTRACT(YEAR FROM f.month) IN (2025, 2026, 2027)
),

base_with_channel AS (
  SELECT
    b.*,
    UPPER(TRIM(resolve_channel(b.publisher, b.mapped_channel, b.media_type, b.resolved_partner))) AS resolved_channel_upper
  FROM base AS b
)

SELECT
  b.data_source,
  b.client_id,
  b.campaign_id,
  b.version_id,
  b.tab_id,
  b.section_id,
  b.publisher_id,
  b.path_params,
  b.tactic_id,
  b.tactic_label,
  b.agency,
  b.office,
  b.client,
  b.campaign,
  b.lob,
  b.cmp_po,
  b.tac_po,
  b.key_po,
  b.cmp_billing_id,
  b.tac_billing_id,
  b.key_billing_id,
  b.fee_billing_id,
  b.client_external_id,
  b.cmp_start_date,
  b.cmp_end_date,
  b.cmp_status,
  b.media_type,
  b.publisher_key,
  b.channel_type,
  b.media_plan_status,
  b.buying_method,
  b.publisher,
  b.inventory,
  b.programmatic_buying_method,
  b.channel,
  b.placement_location,
  b.market,
  b.publisher_features,
  b.language,
  b.format,
  b.tactic_start_date,
  b.tactic_end_date,
  b.total_tactic_days,
  FORMAT_DATE('%Y-%m', b.month) AS month,
  EXTRACT(YEAR FROM b.month)    AS year,
  b.tactic_days_in_month,
  b.ref_currency,
  b.total_tactic_media_budget_ref_currency,
  b.monthly_tactic_media_budget,
  b.forecaster_client_name,
  b.forecaster_client_id,
  b.CL_ID,
  b.CL_Name,
  b.CL_Agency,
  b.CL_Business_Unit_Region,
  b.CL_Office,
  b.CL_Business_Lead,
  b.CL_Digital_Lead,
  b.GM_Pod,
  b.CL_Currency,
  b.CL_GAIA_Number,
  b.Client_Status_2026,
  b.resolved_partner AS PLUSCO_MEDIA_PARTNER,
  CASE
    WHEN UPPER(TRIM(b.resolved_partner)) = 'BILLUPS'
         AND UPPER(TRIM(b.mapped_channel)) IN ('OOH', 'DIGITAL DIRECT')
      THEN 'Billups-OOH'
    WHEN UPPER(TRIM(b.resolved_partner)) = 'BILLUPS'
         AND UPPER(TRIM(b.mapped_channel)) = 'PRINT'
      THEN 'Billups-Print'
    WHEN UPPER(TRIM(b.resolved_partner)) = 'MIQ'
         AND UPPER(TRIM(b.inventory)) IN ('META', 'PINTEREST', 'LINKEDIN', 'REDDIT', 'SNAPCHAT', 'TIKTOK')
      THEN 'MIQ-Social'
    WHEN UPPER(TRIM(b.resolved_partner)) = 'MIQ'
      THEN 'MIQ-Prog'
    ELSE b.resolved_partner
  END AS Plusco_media_partner_split,
  -- v11 channel logic (MIQ+Social override, mapped-if-real, media_type fallback w/ renames)
  resolve_channel(b.publisher, b.mapped_channel, b.media_type, b.resolved_partner) AS PLUSCO_MEDIA_CHANNEL,
  COALESCE(
    NULLIF(TRIM(IFNULL(b.mapped_deals, '')), ''),
    NULLIF(TRIM(IFNULL(v1.PLUSCO_DEALS_2026, '')), ''),
    NULLIF(TRIM(IFNULL(v2.PLUSCO_DEALS_2026, '')), ''),
    NULLIF(TRIM(IFNULL(v3.PLUSCO_DEALS_2026, '')), '')
  ) AS PLUSCO_2026_DEALS,
  COALESCE(
    NULLIF(TRIM(IFNULL(b.mapped_deals_type, '')), ''),
    NULLIF(TRIM(IFNULL(v1.PLUSCO_DEALS_Type, '')), ''),
    NULLIF(TRIM(IFNULL(v2.PLUSCO_DEALS_Type, '')), ''),
    NULLIF(TRIM(IFNULL(v3.PLUSCO_DEALS_Type, '')), '')
  ) AS PLUSCO_DEALS_Type,
  CASE
    WHEN STRPOS(UPPER(IFNULL(b.publisher_features, '')), 'LMI_HYBRID')    > 0 THEN 'HYBRID'
    WHEN STRPOS(UPPER(IFNULL(b.publisher_features, '')), 'LMI_FOREIGN')   > 0 THEN 'FOREIGN'
    WHEN STRPOS(UPPER(IFNULL(b.publisher_features, '')), 'LMI_LOCAL')     > 0 THEN 'LOCAL'
    WHEN STRPOS(UPPER(IFNULL(b.publisher_features, '')), 'ONTARIO_LOCAL') > 0 THEN 'LOCAL'
    WHEN TRIM(IFNULL(b.mapped_local, '')) NOT IN ('', '#N/A')
      THEN b.mapped_local
    WHEN TRIM(IFNULL(v1.PLUSCO_LOCAL_MEDIA, '')) NOT IN ('', '#N/A', 'N/A')
      THEN v1.PLUSCO_LOCAL_MEDIA
    WHEN TRIM(IFNULL(v2.PLUSCO_LOCAL_MEDIA, '')) NOT IN ('', '#N/A', 'N/A')
      THEN v2.PLUSCO_LOCAL_MEDIA
    WHEN TRIM(IFNULL(v3.PLUSCO_LOCAL_MEDIA, '')) NOT IN ('', '#N/A', 'N/A')
      THEN v3.PLUSCO_LOCAL_MEDIA
    ELSE NULL
  END AS PLUSCO_LOCAL_MEDIA,
  -- MediaBox v2 fees (v5; NULL for MediaBox v1)
  b.commission,
  b.taxes,
  b.other_fees,
  b.commission_labels,
  b.tax_labels,
  b.other_fee_labels
FROM base_with_channel AS b
LEFT JOIN vendor_dedup_composite AS v1
  ON  norm_partner(b.resolved_partner) = v1.v_partner_norm
  AND b.resolved_channel_upper          = v1.v_channel
LEFT JOIN vendor_dedup_composite AS v2
  ON  v1.v_partner_norm IS NULL
  AND norm_partner(strip_last_word(b.resolved_partner)) = v2.v_partner_norm
  AND b.resolved_channel_upper = v2.v_channel
LEFT JOIN vendor_dedup_partner AS v3
  ON  b.resolved_channel_upper IS NULL
  AND v1.v_partner_norm IS NULL
  AND norm_partner(b.resolved_partner) = v3.v_partner_norm;


-- ============================================================
-- STEP 4 of 4: finance_mapped_client_segmentation
-- plusco-media-invest-solutions.PCC_Media_Investment.finance_mapped_client_segmentation
-- ============================================================

CREATE OR REPLACE TABLE `plusco-media-invest-solutions.PCC_Media_Investment.finance_mapped_client_segmentation` AS
SELECT
  f.data_source,
  f.client_id,
  f.campaign_id,
  f.version_id,
  f.tab_id,
  f.section_id,
  f.publisher_id,
  f.path_params,
  f.tactic_id,
  f.tactic_label,
  f.agency,
  f.office,
  f.client,
  f.campaign,
  f.lob,
  f.cmp_po,
  f.tac_po,
  f.key_po,
  f.cmp_billing_id,
  f.tac_billing_id,
  f.key_billing_id,
  f.fee_billing_id,
  f.client_external_id,
  f.cmp_start_date,
  f.cmp_end_date,
  f.cmp_status,
  f.media_type,
  f.media_plan_status,
  f.buying_method,
  f.publisher,
  f.inventory,
  f.programmatic_buying_method,
  f.channel,
  f.placement_location,
  f.market,
  f.publisher_features,
  f.language,
  f.format,
  f.tactic_start_date,
  f.tactic_end_date,
  f.total_tactic_days,
  f.month,
  CAST(LEFT(f.month, 4) AS INT64) AS year,
  f.tactic_days_in_month,
  f.ref_currency,
  f.total_tactic_media_budget_ref_currency,
  f.monthly_tactic_media_budget,
  f.forecaster_client_name,
  f.forecaster_client_id,
  f.CL_ID,
  f.CL_Name,
  f.CL_Agency,
  f.CL_Business_Unit_Region,
  f.CL_Office,
  f.CL_Business_Lead,
  f.CL_Digital_Lead,
  f.GM_Pod,
  f.CL_Currency,
  f.CL_GAIA_Number,
  f.Client_Status_2026,
  f.PLUSCO_MEDIA_PARTNER,
  f.Plusco_media_partner_split,
  f.PLUSCO_MEDIA_CHANNEL,
  f.PLUSCO_2026_DEALS,
  f.PLUSCO_DEALS_Type,
  f.PLUSCO_LOCAL_MEDIA,
  s.Scenario,
  f.commission,
  f.taxes,
  f.other_fees,
  f.commission_labels,
  f.tax_labels,
  f.other_fee_labels,
FROM `plusco-media-invest-solutions.PCC_Media_Investment.finance_master_mapping` AS f
LEFT JOIN (
  SELECT Client, Scenario
  FROM `plusco-media-invest-solutions.PCC_Media_Investment.Client_Segmentation_META_Mapping`
  WHERE Client IS NOT NULL
  QUALIFY ROW_NUMBER() OVER(PARTITION BY Client ORDER BY Scenario DESC) = 1
) AS s
ON LOWER(f.client) = LOWER(s.Client);