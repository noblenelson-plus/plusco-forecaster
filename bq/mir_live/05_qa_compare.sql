-- MIR_Live.qa_compare — reconciles a manual MIR against an automated MIR and writes five tables:
--   MIR_Live.qa_summary     year × media totals, % of $ on lines within 1 %, PASS/CHECK
--   MIR_Live.qa_monthly     month × media totals, PASS when within 0.5 %
--   MIR_Live.qa_lines       every MCPE × month off by ≥ $1,000 and ≥ 1 % (or only on one side)
--   MIR_Live.qa_dimensions  % of $ where agency / client / BL / GM pod / channel / partner / deal agree
--   MIR_Live.qa_coverage    per MIR and system: $ with no channel (unmatched vendor) or no PlusCo client id
--
-- Args: manual_table — the manual MIR with the sheet's column names, e.g.
--         'plusco-media-invest-solutions.PCC_Media_Investment.PCC_Dashboard_NATIVE'
--         or a monthly sheet table ('...PCC_Dashboard_RAW_2026_SEP'; money stored as "$1,234" text is fine)
--       auto_table   — the automated MIR of the SAME day as the manual pull, e.g.
--         'plusco-media-invest-solutions.MIR_Live_snapshots.MIR_20261103'
--
-- Keys are normalized on both sides: Network MCPEs ('T-' in the sheet, 'N-' in MediaOcean),
-- vendor codes without leading zeros, Spot vendors by VENDOR_CODE_MIR, and 'no match' / '#N/A' = blank.
--
-- Example:
--   CALL `plusco-media-invest-solutions.MIR_Live.qa_compare`(
--     'plusco-media-invest-solutions.PCC_Media_Investment.PCC_Dashboard_NATIVE',
--     'plusco-media-invest-solutions.MIR_Live_snapshots.MIR_20261103');

CREATE OR REPLACE PROCEDURE `plusco-media-invest-solutions.MIR_Live.qa_compare`(manual_table STRING, auto_table STRING)
BEGIN
  -- Only the two reads depend on the table names; EXECUTE IMMEDIATE runs one statement each.
  EXECUTE IMMEDIATE REPLACE(r'''
CREATE TEMP TABLE m AS
SELECT
  MEDIA_CODE AS media,
  CONCAT(MEDIA_CODE, SUBSTR(MCPE, 2)) AS k,
  -- 'YYYY-MM' (NATIVE) or 'Mar/2026' (raw sheet)
  IF(REGEXP_CONTAINS(CAST(MONTH AS STRING), r'^\d{4}-\d{2}$'), CAST(MONTH AS STRING),
     FORMAT_DATE('%Y-%m', SAFE.PARSE_DATE('%d/%b/%Y', CONCAT('01/', CAST(MONTH AS STRING))))) AS month,
  LTRIM(UPPER(TRIM(CAST(VENDOR_CODE AS STRING))), '0') AS v,
  ANY_VALUE(CLIENT) AS client,
  ANY_VALUE(ESTIMATE) AS estimate,
  SUM(SAFE_CAST(REGEXP_REPLACE(CAST(NET_ORDERED_CAD AS STRING), r'[$,\s]', '') AS FLOAT64)) AS cad,
  ANY_VALUE(AGENCY) AS agency, ANY_VALUE(PLUSCO_CLIENT_ID) AS client_id, ANY_VALUE(BUSINESS_LEAD) AS bl,
  ANY_VALUE(GM_POD) AS gm_pod, ANY_VALUE(PLUSCO_MEDIA_CHANNEL) AS channel, ANY_VALUE(PLUSCO_MEDIA_PARTNER) AS partner,
  ANY_VALUE(PLUSCO_DEALS_Type) AS deal
FROM `{{MANUAL}}`
WHERE MCPE IS NOT NULL
GROUP BY 1, 2, 3, 4''', '{{MANUAL}}', manual_table);

  EXECUTE IMMEDIATE REPLACE(r'''
CREATE TEMP TABLE a AS
SELECT
  MEDIA_CODE AS media,
  MCPE AS k,
  MONTH AS month,
  LTRIM(UPPER(TRIM(IF(MEDIA_CODE IN ('N','R','T'), VENDOR_CODE_MIR, VENDOR_CODE))), '0') AS v,
  ANY_VALUE(CLIENT_NAME) AS client,
  ANY_VALUE(ESTIMATE_NAME) AS estimate,
  SUM(CAST(NET_ORDERED_CAD AS FLOAT64)) AS cad,
  ANY_VALUE(AGENCY) AS agency, ANY_VALUE(PLUSCO_CLIENT_ID) AS client_id, ANY_VALUE(BUSINESS_LEAD) AS bl,
  ANY_VALUE(GM_POD) AS gm_pod, ANY_VALUE(PLUSCO_MEDIA_CHANNEL) AS channel, ANY_VALUE(PLUSCO_MEDIA_PARTNER) AS partner,
  ANY_VALUE(PLUSCO_DEALS_Type) AS deal
FROM `{{AUTO}}`
WHERE MONTH IN (SELECT DISTINCT month FROM m)
GROUP BY 1, 2, 3, 4''', '{{AUTO}}', auto_table);

  -- Money is compared at MCPE × month (vendor codes are formatted differently across sources).
  CREATE TEMP TABLE km AS
  SELECT
    COALESCE(m.media, a.media) AS media, k, month, SUBSTR(month, 1, 4) AS year,
    COALESCE(m.client, a.client) AS client, COALESCE(m.estimate, a.estimate) AS estimate,
    m.cad IS NOT NULL AS in_manual, a.cad IS NOT NULL AS in_auto,
    IFNULL(m.cad, 0) AS manual_cad, IFNULL(a.cad, 0) AS auto_cad
  FROM (SELECT media, k, month, ANY_VALUE(client) client, ANY_VALUE(estimate) estimate, SUM(cad) cad FROM m GROUP BY 1, 2, 3) m
  FULL JOIN (SELECT media, k, month, ANY_VALUE(client) client, ANY_VALUE(estimate) estimate, SUM(cad) cad FROM a GROUP BY 1, 2, 3) a
    USING (k, month);

  CREATE OR REPLACE TABLE `plusco-media-invest-solutions.MIR_Live.qa_summary` AS
  SELECT
    manual_table AS manual_table, auto_table AS auto_table, CURRENT_TIMESTAMP() AS run_at,
    year, media,
    ROUND(SUM(manual_cad), 2) AS manual_cad,
    ROUND(SUM(auto_cad), 2) AS auto_cad,
    ROUND(SUM(auto_cad) - SUM(manual_cad), 2) AS diff_cad,
    ROUND(SAFE_DIVIDE(SUM(auto_cad) - SUM(manual_cad), ABS(SUM(manual_cad))) * 100, 2) AS diff_pct,
    COUNT(*) AS lines,
    COUNTIF(in_manual AND NOT in_auto) AS only_in_manual,
    COUNTIF(in_auto AND NOT in_manual) AS only_in_auto,
    ROUND(SAFE_DIVIDE(SUM(IF(ABS(auto_cad - manual_cad) <= GREATEST(ABS(manual_cad) * 0.01, 1), ABS(manual_cad), 0)), SUM(ABS(manual_cad))) * 100, 2) AS pct_dollars_within_1pct,
    IF(ABS(SAFE_DIVIDE(SUM(auto_cad) - SUM(manual_cad), ABS(SUM(manual_cad)))) <= 0.005
       AND SAFE_DIVIDE(SUM(IF(ABS(auto_cad - manual_cad) <= GREATEST(ABS(manual_cad) * 0.01, 1), ABS(manual_cad), 0)), SUM(ABS(manual_cad))) >= 0.98,
       'PASS', 'CHECK') AS status
  FROM km GROUP BY year, media;

  CREATE OR REPLACE TABLE `plusco-media-invest-solutions.MIR_Live.qa_monthly` AS
  SELECT
    month, media,
    ROUND(SUM(manual_cad), 2) AS manual_cad,
    ROUND(SUM(auto_cad), 2) AS auto_cad,
    ROUND(SUM(auto_cad) - SUM(manual_cad), 2) AS diff_cad,
    ROUND(SAFE_DIVIDE(SUM(auto_cad) - SUM(manual_cad), ABS(SUM(manual_cad))) * 100, 2) AS diff_pct,
    IF(ABS(SUM(auto_cad) - SUM(manual_cad)) <= GREATEST(ABS(SUM(manual_cad)) * 0.005, 1000), 'PASS', 'CHECK') AS status
  FROM km GROUP BY month, media;

  CREATE OR REPLACE TABLE `plusco-media-invest-solutions.MIR_Live.qa_lines` AS
  SELECT
    year, month, media, k AS mcpe, client, estimate,
    ROUND(manual_cad, 2) AS manual_cad, ROUND(auto_cad, 2) AS auto_cad, ROUND(auto_cad - manual_cad, 2) AS diff_cad,
    CASE WHEN NOT in_auto THEN 'only in manual MIR' WHEN NOT in_manual THEN 'only in automated MIR' ELSE 'amount differs' END AS issue
  FROM km
  WHERE ABS(auto_cad - manual_cad) >= 1000 AND ABS(auto_cad - manual_cad) >= ABS(manual_cad) * 0.01;

  -- Dimensions are compared on lines present in both, at MCPE × month × vendor, weighted by $.
  CREATE OR REPLACE TABLE `plusco-media-invest-solutions.MIR_Live.qa_dimensions` AS
  WITH j AS (
    SELECT IF(m.media IN ('N','R','T'), 'Spot', 'Prisma') AS system, ABS(m.cad) AS w, m.*, a.agency a_agency, a.client_id a_client_id, a.bl a_bl,
           a.gm_pod a_gm_pod, a.channel a_channel, a.partner a_partner, a.deal a_deal
    FROM m JOIN a USING (k, month, v)
  ),
  n AS (
    SELECT system, w, f, x, y FROM j,
    UNNEST([STRUCT('AGENCY' AS f, agency AS x, a_agency AS y), ('PLUSCO_CLIENT_ID', client_id, a_client_id), ('BUSINESS_LEAD', bl, a_bl),
            ('GM_POD', gm_pod, a_gm_pod), ('PLUSCO_MEDIA_CHANNEL', channel, a_channel), ('PLUSCO_MEDIA_PARTNER', partner, a_partner),
            ('PLUSCO_DEALS_Type', deal, a_deal)])
  )
  SELECT system, f AS field,
    ROUND(SAFE_DIVIDE(SUM(IF(IFNULL(NULLIF(NULLIF(NULLIF(TRIM(x), ''), 'no match'), '#N/A'), '') = IFNULL(NULLIF(NULLIF(NULLIF(TRIM(y), ''), 'no match'), '#N/A'), ''), w, 0)), SUM(w)) * 100, 2) AS pct_dollars_agree,
    ROUND(SUM(w), 2) AS dollars_compared
  FROM n GROUP BY 1, 2;

  -- qa_dimensions only sees lines whose vendor codes match on both sides, so also report, for each
  -- MIR, the dollars that carry no channel (unmatched vendor) or no PlusCo client id.
  CREATE OR REPLACE TABLE `plusco-media-invest-solutions.MIR_Live.qa_coverage` AS
  WITH s AS (
    SELECT 'manual' AS mir, * FROM m UNION ALL SELECT 'automated', * FROM a
  )
  SELECT
    mir, IF(media IN ('N','R','T'), 'Spot', 'Prisma') AS system,
    ROUND(SUM(ABS(cad)), 2) AS dollars,
    ROUND(SUM(IF(IFNULL(NULLIF(NULLIF(NULLIF(TRIM(channel), ''), 'no match'), '#N/A'), '') = '', ABS(cad), 0)), 2) AS dollars_no_channel,
    ROUND(SUM(IF(IFNULL(NULLIF(NULLIF(NULLIF(NULLIF(TRIM(client_id), ''), 'no match'), '#N/A'), '-'), '') = '', ABS(cad), 0)), 2) AS dollars_no_client_id
  FROM s GROUP BY 1, 2;
END;
