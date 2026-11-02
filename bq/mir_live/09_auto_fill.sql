-- MIR_Live auto-fill — a proposed row for every new client and vendor the exceptions list (07_exceptions.sql)
-- finds, so nobody has to research them by hand. apps_script/mir_auto_fill.gs writes the proposals into the
-- Vendor Database 2.0 and the MO Client Key every morning: a sure row as is, a doubtful one highlighted
-- yellow with a "DOUBT" note saying what was assumed and what to confirm. The doubts go to their owners in
-- a weekly e-mail.
--
--   MIR_Live.vendor_fill(codes)   one proposed Vendor Database 2.0 row per vendor code
--   MIR_Live.client_fill(keys)    one proposed MO Client Key row per client code ('1IA') or interco
--                                 client / product ('1IA / AO2')
--   MIR_Live.fill_suggestions     today's proposals for the open exceptions (refresh_fill_suggestions,
--                                 called by run_daily after refresh_exceptions)
--
-- How a vendor is filled — from the closest rows already in the database (never the vendor's own row):
--   1. same vendor name under another code (e.g. a second National Post edition code)
--   2. same paying rep (the publisher / station group MediaOcean pays)
--   3. the paying rep of a MediaOcean vendor with the same name (e.g. a magazine's print code for its
--      new digital code)
--   4. a similar name (same first word) — always a doubt
-- It is sure when one partner accounts for >= 80 % of those rows and the channel is certain (a row of the
-- same media to copy, a media with one channel — Print, OOH, Radio, TV — or a new digital publisher that
-- isn't an ad-tech name or a search / social buy). Radio / TV are sure only on the same name: their paying
-- rep is a sales house (CBS…), not the owner; they also need a station of the same market for the province
-- and language. Nothing similar at all: a print / digital vendor under $5,000 is filled as an independent
-- publisher under its own name; above that, or a station, it is a doubt.
-- Backtest on the vendors filled by hand on 2026-10-28/29: 25 of 32 sure rows had the same partner and all
-- 32 the same channel; the 7 others were small titles (<= $6,200 each) that belong to a group or are named
-- differently in the database.
-- How a client is filled: an interco product goes to the client its sister products already point to
-- (AO2 → AO / AO1) or whose name it carries (EDG EXCELSIOR DG → Excelsior Works Ltd); a new client code
-- goes to the client MediaBox bills its campaigns to. Anything else is a doubt left blank for the owner.

CREATE OR REPLACE TABLE FUNCTION `plusco-media-invest-solutions.MIR_Live.vendor_fill`(codes ARRAY<STRING>) AS (
  WITH
  -- The vendor as the MIR sees it.
  t AS (
    SELECT VENDOR_CODE AS code,
      ANY_VALUE(NULLIF(UPPER(TRIM(VENDOR)), 'NO MATCH')) AS mir_name,
      ANY_VALUE(MEDIA_CODE) AS media,
      APPROX_TOP_COUNT(BUYTYPE, 1)[SAFE_OFFSET(0)].value AS buytype,
      APPROX_TOP_COUNT(PAYREP_CODE, 1)[SAFE_OFFSET(0)].value AS payrep_code,
      APPROX_TOP_COUNT(PAYREP, 1)[SAFE_OFFSET(0)].value AS payrep,
      SUM(NET_ORDERED_CAD) AS cad
    FROM `plusco-media-invest-solutions.MIR_Live.MIR_NATIVE`
    WHERE VENDOR_CODE IN UNNEST(codes)
    GROUP BY 1
  ),
  mo AS (
    SELECT COLLATE(media_code, '') AS media, LTRIM(COLLATE(vendor_code, ''), '0') AS code,
      UPPER(TRIM(COLLATE(vendor_name, ''))) AS name, NULLIF(LTRIM(COLLATE(paying_rep_code, ''), '0'), '') AS rep,
      COLLATE(market_code, '') AS market_code, COLLATE(vendor_market, '') AS market
    FROM `mediaocean-data.L2_Media.master_vendor`
  ),
  -- Spot codes are 'CJSP-FM' in the MIR and 'CJSPF' in MediaOcean's vendor master.
  tm AS (
    SELECT t.*, COALESCE(t.mir_name, mo.name) AS name, mo.code AS mo_code,
      COALESCE(NULLIF(LTRIM(t.payrep_code, '0'), 'N/A*'), mo.rep) AS rep,
      NULLIF(mo.market_code, 'n/a') AS market_code, NULLIF(mo.market, 'n/a') AS market
    FROM t
    LEFT JOIN mo ON mo.media = IF(t.media = 'N', 'N', t.media)
      AND mo.code = LTRIM(REGEXP_REPLACE(t.code, r'^(\w+)-(\w)\w*$', r'\1\2'), '0')
  ),
  db AS (
    SELECT *, LEFT(MEDIA, 1) AS med, NULLIF(LTRIM(PAYREP_CODE, '0'), 'N/A*') AS rep, UPPER(TRIM(VENDOR)) AS name,
      (IF(PLUSCO_VENDOR_COUNTRY IS NULL, 0, 1) + IF(PLUSCO_VENDOR_PROVINCE IS NULL, 0, 1)
        + IF(PLUSCO_VENDOR_LANGUAGE IS NULL, 0, 1) + IF(PLUSCO_VENDOR_AUDIENCE IS NULL, 0, 1)) AS filled
    FROM `plusco-media-invest-solutions.Finance_mediabox.MIR_VENDOR_DATABASE`
    WHERE VENDOR_CODE_MIR IS NOT NULL AND IFNULL(PLUSCO_MEDIA_PARTNER, '') NOT IN ('', '#N/A', 'TBC', 'N/A')
  ),
  same_name_reps AS (
    SELECT DISTINCT tm.code, mo.rep
    FROM tm JOIN mo ON mo.name = tm.name AND mo.code != IFNULL(tm.mo_code, '') AND mo.rep IS NOT NULL
      AND IF(tm.media IN ('R', 'T', 'N'), mo.media = tm.media, mo.media NOT IN ('R', 'T', 'N'))
  ),
  sib AS (
    SELECT tm.code, 1 AS strength, 'same name' AS why, db.* FROM tm JOIN db ON db.name = tm.name AND db.VENDOR_CODE_MIR != tm.code
    UNION ALL
    SELECT tm.code, 2, 'same paying rep', db.* FROM tm JOIN db ON db.rep = tm.rep AND db.VENDOR_CODE_MIR != tm.code
      AND IF(tm.media IN ('R', 'T', 'N'), db.med = tm.media, db.med NOT IN ('R', 'T', 'N'))
    UNION ALL
    SELECT s.code, 3, 'paying rep of the same title in MediaOcean', db.* FROM same_name_reps s JOIN tm USING (code)
      JOIN db ON db.rep = s.rep AND db.VENDOR_CODE_MIR != s.code
      AND IF(tm.media IN ('R', 'T', 'N'), db.med = tm.media, db.med NOT IN ('R', 'T', 'N'))
    UNION ALL
    SELECT tm.code, 4, 'similar name', db.* FROM tm JOIN db
      ON REGEXP_EXTRACT(db.name, r'^[A-Z0-9]+') = REGEXP_EXTRACT(tm.name, r'^[A-Z0-9]+')
      AND LENGTH(REGEXP_EXTRACT(tm.name, r'^[A-Z0-9]+')) >= 5
      AND REGEXP_EXTRACT(tm.name, r'^[A-Z0-9]+') NOT IN ('JOURNAL', 'MAGAZINE', 'RADIO', 'REVUE', 'RESEAU', 'GROUPE', 'MEDIA', 'CANADA', 'GLOBAL', 'NATIONAL', 'THE')
      AND db.VENDOR_CODE_MIR != tm.code
  ),
  best AS (
    SELECT sib.*, tm.media AS t_media
    FROM sib JOIN tm USING (code)
    QUALIFY sib.strength = MIN(sib.strength) OVER (PARTITION BY sib.code)
  ),
  partners AS (
    SELECT code, PLUSCO_MEDIA_PARTNER AS partner, COUNT(*) AS n,
      SUM(COUNT(*)) OVER (PARTITION BY code) AS total,
      ROW_NUMBER() OVER (PARTITION BY code ORDER BY COUNT(*) DESC, PLUSCO_MEDIA_PARTNER) AS rk
    FROM best GROUP BY 1, 2
  ),
  others AS (
    SELECT code, STRING_AGG(partner, ', ' ORDER BY n DESC LIMIT 3) AS other_partners FROM partners WHERE rk > 1 GROUP BY 1
  ),
  -- The row to copy: the main partner's, same media first, most attributes filled.
  tmpl AS (
    SELECT b.*, p.n, p.total, o.other_partners
    FROM best b JOIN partners p ON p.code = b.code AND p.partner = b.PLUSCO_MEDIA_PARTNER AND p.rk = 1
    LEFT JOIN others o ON o.code = b.code
    QUALIFY ROW_NUMBER() OVER (PARTITION BY b.code ORDER BY b.med = b.t_media DESC, b.filled DESC, b.VENDOR_CODE_MIR) = 1
  ),
  -- Radio / TV: province, market and language of the stations already in the database for that market.
  markets AS (
    SELECT SPOT_MARKET_CODE AS market_code,
      APPROX_TOP_COUNT(PLUSCO_VENDOR_COUNTRY, 1)[SAFE_OFFSET(0)].value AS country,
      APPROX_TOP_COUNT(PLUSCO_VENDOR_PROVINCE, 1)[SAFE_OFFSET(0)].value AS province,
      APPROX_TOP_COUNT(PLUSCO_VENDOR_MARKET, 1)[SAFE_OFFSET(0)].value AS vendor_market,
      APPROX_TOP_COUNT(PLUSCO_VENDOR_LANGUAGE, 1)[SAFE_OFFSET(0)].value AS language,
      COUNT(DISTINCT PLUSCO_VENDOR_LANGUAGE) AS languages
    FROM db WHERE SPOT_MARKET_CODE IS NOT NULL AND PLUSCO_VENDOR_PROVINCE IS NOT NULL
    GROUP BY 1
  ),
  media_labels AS (
    SELECT LEFT(MEDIA, 1) AS med, APPROX_TOP_COUNT(MEDIA, 1)[SAFE_OFFSET(0)].value AS label
    FROM `plusco-media-invest-solutions.Finance_mediabox.MIR_VENDOR_DATABASE` WHERE MEDIA IS NOT NULL GROUP BY 1
  ),
  j AS (
    SELECT tm.*, x.VENDOR_CODE_MIR AS from_code, x.VENDOR AS from_name, x.why, x.strength, x.n, x.total, x.other_partners,
      x.med = tm.media AS same_media, x.PLUSCO_MEDIA_CHANNEL AS x_channel, x.PLUSCO_PROGRAMMATIC AS x_programmatic,
      x.PLUSCO_LOCAL_MEDIA AS x_local, x.PLUSCO_PAY_REP AS x_pay_rep, x.PLUSCO_MEDIA_PARTNER AS x_partner,
      x.PLUSCO_PARTNER_RepHouseTag AS x_rephouse, x.PLUSCO_MEDIA_OWNER AS x_owner,
      x.PLUSCO_VENDOR_COUNTRY AS x_country, x.PLUSCO_VENDOR_PROVINCE AS x_province, x.PLUSCO_VENDOR_MARKET AS x_market,
      x.PLUSCO_VENDOR_LANGUAGE AS x_language, x.PLUSCO_VENDOR_LANGUAGE_Detail AS x_language_detail,
      x.PLUSCO_VENDOR_AUDIENCE AS x_audience, x.PLUSCO_CONVENTIONAL_SPECIALTY AS x_conv, x.SPOT_Type AS x_spot_type,
      x.SPOT_MARKET_CODE AS x_market_code,
      m.country AS m_country, m.province AS m_province, m.vendor_market AS m_market, m.language AS m_language, m.languages AS m_languages,
      ml.label AS media_label
    FROM tm
    LEFT JOIN tmpl x ON x.code = tm.code
    LEFT JOIN markets m ON m.market_code = tm.market_code
    LEFT JOIN media_labels ml ON ml.med = tm.media
  ),
  c AS (
    SELECT j.*,
      -- The vendor name without MediaOcean's suffixes, as a partner name ('APCHQ .COM' → APCHQ).
      TRIM(REGEXP_REPLACE(REGEXP_REPLACE(name, r'\s*(-\s*(MEK|BRP|CAG|USD|MC|GCI)|\bUSD|\bNEWSP|\bLLC|\bINC\.?)\s*$', ''),
        r'\s*\.\s*(COM|CA|QC\.CA|ORG|NET|O)$', '')) AS clean_name,
      CASE
        WHEN same_media AND x_channel IS NOT NULL THEN x_channel
        WHEN media = 'M' THEN 'Print' WHEN media = 'O' THEN 'OOH' WHEN media = 'R' THEN 'Radio' WHEN media IN ('T', 'N') THEN 'TV'
        WHEN buytype = 'SEARCH' THEN 'Programmatic & SEM'
        ELSE 'Digital Direct'
      END AS channel,
      -- A new digital vendor is almost always a publisher sold direct; ad-tech names and search / social
      -- buys are checked.
      IFNULL(same_media AND x_channel IS NOT NULL, FALSE) OR media IN ('M', 'O', 'R', 'T', 'N')
        OR (IFNULL(buytype, '') NOT IN ('SEARCH', 'SOCIAL')
          AND NOT REGEXP_CONTAINS(name, r'PROGRAMMATIC|\bDSP\b|TRADE ?DESK|DV360|XANDR|STACKADAPT|AD ?TECH|EXCHANGE|MEDIA ?IQ|\bMIQ\b')) AS channel_sure,
      media IN ('R', 'T', 'N') AS spot,
      -- Same market as the copied station: take its province and language as is.
      media IN ('R', 'T', 'N') AND x_market_code IS NOT NULL AND x_market_code = market_code AS same_market
    FROM j
  ),
  doubts AS (
    SELECT c.*,
      ARRAY_TO_STRING(ARRAY(SELECT d FROM UNNEST([
        -- Nothing similar: an independent publisher under its own name. Small ones are filled as such;
        -- from $5,000 someone checks it isn't part of a group.
        IF(from_code IS NULL AND NOT spot AND ABS(cad) >= 5000, FORMAT('new publisher, nothing similar in the database: partner set to its own name (%s). Part of a group?', clean_name), NULL),
        -- A radio / TV station always belongs to a group.
        IF(from_code IS NULL AND spot, 'new station, nothing similar in the database: which group owns it?', NULL),
        -- Radio / TV: the paying rep is a sales house (CBS, etc.), not the owner.
        IF(spot AND strength IN (2, 3), FORMAT("owner taken from a station with the same sales rep (%s %s): the station's owner may differ", from_code, from_name), NULL),
        IF(strength = 4, FORMAT('matched on a similar name only (%s %s): same publisher?', from_code, from_name), NULL),
        IF(from_code IS NOT NULL AND n / total < 0.8, FORMAT('this paying rep sells several partners (%s, also %s): picked %s', x_partner, other_partners, x_partner), NULL),
        IF(NOT channel_sure, FORMAT('channel set to %s (buy type %s): right channel?', channel, IFNULL(buytype, '?')), NULL),
        IF(spot AND NOT same_market AND m_province IS NULL, FORMAT('no station of market %s in the database yet: province and language left blank', IFNULL(market, '?')), NULL),
        IF(spot AND NOT same_market AND m_languages > 1, FORMAT('market %s has stations in several languages: picked %s', market, m_language), NULL)
      ]) AS d WHERE d IS NOT NULL), '; ') AS doubt
    FROM c
  )
  SELECT
    code, name, media AS media_code, cad,
    doubt = '' AS sure,
    IF(doubt = '',
      IF(from_code IS NULL,
        FORMAT('Auto-filled %s: new independent publisher, under its own name.', FORMAT_DATE('%b %d', CURRENT_DATE('America/Montreal'))),
        FORMAT('Auto-filled %s: copied from %s %s (%s).', FORMAT_DATE('%b %d', CURRENT_DATE('America/Montreal')), from_code, from_name, why)),
      FORMAT('DOUBT (auto-fill %s): %s.%s', FORMAT_DATE('%b %d', CURRENT_DATE('America/Montreal')), doubt,
        IF(from_code IS NULL, '', FORMAT(' Copied from %s %s (%s).', from_code, from_name, why)))) AS note,
    from_code,
    -- Vendor Database 2.0 columns A:AC (K:N, the Key_2026_Deals lookups, are formulas the script writes).
    IFNULL(media_label, media) AS MEDIA,
    channel AS PLUSCO_MEDIA_CHANNEL,
    IF(same_media, x_programmatic, NULL) AS PLUSCO_PROGRAMMATIC,
    IFNULL(x_local, 'LOCAL') AS PLUSCO_LOCAL_MEDIA,
    IFNULL(mo_code, code) AS VENDOR_CODE_API,
    code AS VENDOR_CODE_MIR,
    name AS VENDOR,
    IFNULL(payrep_code, 'N/A*') AS PAYREP_CODE,
    IFNULL(payrep, 'N/A*') AS PAYREP,
    COALESCE(x_pay_rep, x_partner, clean_name) AS PLUSCO_PAY_REP,
    COALESCE(x_partner, clean_name) AS PLUSCO_MEDIA_PARTNER,
    x_rephouse AS PLUSCO_PARTNER_RepHouseTag,
    COALESCE(x_owner, x_partner, clean_name) AS PLUSCO_MEDIA_OWNER,
    IF(spot, market_code, NULL) AS SPOT_MARKET_CODE,
    IF(spot, market, NULL) AS SPOT_MARKET_NAME,
    IF(spot AND NOT same_market, m_country, x_country) AS PLUSCO_VENDOR_COUNTRY,
    IF(spot AND NOT same_market, m_province, x_province) AS PLUSCO_VENDOR_PROVINCE,
    IF(spot AND NOT same_market, m_market, x_market) AS PLUSCO_VENDOR_MARKET,
    IF(spot AND NOT same_market, m_language, x_language) AS PLUSCO_VENDOR_LANGUAGE,
    IF(spot AND NOT same_market, m_language, x_language_detail) AS PLUSCO_VENDOR_LANGUAGE_Detail,
    IF(same_media, x_audience, NULL) AS PLUSCO_VENDOR_AUDIENCE,
    IF(same_media, x_conv, NULL) AS PLUSCO_CONVENTIONAL_SPECIALTY,
    IF(same_media, x_spot_type, NULL) AS SPOT_Type
  FROM doubts
);

CREATE OR REPLACE TABLE FUNCTION `plusco-media-invest-solutions.MIR_Live.client_fill`(keys ARRAY<STRING>) AS (
  WITH
  -- The client (or interco client / product) as the MIR sees it.
  t AS (
    SELECT
      IF(CLIENT_INTERCO = 'INTERCO', CONCAT(CLIENT_CODE, ' / ', PRODUCT_CODE), CLIENT_CODE) AS code,
      ANY_VALUE(CLIENT_CODE) AS client_code, ANY_VALUE(IF(CLIENT_INTERCO = 'INTERCO', PRODUCT_CODE, NULL)) AS product_code,
      ANY_VALUE(CLIENT) AS client_name, ANY_VALUE(IF(CLIENT_INTERCO = 'INTERCO', PRODUCT, NULL)) AS product_name,
      ANY_VALUE(CLIENT_INTERCO = 'INTERCO') AS interco, ANY_VALUE(OFFICE) AS agency,
      SUM(NET_ORDERED_CAD) AS cad,
      APPROX_TOP_COUNT(ESTIMATE, 1)[SAFE_OFFSET(0)].value AS estimate,
      STRING_AGG(DISTINCT MEDIA_CODE, '' ORDER BY MEDIA_CODE) AS media
    FROM `plusco-media-invest-solutions.MIR_Live.MIR_NATIVE`
    WHERE IF(CLIENT_INTERCO = 'INTERCO', CONCAT(CLIENT_CODE, ' / ', PRODUCT_CODE), CLIENT_CODE) IN UNNEST(keys)
    GROUP BY 1
  ),
  -- One row per Forecaster client in the key, with its ids.
  fc AS (
    SELECT forecaster_client_id, ANY_VALUE(forecaster_client_name) AS forecaster_client_name,
      APPROX_TOP_COUNT(CLIENT_CURRENCY_MO, 1)[SAFE_OFFSET(0)].value AS currency,
      APPROX_TOP_COUNT(mb_2_0_client_id, 1)[SAFE_OFFSET(0)].value AS mb_id,
      APPROX_TOP_COUNT(mb_2_0_client_name, 1)[SAFE_OFFSET(0)].value AS mb_name,
      APPROX_TOP_COUNT(gaia_client_id, 1)[SAFE_OFFSET(0)].value AS gaia
    FROM `plusco-media-invest-solutions.Finance_mediabox.MO_Client_Key`
    WHERE IFNULL(forecaster_client_id, '-') != '-'
    GROUP BY 1
  ),
  key_rows AS (
    SELECT MO_client_id, MO_product_code, MO_product, forecaster_client_id
    FROM `plusco-media-invest-solutions.Finance_mediabox.MO_Client_Key`
    WHERE IFNULL(forecaster_client_id, '-') != '-'
  ),
  -- Distinctive words of a product name ('AO2 AFFICHAGE AIRBUS 2' → AIRBUS), and of client names.
  words AS (
    SELECT t.code, w
    FROM t, UNNEST(REGEXP_EXTRACT_ALL(UPPER(IFNULL(t.product_name, t.client_name)), r'[A-ZÀ-Ü]{4,}')) AS w
    WHERE w NOT IN ('AFFICHAGE', 'DIGITAL', 'IMPRIME', 'PRINT', 'RADIO', 'TELEVISION', 'FRAIS', 'FEES', 'HONORAIRE',
      'HONORAIRES', 'RESEAU', 'MISE', 'LIGNE', 'INTERCO', 'INTER', 'MEDIA', 'COSSETTE', 'AGENCY', 'POOL', 'RETAIL',
      'CANADA', 'GROUPE', 'GROUP', 'INC', 'LTEE', 'LTD', 'RECYCLE', 'OUT', 'HOME', 'SOCIAL', 'SEARCH', 'BRAND')
  ),
  -- sure_ok: the match alone is enough to fill without a doubt. A word of a new client's own name matching a
  -- Forecaster client is only a lead (words like WORKS or SOLUTIONS recur); an interco product is named after
  -- its client on purpose (EDG EXCELSIOR DG).
  cand AS (
    -- 1. sister products of the same interco client (AO2 → AO, AO1)
    SELECT t.code, 1 AS strength, TRUE AS sure_ok, k.forecaster_client_id, FORMAT('same as %s / %s', k.MO_client_id, k.MO_product) AS why
    FROM t JOIN key_rows k ON t.interco AND k.MO_client_id = t.client_code AND k.MO_product_code != t.product_code
      AND REGEXP_REPLACE(k.MO_product_code, r'\d+$', '') = REGEXP_REPLACE(t.product_code, r'\d+$', '')
    UNION ALL
    -- 2. a distinctive word shared with a product of the same client or with a Forecaster client's name
    SELECT w.code, 2, TRUE, k.forecaster_client_id, FORMAT('"%s" is in %s / %s', w.w, k.MO_client_id, k.MO_product)
    FROM words w JOIN t USING (code) JOIN key_rows k ON t.interco AND k.MO_client_id = t.client_code AND k.MO_product_code != t.product_code
      AND REGEXP_CONTAINS(UPPER(k.MO_product), CONCAT(r'\b', w.w, r'\b'))
    UNION ALL
    SELECT w.code, 2, t.interco, f.forecaster_client_id, FORMAT('"%s" is in the client name %s', w.w, f.forecaster_client_name)
    FROM words w JOIN t USING (code) JOIN fc f ON REGEXP_CONTAINS(UPPER(f.forecaster_client_name), CONCAT(r'\b', w.w, r'\b'))
    UNION ALL
    -- 3. MediaBox bills this client code's campaigns to a Forecaster client
    SELECT t.code, 1, TRUE, f.forecaster_client_id, FORMAT('MediaBox bills %s campaigns to %s', t.client_code, mb.fc_name)
    FROM t
    JOIN (
      SELECT SPLIT(tac_billing_id, '-')[SAFE_OFFSET(1)] AS client_code,
        APPROX_TOP_COUNT(forecaster_client_name, 1)[SAFE_OFFSET(0)].value AS fc_name
      FROM `plusco-media-invest-solutions.Finance_mediabox.finance_Mediabox_combined`
      WHERE tac_billing_id IS NOT NULL GROUP BY 1
    ) mb ON mb.client_code = t.client_code AND NOT t.interco
    JOIN fc f ON f.forecaster_client_name = mb.fc_name
  ),
  best AS (
    SELECT c.code, ARRAY_AGG(DISTINCT c.forecaster_client_id) AS ids, ANY_VALUE(c.why) AS why,
      LOGICAL_AND(c.sure_ok) AS sure_ok,
      STRING_AGG(DISTINCT f.forecaster_client_name, ', ') AS names
    FROM (SELECT * FROM cand QUALIFY strength = MIN(strength) OVER (PARTITION BY code)) c
    JOIN fc f USING (forecaster_client_id)
    GROUP BY 1
  )
  SELECT
    t.code, IFNULL(t.product_name, t.client_name) AS name, t.media, t.cad,
    IFNULL(ARRAY_LENGTH(b.ids) = 1 AND b.sure_ok, FALSE) AS sure,
    CASE
      WHEN ARRAY_LENGTH(b.ids) = 1 AND b.sure_ok THEN FORMAT('Auto-filled %s: %s.', FORMAT_DATE('%b %d', CURRENT_DATE('America/Montreal')), b.why)
      WHEN ARRAY_LENGTH(b.ids) = 1 THEN FORMAT('DOUBT (auto-fill %s): filled as %s because %s. Right client? %s, media %s, estimate "%s", $%s.',
        FORMAT_DATE('%b %d', CURRENT_DATE('America/Montreal')), b.names, b.why,
        t.agency, t.media, t.estimate, FORMAT("%'d", CAST(ROUND(t.cad) AS INT64)))
      WHEN ARRAY_LENGTH(b.ids) > 1 THEN FORMAT('DOUBT (auto-fill %s): matches several clients (%s). Which one? %s, %s, estimate "%s", $%s.',
        FORMAT_DATE('%b %d', CURRENT_DATE('America/Montreal')),
        b.names,
        t.agency, t.media, t.estimate, FORMAT("%'d", CAST(ROUND(t.cad) AS INT64)))
      ELSE FORMAT('DOUBT (auto-fill %s): which client is this? %s, media %s, estimate "%s", $%s. Not in the Forecaster or MediaBox by name. Fill the Forecaster client, or "-" if it is not tracked.',
        FORMAT_DATE('%b %d', CURRENT_DATE('America/Montreal')), t.agency, t.media, t.estimate, FORMAT("%'d", CAST(ROUND(t.cad) AS INT64)))
    END AS note,
    -- MO Client Key columns A:K.
    t.client_code AS MO_client_id,
    t.client_name AS MO_client_name,
    t.product_code AS MO_product_code,
    t.product_name AS MO_product,
    IF(t.interco, 'INTERCO', NULL) AS CLIENT_INTERCO,
    f.forecaster_client_id, f.forecaster_client_name,
    f.currency AS CLIENT_CURRENCY_MO,
    f.mb_id AS mb_2_0_client_id, f.mb_name AS mb_2_0_client_name, f.gaia AS gaia_client_id
  FROM t
  LEFT JOIN best b USING (code)
  LEFT JOIN fc f ON ARRAY_LENGTH(b.ids) = 1 AND f.forecaster_client_id = b.ids[OFFSET(0)]
);

CREATE OR REPLACE PROCEDURE `plusco-media-invest-solutions.MIR_Live.refresh_fill_suggestions`()
BEGIN
  CREATE OR REPLACE TABLE `plusco-media-invest-solutions.MIR_Live.fill_suggestions` AS
  WITH e AS (SELECT * FROM `plusco-media-invest-solutions.MIR_Live.exceptions` WHERE code != 'NETWORK GROUPS')
  SELECT 'vendor' AS kind,
    IF(e.issue = 'No partner in Vendor Database 2.0', 'fill_partner', 'append') AS action,
    CURRENT_DATE('America/Montreal') AS as_of,
    TO_JSON_STRING(v) AS row_json, v.code, v.name, v.sure, v.note, v.cad
  FROM e JOIN `plusco-media-invest-solutions.MIR_Live.vendor_fill`(
    ARRAY(SELECT code FROM e WHERE kind = 'vendor')) v ON e.kind = 'vendor' AND v.code = e.code
  UNION ALL
  SELECT 'client', IF(e.issue = 'Forecaster client not found', 'check_id', 'append'),
    CURRENT_DATE('America/Montreal'), TO_JSON_STRING(c), c.code, c.name, c.sure AND e.issue != 'Forecaster client not found',
    IF(e.issue = 'Forecaster client not found', CONCAT('DOUBT: the key points to a Forecaster id that no longer exists. ', c.note), c.note), c.cad
  FROM e JOIN `plusco-media-invest-solutions.MIR_Live.client_fill`(
    ARRAY(SELECT code FROM e WHERE kind = 'client')) c ON e.kind = 'client' AND c.code = e.code;
END;
