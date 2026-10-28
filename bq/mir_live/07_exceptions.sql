-- MIR_Live.refresh_exceptions — the clients and vendors in MIR_NATIVE that the lookups could not tag,
-- for the daily "MIR: clients and vendors to confirm" e-mail (apps_script/mir_exceptions_email.gs).
--
--   MIR_Live.exceptions          today's open items, one row per client / vendor and issue, with $ by year,
--                                a sample estimate, a suggestion, and first_seen (is_new = first seen today)
--   MIR_Live.exceptions_history  every item ever seen: first_seen, last_seen, resolved_on (gone from the list)
--
-- Issues:
--   client  Not in the MO Client Key           → add the client code to the MO Client Key
--   client  Intercompany product not mapped    → add the client + product code to the MO Client Key
--   client  Forecaster client not found        → the MO Client Key points to an id the Forecaster doesn't have
--   vendor  Not in Vendor Database 2.0         → add the vendor (suggested channel from media / buy type)
--   vendor  No partner in Vendor Database 2.0  → fill PLUSCO_MEDIA_PARTNER
-- Clients mapped to '-' in the MO Client Key (deliberately not in the Forecaster) are not listed. Network TV
-- booked on group stations has no vendor until MediaOcean's Spot order file is enabled; it is one
-- "known gap" line, not one line per station.

CREATE OR REPLACE PROCEDURE `plusco-media-invest-solutions.MIR_Live.refresh_exceptions`()
BEGIN
  DECLARE today DATE DEFAULT CURRENT_DATE('America/Montreal');

  CREATE TEMP TABLE cur AS
  WITH
  n AS (SELECT * FROM `plusco-media-invest-solutions.MIR_Live.MIR_NATIVE`),
  mediabox AS (
    SELECT SPLIT(tac_billing_id, '-')[SAFE_OFFSET(1)] AS client_code,
      APPROX_TOP_COUNT(forecaster_client_name, 1)[SAFE_OFFSET(0)].value AS fc_name,
      APPROX_TOP_COUNT(client, 1)[SAFE_OFFSET(0)].value AS mb_client
    FROM `plusco-media-invest-solutions.Finance_mediabox.finance_Mediabox_combined`
    WHERE tac_billing_id IS NOT NULL
    GROUP BY 1
  ),
  clients AS (
    SELECT
      'client' AS kind,
      CASE
        WHEN CLIENT_INTERCO = 'INTERCO' THEN 'Intercompany product not mapped'
        WHEN PLUSCO_CLIENT_NAME IS NULL THEN 'Not in the MO Client Key'
        ELSE 'Forecaster client not found'
      END AS issue,
      IF(CLIENT_INTERCO = 'INTERCO', CONCAT(CLIENT_CODE, ' / ', PRODUCT_CODE), CLIENT_CODE) AS code,
      ANY_VALUE(IF(CLIENT_INTERCO = 'INTERCO', CONCAT(CLIENT, ' / ', PRODUCT), CLIENT)) AS name,
      ANY_VALUE(OFFICE) AS agency,
      STRING_AGG(DISTINCT MEDIA_CODE, '' ORDER BY MEDIA_CODE) AS media,
      SUM(IF(PLUSCO_YEAR = '2025', NET_ORDERED_CAD, 0)) AS cad_2025,
      SUM(IF(PLUSCO_YEAR = '2026', NET_ORDERED_CAD, 0)) AS cad_2026,
      SUM(IF(PLUSCO_YEAR = '2027', NET_ORDERED_CAD, 0)) AS cad_2027,
      COUNT(*) AS lines,
      APPROX_TOP_COUNT(ESTIMATE, 1)[SAFE_OFFSET(0)].value AS sample_estimate,
      ANY_VALUE(CLIENT_CODE) AS client_code
    FROM n
    WHERE IFNULL(PLUSCO_CLIENT_ID, '') != '-'
      AND (PLUSCO_CLIENT_ID IS NULL OR GM_POD IS NULL)
    GROUP BY 1, 2, 3
  ),
  vendors AS (
    SELECT
      'vendor' AS kind,
      IF(present_in_Database_2_0 IS NULL, 'Not in Vendor Database 2.0', 'No partner in Vendor Database 2.0') AS issue,
      VENDOR_CODE AS code,
      ANY_VALUE(VENDOR) AS name,
      STRING_AGG(DISTINCT OFFICE, ', ' ORDER BY OFFICE) AS agency,
      STRING_AGG(DISTINCT MEDIA_CODE, '' ORDER BY MEDIA_CODE) AS media,
      SUM(IF(PLUSCO_YEAR = '2025', NET_ORDERED_CAD, 0)) AS cad_2025,
      SUM(IF(PLUSCO_YEAR = '2026', NET_ORDERED_CAD, 0)) AS cad_2026,
      SUM(IF(PLUSCO_YEAR = '2027', NET_ORDERED_CAD, 0)) AS cad_2027,
      COUNT(*) AS lines,
      APPROX_TOP_COUNT(CONCAT(CLIENT_CODE, ' ', ESTIMATE), 1)[SAFE_OFFSET(0)].value AS sample_estimate,
      -- Suggested channel, from the media and the most common buy type.
      CASE ANY_VALUE(MEDIA_CODE)
        WHEN 'M' THEN 'Print' WHEN 'O' THEN 'OOH' WHEN 'R' THEN 'Radio' WHEN 'T' THEN 'TV' WHEN 'N' THEN 'TV'
        WHEN 'I' THEN CASE APPROX_TOP_COUNT(BUYTYPE, 1)[SAFE_OFFSET(0)].value
          WHEN 'SEARCH' THEN 'SEM' WHEN 'SOCIAL' THEN 'Social' WHEN 'AUDIO' THEN 'Digital Direct (audio)'
          ELSE 'Digital Direct or Programmatic: check' END
      END AS suggestion
    FROM n
    WHERE (present_in_Database_2_0 IS NULL
        OR IFNULL(PLUSCO_MEDIA_PARTNER, '') IN ('', '#N/A'))
      -- Network TV group stations: one known-gap line below.
      AND NOT (MEDIA_CODE = 'N' AND present_in_Database_2_0 IS NULL AND VENDOR IN ('no match'))
      AND NOT VENDOR_CODE IN ('FRACN', 'ENGCN', 'TORHN', 'MTLFN', 'VANV')
    GROUP BY 1, 2, 3
  ),
  network_gap AS (
    SELECT
      'vendor' AS kind, 'Known gap: network TV not split by network' AS issue, 'NETWORK GROUPS' AS code,
      'FRACN, ENGCN, TORHN, MTLFN, VANV and affiliate groups' AS name, CAST(NULL AS STRING) AS agency, 'N' AS media,
      SUM(IF(PLUSCO_YEAR = '2025', NET_ORDERED_CAD, 0)) AS cad_2025, SUM(IF(PLUSCO_YEAR = '2026', NET_ORDERED_CAD, 0)) AS cad_2026,
      SUM(IF(PLUSCO_YEAR = '2027', NET_ORDERED_CAD, 0)) AS cad_2027, COUNT(*) AS lines, CAST(NULL AS STRING) AS sample_estimate,
      "Needs MediaOcean's Spot order file (spot_order) in the extract" AS suggestion
    FROM n
    WHERE MEDIA_CODE = 'N' AND present_in_Database_2_0 IS NULL
      AND (VENDOR = 'no match' OR VENDOR_CODE IN ('FRACN', 'ENGCN', 'TORHN', 'MTLFN', 'VANV'))
  )
  SELECT c.* EXCEPT (client_code),
    CASE
      WHEN c.issue = 'Not in the MO Client Key' AND mb.fc_name IS NOT NULL
        THEN CONCAT('MediaBox bills these MCPEs to ', mb.fc_name, IF(mb.mb_client IS NOT NULL AND mb.mb_client != mb.fc_name, CONCAT(' (', mb.mb_client, ')'), ''))
      WHEN c.issue = 'Not in the MO Client Key' THEN 'New client? Not in MediaBox either'
      WHEN c.issue = 'Intercompany product not mapped' THEN 'Add the client + product code to the MO Client Key'
      ELSE 'Check the Forecaster client id in the MO Client Key'
    END AS suggestion
  FROM clients c
  LEFT JOIN mediabox mb ON mb.client_code = c.client_code
  UNION ALL SELECT * FROM vendors
  UNION ALL SELECT * FROM network_gap WHERE lines > 0;

  -- Keep only items with dollars (the known gap always shows).
  DELETE FROM cur WHERE ABS(cad_2025) + ABS(cad_2026) + ABS(cad_2027) < 1 AND code != 'NETWORK GROUPS';

  MERGE `plusco-media-invest-solutions.MIR_Live.exceptions_history` h
  USING cur c ON h.kind = c.kind AND h.issue = c.issue AND h.code = c.code AND h.resolved_on IS NULL
  WHEN MATCHED THEN UPDATE SET last_seen = today, name = c.name
  WHEN NOT MATCHED BY TARGET THEN INSERT (kind, issue, code, name, first_seen, last_seen, resolved_on)
    VALUES (c.kind, c.issue, c.code, c.name, today, today, NULL)
  WHEN NOT MATCHED BY SOURCE AND h.resolved_on IS NULL THEN UPDATE SET resolved_on = today;

  CREATE OR REPLACE TABLE `plusco-media-invest-solutions.MIR_Live.exceptions` AS
  SELECT c.*, h.first_seen, h.first_seen = today AS is_new, today AS as_of
  FROM cur c
  JOIN `plusco-media-invest-solutions.MIR_Live.exceptions_history` h
    ON h.kind = c.kind AND h.issue = c.issue AND h.code = c.code AND h.resolved_on IS NULL;
END;
