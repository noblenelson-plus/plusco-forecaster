-- filepath: bq/KPI_BY_CLIENT_2025_vs_2026.sql
-- CHANGE (monthly breakdown, 2026-11-03): adds monthly_kpis — a JSON string,
--   one entry per year × month (2025 + 2026) with the client's spend columns
--   computed with EXACTLY the annual rules above them (same CASEs, minus the
--   year test; Billups OOH / Print are NOT eligibility-gated here — the app
--   gates them like the annual columns), the month's Labs spend by configured
--   partner (lp), and — 2026 only — the month's Labs target / booked per
--   partner from labs_pacing_wide (lt / lb). Summed over all months each field
--   equals its annual column. Additive: no existing column changes. The app's
--   Exec KPI → Media & Labs KPIs Months filter reads it.
-- CHANGE (Labs = configured partners only, 2026-10-02): labs_2026 / labs_2025 now
--   count LABS / LABS - BRP rows ONLY for partners configured in the Forecaster's
--   Labs partner list (pluscoops.forecaster_1.labs_partners, year 2026; partner
--   family = the name before "-", e.g. Billups-OOH -> BILLUPS). This matches the
--   media team's Labs Share of Total Media (e.g. Sep 28 MIR: $98,457,925 / 21%)
--   and excludes LABS-tagged partners outside the program (Trader Interactive,
--   iHeart Media, Sirius XM, Media Pulse). 2025 uses the same 2026 list so the
--   YoY comparison is like-for-like. Adding a partner in Admin -> LABS flows in
--   at the next rebuild. Everything else is unchanged.
-- CHANGE (Labs partner breakdown, 2026-10-02): adds labs_by_partner_2026 — a
--   JSON string [{"p":"BILLUPS","v":34169435.12}, ...] of each client's 2026
--   Labs spend per configured partner, computed with exactly the labs_2026
--   rule (so the parts sum to labs_spend_2026). Additive column; the app sums
--   it across the filtered clients for the Total LABS Spend breakdown.
-- CHANGE (AIM split): the ONLY edit vs the prior version is adding 'AIM-PROG' to
--   the two booked prog-labs IN-lists (prog_labs_2026 / prog_labs_2025) so AIM's
--   PROGRAMMATIC booked spend counts in prog-labs. AIM-Social/AIM-SEM are NOT
--   programmatic and are intentionally NOT added here.
--   The labs_partner_annual CTE is UNCHANGED: it reads forecast_aim / booked_aim
--   from labs_pacing_wide, which now rolls up all AIM variants (AIM/AIM-Prog/
--   AIM-Social/AIM-SEM) into that single column -- so labs_target_aim_2026, the
--   grand total labs_target_rfq2_2026, and every share pick up the AIM $ with no
--   further change. Rebuild AFTER the two labs_pacing views are replaced.
CREATE OR REPLACE TABLE `plusco-media-invest-solutions.PCC_Media_Investment.KPI_BY_CLIENT_2025_vs_2026` AS
WITH cur AS (
  SELECT
    client_id,
    ANY_VALUE(client)        AS client_name,
    ANY_VALUE(agency)        AS agency,
    ANY_VALUE(region)        AS bu_region,
    ANY_VALUE(business_lead) AS business_lead,
    ANY_VALUE(gm_pod)        AS gm_pod,
    ANY_VALUE(currency)      AS currency,
    LOGICAL_OR(is_hidden)    AS is_hidden
  FROM `pluscoops.forecaster_1.clients`
  GROUP BY client_id
),
labs_families AS (
  -- Configured Labs partners (Forecaster Admin -> LABS), as MIR partner names.
  SELECT DISTINCT UPPER(SPLIT(lab_partner, '-')[OFFSET(0)]) AS family
  FROM `pluscoops.forecaster_1.labs_partners`
  WHERE year = 2026
),
client_spend AS (
  SELECT
    PLUSCO_CLIENT_ID,
    MAX(PLUSCO_CLIENT_NAME)   AS PLUSCO_CLIENT_NAME,
    MAX(INITCAP(AGENCY))      AS AGENCY,
    MAX(BU_REGION)            AS BU_REGION,
    MAX(BUSINESS_LEAD)        AS BUSINESS_LEAD,
    SUM(CASE WHEN PLUSCO_YEAR = '2026' THEN NET_ORDERED_CAD ELSE 0 END) AS total_2026,
    SUM(CASE WHEN PLUSCO_YEAR = '2025' THEN NET_ORDERED_CAD ELSE 0 END) AS total_2025,
    SUM(CASE
      WHEN UPPER(PLUSCO_DEALS_Type) IN ('LABS', 'LABS - BRP')
        AND PLUSCO_YEAR = '2026'
        AND UPPER(PLUSCO_MEDIA_CHANNEL) != 'N/A'
        AND UPPER(PLUSCO_MEDIA_PARTNER) != 'MAGNITE'
        AND UPPER(PLUSCO_MEDIA_PARTNER) IN (SELECT family FROM labs_families)
      THEN NET_ORDERED_CAD ELSE 0
    END) AS labs_2026,
    SUM(CASE
      WHEN UPPER(PLUSCO_DEALS_Type) IN ('LABS', 'LABS - BRP')
        AND PLUSCO_YEAR = '2025'
        AND UPPER(PLUSCO_MEDIA_CHANNEL) != 'N/A'
        AND UPPER(PLUSCO_MEDIA_PARTNER) != 'MAGNITE'
        AND UPPER(PLUSCO_MEDIA_PARTNER) IN (SELECT family FROM labs_families)
      THEN NET_ORDERED_CAD ELSE 0
    END) AS labs_2025,
    SUM(CASE
      WHEN PLUSCO_YEAR = '2026'
        AND (
          UPPER(PLUSCO_MEDIA_CHANNEL) IN ('DIGITAL DIRECT', 'PROGRAMMATIC', 'SEM')
          OR UPPER(PLUSCO_MEDIA_CHANNEL) = 'SOCIAL'
          OR (UPPER(PLUSCO_MEDIA_PARTNER) = 'MIQ' AND UPPER(BUYTYPE) = 'SOCIAL')
        )
      THEN NET_ORDERED_CAD ELSE 0
    END) AS digital_2026,
    SUM(CASE
      WHEN PLUSCO_YEAR = '2025'
        AND (
          UPPER(PLUSCO_MEDIA_CHANNEL) IN ('DIGITAL DIRECT', 'PROGRAMMATIC', 'SEM')
          OR UPPER(PLUSCO_MEDIA_CHANNEL) = 'SOCIAL'
          OR (UPPER(PLUSCO_MEDIA_PARTNER) = 'MIQ' AND UPPER(BUYTYPE) = 'SOCIAL')
        )
      THEN NET_ORDERED_CAD ELSE 0
    END) AS digital_2025,
    SUM(CASE WHEN UPPER(PLUSCO_MEDIA_CHANNEL) = 'DIGITAL DIRECT' AND PLUSCO_YEAR = '2026' THEN NET_ORDERED_CAD ELSE 0 END) AS dd_2026,
    SUM(CASE WHEN UPPER(PLUSCO_MEDIA_CHANNEL) = 'DIGITAL DIRECT' AND PLUSCO_YEAR = '2025' THEN NET_ORDERED_CAD ELSE 0 END) AS dd_2025,
    SUM(CASE WHEN UPPER(PLUSCO_MEDIA_CHANNEL) = 'DIGITAL DIRECT' AND COALESCE(PLUSCO_2026_DEALS, '#N/A') != '#N/A' AND PLUSCO_YEAR = '2026' THEN NET_ORDERED_CAD ELSE 0 END) AS dd_deal_2026,
    SUM(CASE WHEN UPPER(PLUSCO_MEDIA_CHANNEL) = 'DIGITAL DIRECT' AND COALESCE(PLUSCO_2026_DEALS, '#N/A')  = '#N/A' AND PLUSCO_YEAR = '2026' THEN NET_ORDERED_CAD ELSE 0 END) AS dd_nondeal_2026,
    SUM(CASE WHEN UPPER(PLUSCO_MEDIA_CHANNEL) = 'PROGRAMMATIC' AND PLUSCO_YEAR = '2026' THEN NET_ORDERED_CAD ELSE 0 END) AS prog_2026,
    SUM(CASE WHEN UPPER(PLUSCO_MEDIA_CHANNEL) = 'PROGRAMMATIC' AND PLUSCO_YEAR = '2025' THEN NET_ORDERED_CAD ELSE 0 END) AS prog_2025,
    SUM(CASE
      WHEN UPPER(PLUSCO_MEDIA_CHANNEL) = 'PROGRAMMATIC'
        AND PLUSCO_YEAR = '2026'
        AND (
          UPPER(PLUSCO_MEDIA_PARTNER) IN ('YAHOO', 'AMAZON', 'QUANTCAST', 'AIM', 'AIM-PROG', 'STACKADAPT')
          OR (UPPER(PLUSCO_MEDIA_PARTNER) = 'MIQ' AND UPPER(BUYTYPE) IN ('DISPLAY', 'VIDEO', 'DISPLAY&VIDEO'))
        )
      THEN NET_ORDERED_CAD ELSE 0
    END) AS prog_labs_2026,
    SUM(CASE
      WHEN UPPER(PLUSCO_MEDIA_CHANNEL) = 'PROGRAMMATIC'
        AND PLUSCO_YEAR = '2025'
        AND (
          UPPER(PLUSCO_MEDIA_PARTNER) IN ('YAHOO', 'AMAZON', 'QUANTCAST', 'AIM', 'AIM-PROG', 'STACKADAPT')
          OR (UPPER(PLUSCO_MEDIA_PARTNER) = 'MIQ' AND UPPER(BUYTYPE) IN ('DISPLAY', 'VIDEO', 'DISPLAY&VIDEO'))
        )
      THEN NET_ORDERED_CAD ELSE 0
    END) AS prog_labs_2025,
    SUM(CASE WHEN UPPER(PLUSCO_MEDIA_CHANNEL) = 'PROGRAMMATIC' AND COALESCE(PLUSCO_2026_DEALS, '#N/A') != '#N/A' AND PLUSCO_YEAR = '2026' THEN NET_ORDERED_CAD ELSE 0 END) AS prog_deal_2026,
    SUM(CASE WHEN UPPER(PLUSCO_MEDIA_CHANNEL) = 'PROGRAMMATIC' AND COALESCE(PLUSCO_2026_DEALS, '#N/A')  = '#N/A' AND PLUSCO_YEAR = '2026' THEN NET_ORDERED_CAD ELSE 0 END) AS prog_nondeal_2026,
    SUM(CASE
      WHEN PLUSCO_YEAR = '2026'
        AND (UPPER(PLUSCO_MEDIA_CHANNEL) = 'SOCIAL' OR (UPPER(PLUSCO_MEDIA_PARTNER) = 'MIQ' AND UPPER(BUYTYPE) = 'SOCIAL'))
      THEN NET_ORDERED_CAD ELSE 0
    END) AS social_2026,
    SUM(CASE
      WHEN PLUSCO_YEAR = '2025'
        AND (UPPER(PLUSCO_MEDIA_CHANNEL) = 'SOCIAL' OR (UPPER(PLUSCO_MEDIA_PARTNER) = 'MIQ' AND UPPER(BUYTYPE) = 'SOCIAL'))
      THEN NET_ORDERED_CAD ELSE 0
    END) AS social_2025,
    SUM(CASE WHEN UPPER(PLUSCO_MEDIA_PARTNER) = 'META' AND UPPER(PLUSCO_MEDIA_CHANNEL) = 'SOCIAL' AND PLUSCO_YEAR = '2026' THEN NET_ORDERED_CAD ELSE 0 END) AS meta_2026,
    SUM(CASE WHEN UPPER(PLUSCO_MEDIA_PARTNER) = 'META' AND UPPER(PLUSCO_MEDIA_CHANNEL) = 'SOCIAL' AND PLUSCO_YEAR = '2025' THEN NET_ORDERED_CAD ELSE 0 END) AS meta_2025,
    SUM(CASE
      WHEN UPPER(PLUSCO_MEDIA_PARTNER) = 'MIQ'
        AND UPPER(BUYTYPE) = 'SOCIAL'
        AND PLUSCO_YEAR = '2026'
      THEN NET_ORDERED_CAD ELSE 0
    END) AS miq_social_mir_2026,
    SUM(CASE
      WHEN UPPER(PLUSCO_MEDIA_CHANNEL) = 'OOH'
        AND PLUSCO_YEAR = '2026'
      THEN NET_ORDERED_CAD ELSE 0
    END) AS ooh_2026,
    SUM(CASE
      WHEN UPPER(PLUSCO_MEDIA_CHANNEL) = 'OOH'
        AND UPPER(PLUSCO_MEDIA_PARTNER) = 'BILLUPS'
        AND PLUSCO_YEAR = '2026'
      THEN NET_ORDERED_CAD ELSE 0
    END) AS billups_ooh_2026,
    SUM(CASE
      WHEN UPPER(PLUSCO_MEDIA_CHANNEL) = 'PRINT'
        AND PLUSCO_YEAR = '2026'
      THEN NET_ORDERED_CAD ELSE 0
    END) AS print_2026,
    SUM(CASE
      WHEN UPPER(PLUSCO_MEDIA_CHANNEL) = 'PRINT'
        AND UPPER(PLUSCO_MEDIA_PARTNER) = 'BILLUPS'
        AND PLUSCO_YEAR = '2026'
      THEN NET_ORDERED_CAD ELSE 0
    END) AS billups_print_2026,
    MAX(GM_POD)                                        AS GM_POD
  FROM `plusco-media-invest-solutions.PCC_Media_Investment.PCC_Dashboard_NATIVE`
  WHERE UPPER(PLUSCO_MEDIA_CHANNEL) != 'N/A'
  GROUP BY PLUSCO_CLIENT_ID
),
labs_by_partner AS (
  -- Per-client 2026 Labs spend by configured partner — same filters as labs_2026.
  SELECT
    PLUSCO_CLIENT_ID,
    TO_JSON_STRING(ARRAY_AGG(STRUCT(partner AS p, ROUND(amount, 2) AS v) ORDER BY amount DESC)) AS labs_by_partner_2026
  FROM (
    SELECT PLUSCO_CLIENT_ID, UPPER(PLUSCO_MEDIA_PARTNER) AS partner, SUM(NET_ORDERED_CAD) AS amount
    FROM `plusco-media-invest-solutions.PCC_Media_Investment.PCC_Dashboard_NATIVE`
    WHERE PLUSCO_YEAR = '2026'
      AND UPPER(PLUSCO_MEDIA_CHANNEL) != 'N/A'
      AND UPPER(PLUSCO_DEALS_Type) IN ('LABS', 'LABS - BRP')
      AND UPPER(PLUSCO_MEDIA_PARTNER) != 'MAGNITE'
      AND UPPER(PLUSCO_MEDIA_PARTNER) IN (SELECT family FROM labs_families)
    GROUP BY 1, 2
  )
  GROUP BY 1
),
-- ── Monthly breakdown (monthly_kpis) ────────────────────────────────────────
monthly_spend AS (
  -- Same rules as client_spend, per year × month (no year test in the CASEs).
  SELECT
    PLUSCO_CLIENT_ID,
    SAFE_CAST(PLUSCO_YEAR AS INT64)                         AS y,
    SAFE_CAST(SPLIT(MONTH, '-')[SAFE_OFFSET(1)] AS INT64)   AS m,
    SUM(NET_ORDERED_CAD)                                    AS total,
    SUM(CASE
      WHEN UPPER(PLUSCO_DEALS_Type) IN ('LABS', 'LABS - BRP')
        AND UPPER(PLUSCO_MEDIA_PARTNER) != 'MAGNITE'
        AND UPPER(PLUSCO_MEDIA_PARTNER) IN (SELECT family FROM labs_families)
      THEN NET_ORDERED_CAD ELSE 0 END)                      AS labs,
    SUM(CASE
      WHEN UPPER(PLUSCO_MEDIA_CHANNEL) IN ('DIGITAL DIRECT', 'PROGRAMMATIC', 'SEM')
        OR UPPER(PLUSCO_MEDIA_CHANNEL) = 'SOCIAL'
        OR (UPPER(PLUSCO_MEDIA_PARTNER) = 'MIQ' AND UPPER(BUYTYPE) = 'SOCIAL')
      THEN NET_ORDERED_CAD ELSE 0 END)                      AS digital,
    SUM(CASE WHEN UPPER(PLUSCO_MEDIA_CHANNEL) = 'DIGITAL DIRECT' THEN NET_ORDERED_CAD ELSE 0 END) AS dd,
    SUM(CASE WHEN UPPER(PLUSCO_MEDIA_CHANNEL) = 'DIGITAL DIRECT' AND COALESCE(PLUSCO_2026_DEALS, '#N/A') != '#N/A' THEN NET_ORDERED_CAD ELSE 0 END) AS dd_deal,
    SUM(CASE WHEN UPPER(PLUSCO_MEDIA_CHANNEL) = 'DIGITAL DIRECT' AND COALESCE(PLUSCO_2026_DEALS, '#N/A')  = '#N/A' THEN NET_ORDERED_CAD ELSE 0 END) AS dd_nondeal,
    SUM(CASE WHEN UPPER(PLUSCO_MEDIA_CHANNEL) = 'PROGRAMMATIC' THEN NET_ORDERED_CAD ELSE 0 END) AS prog,
    SUM(CASE
      WHEN UPPER(PLUSCO_MEDIA_CHANNEL) = 'PROGRAMMATIC'
        AND (
          UPPER(PLUSCO_MEDIA_PARTNER) IN ('YAHOO', 'AMAZON', 'QUANTCAST', 'AIM', 'AIM-PROG', 'STACKADAPT')
          OR (UPPER(PLUSCO_MEDIA_PARTNER) = 'MIQ' AND UPPER(BUYTYPE) IN ('DISPLAY', 'VIDEO', 'DISPLAY&VIDEO'))
        )
      THEN NET_ORDERED_CAD ELSE 0 END)                      AS prog_labs,
    SUM(CASE WHEN UPPER(PLUSCO_MEDIA_CHANNEL) = 'PROGRAMMATIC' AND COALESCE(PLUSCO_2026_DEALS, '#N/A') != '#N/A' THEN NET_ORDERED_CAD ELSE 0 END) AS prog_deal,
    SUM(CASE WHEN UPPER(PLUSCO_MEDIA_CHANNEL) = 'PROGRAMMATIC' AND COALESCE(PLUSCO_2026_DEALS, '#N/A')  = '#N/A' THEN NET_ORDERED_CAD ELSE 0 END) AS prog_nondeal,
    SUM(CASE
      WHEN UPPER(PLUSCO_MEDIA_CHANNEL) = 'SOCIAL' OR (UPPER(PLUSCO_MEDIA_PARTNER) = 'MIQ' AND UPPER(BUYTYPE) = 'SOCIAL')
      THEN NET_ORDERED_CAD ELSE 0 END)                      AS social,
    SUM(CASE WHEN UPPER(PLUSCO_MEDIA_PARTNER) = 'META' AND UPPER(PLUSCO_MEDIA_CHANNEL) = 'SOCIAL' THEN NET_ORDERED_CAD ELSE 0 END) AS meta,
    SUM(CASE WHEN UPPER(PLUSCO_MEDIA_PARTNER) = 'MIQ' AND UPPER(BUYTYPE) = 'SOCIAL' THEN NET_ORDERED_CAD ELSE 0 END) AS miq_social,
    SUM(CASE WHEN UPPER(PLUSCO_MEDIA_CHANNEL) = 'OOH' THEN NET_ORDERED_CAD ELSE 0 END) AS ooh,
    SUM(CASE WHEN UPPER(PLUSCO_MEDIA_CHANNEL) = 'OOH' AND UPPER(PLUSCO_MEDIA_PARTNER) = 'BILLUPS' THEN NET_ORDERED_CAD ELSE 0 END) AS billups_ooh,
    SUM(CASE WHEN UPPER(PLUSCO_MEDIA_CHANNEL) = 'PRINT' THEN NET_ORDERED_CAD ELSE 0 END) AS print,
    SUM(CASE WHEN UPPER(PLUSCO_MEDIA_CHANNEL) = 'PRINT' AND UPPER(PLUSCO_MEDIA_PARTNER) = 'BILLUPS' THEN NET_ORDERED_CAD ELSE 0 END) AS billups_print
  FROM `plusco-media-invest-solutions.PCC_Media_Investment.PCC_Dashboard_NATIVE`
  WHERE UPPER(PLUSCO_MEDIA_CHANNEL) != 'N/A'
    AND PLUSCO_YEAR IN ('2025', '2026')
  GROUP BY 1, 2, 3
),
monthly_labs_by_partner AS (
  -- Same filters as labs_by_partner, per year × month.
  SELECT
    PLUSCO_CLIENT_ID, y, m,
    ARRAY_AGG(STRUCT(partner AS p, ROUND(amount, 2) AS v) ORDER BY amount DESC) AS lp
  FROM (
    SELECT
      PLUSCO_CLIENT_ID,
      SAFE_CAST(PLUSCO_YEAR AS INT64)                       AS y,
      SAFE_CAST(SPLIT(MONTH, '-')[SAFE_OFFSET(1)] AS INT64) AS m,
      UPPER(PLUSCO_MEDIA_PARTNER)                           AS partner,
      SUM(NET_ORDERED_CAD)                                  AS amount
    FROM `plusco-media-invest-solutions.PCC_Media_Investment.PCC_Dashboard_NATIVE`
    WHERE PLUSCO_YEAR IN ('2025', '2026')
      AND UPPER(PLUSCO_MEDIA_CHANNEL) != 'N/A'
      AND UPPER(PLUSCO_DEALS_Type) IN ('LABS', 'LABS - BRP')
      AND UPPER(PLUSCO_MEDIA_PARTNER) != 'MAGNITE'
      AND UPPER(PLUSCO_MEDIA_PARTNER) IN (SELECT family FROM labs_families)
    GROUP BY 1, 2, 3, 4
  )
  GROUP BY 1, 2, 3
),
monthly_labs_pacing AS (
  -- Same sums as labs_partner_annual, per month (labs_pacing_wide is 2026).
  SELECT
    client_id,
    2026 AS y,
    month_num AS m,
    STRUCT(
      SUM(COALESCE(forecast_billups_ooh,0) + COALESCE(forecast_billups_print,0)) AS billups,
      SUM(COALESCE(forecast_miq_prog,0)    + COALESCE(forecast_miq_social,0))    AS miq,
      SUM(COALESCE(forecast_amazon,0))     AS amazon,
      SUM(COALESCE(forecast_yahoo,0))      AS yahoo,
      SUM(COALESCE(forecast_quantcast,0))  AS quantcast,
      SUM(COALESCE(forecast_reddit,0))     AS reddit,
      SUM(COALESCE(forecast_aim,0))        AS aim,
      SUM(COALESCE(forecast_stackadapt,0)) AS stackadapt
    ) AS lt,
    STRUCT(
      SUM(COALESCE(booked_billups_ooh,0) + COALESCE(booked_billups_print,0)) AS billups,
      SUM(COALESCE(booked_miq_prog,0)    + COALESCE(booked_miq_social,0))    AS miq,
      SUM(COALESCE(booked_amazon,0))     AS amazon,
      SUM(COALESCE(booked_yahoo,0))      AS yahoo,
      SUM(COALESCE(booked_quantcast,0))  AS quantcast,
      SUM(COALESCE(booked_reddit,0))     AS reddit,
      SUM(COALESCE(booked_aim,0))        AS aim,
      SUM(COALESCE(booked_stackadapt,0)) AS stackadapt
    ) AS lb
  FROM `plusco-media-invest-solutions.PCC_Media_Investment.labs_pacing_wide`
  WHERE month_num IS NOT NULL
  GROUP BY 1, 2, 3
),
monthly_kpis AS (
  SELECT
    COALESCE(s.PLUSCO_CLIENT_ID, p.client_id) AS client_id,
    TO_JSON_STRING(ARRAY_AGG(STRUCT(
      COALESCE(s.y, p.y) AS y,
      COALESCE(s.m, p.m) AS m,
      ROUND(COALESCE(s.total, 0), 2)         AS total,
      ROUND(COALESCE(s.labs, 0), 2)          AS labs,
      ROUND(COALESCE(s.digital, 0), 2)       AS digital,
      ROUND(COALESCE(s.dd, 0), 2)            AS dd,
      ROUND(COALESCE(s.dd_deal, 0), 2)       AS dd_deal,
      ROUND(COALESCE(s.dd_nondeal, 0), 2)    AS dd_nondeal,
      ROUND(COALESCE(s.prog, 0), 2)          AS prog,
      ROUND(COALESCE(s.prog_labs, 0), 2)     AS prog_labs,
      ROUND(COALESCE(s.prog_deal, 0), 2)     AS prog_deal,
      ROUND(COALESCE(s.prog_nondeal, 0), 2)  AS prog_nondeal,
      ROUND(COALESCE(s.social, 0), 2)        AS social,
      ROUND(COALESCE(s.meta, 0), 2)          AS meta,
      ROUND(COALESCE(s.miq_social, 0), 2)    AS miq_social,
      ROUND(COALESCE(s.ooh, 0), 2)           AS ooh,
      ROUND(COALESCE(s.billups_ooh, 0), 2)   AS billups_ooh,
      ROUND(COALESCE(s.print, 0), 2)         AS print,
      ROUND(COALESCE(s.billups_print, 0), 2) AS billups_print,
      lbp.lp AS lp,
      p.lt   AS lt,
      p.lb   AS lb
    ) ORDER BY COALESCE(s.y, p.y), COALESCE(s.m, p.m))) AS monthly_kpis
  FROM monthly_spend s
  FULL OUTER JOIN monthly_labs_pacing p
    ON s.PLUSCO_CLIENT_ID = p.client_id AND s.y = p.y AND s.m = p.m
  LEFT JOIN monthly_labs_by_partner lbp
    ON lbp.PLUSCO_CLIENT_ID = COALESCE(s.PLUSCO_CLIENT_ID, p.client_id)
    AND lbp.y = COALESCE(s.y, p.y) AND lbp.m = COALESCE(s.m, p.m)
  WHERE COALESCE(s.m, p.m) BETWEEN 1 AND 12
  GROUP BY 1
),
billups_eligibility AS (
  SELECT
    PLUSCO_CLIENT_ID,
    MAX(Eligible_Billups_OOH)   AS eligible_billups_ooh,
    MAX(Eligible_Billups_PRINT) AS eligible_billups_print,
    MAX(Scenario)               AS scenario_meta_mapping
  FROM `plusco-media-invest-solutions.PCC_Media_Investment.Native_Forecast_Clients`
  GROUP BY 1
),
forecast_metrics AS (
  SELECT
    f.client_id AS FO_Client,
    ANY_VALUE(cur.client_name)   AS CL_Name,
    ANY_VALUE(cur.agency)        AS CL_Agency,
    ANY_VALUE(cur.bu_region)     AS CL_Business_Unit_Region,
    ANY_VALUE(cur.business_lead) AS CL_Business_Lead,
    ANY_VALUE(cur.gm_pod)        AS GM_Pod,
    SUM(f.amount * CASE WHEN UPPER(TRIM(cur.currency)) = 'USD' THEN 1.3978 ELSE 1 END) AS social_forecast_rfq1
  FROM `pluscoops.forecaster_1.forecast` AS f
  LEFT JOIN cur ON cur.client_id = f.client_id
  WHERE f.year = 2026
    AND f.revision = 'RFQ3'
    AND f.axis = 'media'
    AND UPPER(f.category) = 'SOCIAL'
    AND f.client_id <> 'CL_1_TEST_CLIENT_1782846811711'
    AND COALESCE(cur.is_hidden, FALSE) = FALSE
  GROUP BY f.client_id
),
miq_social_forecast AS (
  SELECT
    f.client_id AS FO_Client,
    SUM(f.amount * CASE WHEN UPPER(TRIM(cur.currency)) = 'USD' THEN 1.3978 ELSE 1 END) AS miq_social_mbf_forecast
  FROM `pluscoops.forecaster_1.forecast` AS f
  LEFT JOIN cur ON cur.client_id = f.client_id
  WHERE f.year = 2026
    AND f.revision = 'RFQ3'
    AND f.axis = 'labs'
    AND UPPER(f.category) = 'MIQ-SOCIAL'
    AND f.client_id <> 'CL_1_TEST_CLIENT_1782846811711'
    AND COALESCE(cur.is_hidden, FALSE) = FALSE
  GROUP BY f.client_id
),
labs_partner_annual AS (
  SELECT
    client_id,
    SUM(COALESCE(forecast_billups_ooh,0) + COALESCE(forecast_billups_print,0)) AS labs_target_billups_2026,
    SUM(COALESCE(booked_billups_ooh,0)   + COALESCE(booked_billups_print,0))   AS labs_booked_billups_2026,
    SUM(COALESCE(forecast_miq_prog,0)    + COALESCE(forecast_miq_social,0))    AS labs_target_miq_2026,
    SUM(COALESCE(booked_miq_prog,0)      + COALESCE(booked_miq_social,0))      AS labs_booked_miq_2026,
    SUM(COALESCE(forecast_amazon,0))     AS labs_target_amazon_2026,
    SUM(COALESCE(booked_amazon,0))       AS labs_booked_amazon_2026,
    SUM(COALESCE(forecast_yahoo,0))      AS labs_target_yahoo_2026,
    SUM(COALESCE(booked_yahoo,0))        AS labs_booked_yahoo_2026,
    SUM(COALESCE(forecast_quantcast,0))  AS labs_target_quantcast_2026,
    SUM(COALESCE(booked_quantcast,0))    AS labs_booked_quantcast_2026,
    SUM(COALESCE(forecast_reddit,0))     AS labs_target_reddit_2026,
    SUM(COALESCE(booked_reddit,0))       AS labs_booked_reddit_2026,
    SUM(COALESCE(forecast_aim,0))        AS labs_target_aim_2026,
    SUM(COALESCE(booked_aim,0))          AS labs_booked_aim_2026,
    SUM(COALESCE(forecast_stackadapt,0)) AS labs_target_stackadapt_2026,
    SUM(COALESCE(booked_stackadapt,0))   AS labs_booked_stackadapt_2026,
    SUM(
      COALESCE(forecast_billups_ooh,0) + COALESCE(forecast_billups_print,0)
      + COALESCE(forecast_miq_prog,0)  + COALESCE(forecast_miq_social,0)
      + COALESCE(forecast_amazon,0)    + COALESCE(forecast_yahoo,0)
      + COALESCE(forecast_quantcast,0) + COALESCE(forecast_reddit,0)
      + COALESCE(forecast_aim,0)       + COALESCE(forecast_stackadapt,0)
    ) AS labs_target_rfq2_2026,
    SUM(
      COALESCE(booked_billups_ooh,0) + COALESCE(booked_billups_print,0)
      + COALESCE(booked_miq_prog,0)  + COALESCE(booked_miq_social,0)
      + COALESCE(booked_amazon,0)    + COALESCE(booked_yahoo,0)
      + COALESCE(booked_quantcast,0) + COALESCE(booked_reddit,0)
      + COALESCE(booked_aim,0)       + COALESCE(booked_stackadapt,0)
    ) AS labs_booked_mir_2026
  FROM `plusco-media-invest-solutions.PCC_Media_Investment.labs_pacing_wide`
  GROUP BY client_id
),
monthly_share_2025 AS (
  SELECT
    PLUSCO_CLIENT_ID,
    CONCAT('2026-', SUBSTR(MONTH, 6, 2)) AS comparable_month_key,
    SUM(CASE
      WHEN UPPER(PLUSCO_MEDIA_PARTNER) = 'META'
        AND UPPER(PLUSCO_MEDIA_CHANNEL) = 'SOCIAL'
      THEN NET_ORDERED_CAD ELSE 0
    END) AS month_meta_2025,
    SUM(CASE
      WHEN (UPPER(PLUSCO_MEDIA_CHANNEL) = 'SOCIAL'
            OR (UPPER(PLUSCO_MEDIA_PARTNER) = 'MIQ' AND UPPER(BUYTYPE) = 'SOCIAL'))
      THEN NET_ORDERED_CAD ELSE 0
    END) AS month_social_2025
  FROM `plusco-media-invest-solutions.PCC_Media_Investment.PCC_Dashboard_NATIVE`
  WHERE PLUSCO_YEAR = '2025'
    AND (
      UPPER(PLUSCO_MEDIA_CHANNEL) = 'SOCIAL'
      OR (UPPER(PLUSCO_MEDIA_PARTNER) = 'MIQ' AND UPPER(BUYTYPE) = 'SOCIAL')
    )
  GROUP BY 1, 2
),
forecast_monthly AS (
  SELECT
    f.client_id AS FO_Client,
    CONCAT(CAST(f.year AS STRING), '-', FORMAT('%02d', f.month)) AS forecast_month_key,
    SUM(f.amount * CASE WHEN UPPER(TRIM(cur.currency)) = 'USD' THEN 1.3978 ELSE 1 END) AS month_social_forecast
  FROM `pluscoops.forecaster_1.forecast` AS f
  LEFT JOIN cur ON cur.client_id = f.client_id
  WHERE f.year = 2026
    AND f.revision = 'RFQ3'
    AND f.axis = 'media'
    AND UPPER(f.category) = 'SOCIAL'
    AND f.client_id <> 'CL_1_TEST_CLIENT_1782846811711'
    AND COALESCE(cur.is_hidden, FALSE) = FALSE
  GROUP BY f.client_id, f.year, f.month
),
target_v2_annual AS (
  SELECT
    fm.FO_Client AS client_id,
    SUM(
      CASE
        WHEN COALESCE(fm.month_social_forecast, 0) = 0
          THEN 0
        WHEN COALESCE(s.month_social_2025, 0) > 0
          AND COALESCE(s.month_meta_2025, 0) > 0
          THEN fm.month_social_forecast * SAFE_DIVIDE(s.month_meta_2025, s.month_social_2025) * 0.70
        WHEN COALESCE(c.social_2025, 0) > 0
          AND COALESCE(c.meta_2025, 0) > 0
          THEN fm.month_social_forecast * SAFE_DIVIDE(c.meta_2025, c.social_2025) * 0.70
        ELSE fm.month_social_forecast * 0.67 * 0.70
      END
    ) AS target_meta_spend_2026_v2_annual
  FROM forecast_monthly fm
  LEFT JOIN monthly_share_2025 s
    ON fm.FO_Client = s.PLUSCO_CLIENT_ID
    AND fm.forecast_month_key = s.comparable_month_key
  LEFT JOIN client_spend c
    ON fm.FO_Client = c.PLUSCO_CLIENT_ID
  GROUP BY 1
),
target_annual AS (
  SELECT
    fm.FO_Client AS client_id,
    SUM(
      CASE
        WHEN COALESCE(fm.month_social_forecast, 0) = 0
          THEN 0
        WHEN COALESCE(c.social_2025, 0) > 0
          AND COALESCE(c.meta_2025, 0) > 0
          THEN fm.month_social_forecast * SAFE_DIVIDE(c.meta_2025, c.social_2025) * 0.70
        ELSE fm.month_social_forecast * 0.67 * 0.70
      END
    ) AS annual_target_meta_spend_2026
  FROM forecast_monthly fm
  LEFT JOIN client_spend c
    ON fm.FO_Client = c.PLUSCO_CLIENT_ID
  GROUP BY 1
),
target_cte AS (
  SELECT
    COALESCE(c.PLUSCO_CLIENT_ID, f.FO_Client) AS client_id,
    MAX(CASE
      WHEN COALESCE(f.social_forecast_rfq1, 0) = 0
        THEN 0
      WHEN COALESCE(c.social_2025, 0) = 0
        OR COALESCE(c.meta_2025, 0) = 0
        THEN f.social_forecast_rfq1 * 0.67 * 0.70
      ELSE
        f.social_forecast_rfq1 * SAFE_DIVIDE(c.meta_2025, c.social_2025) * 0.70
    END) AS target_meta_spend_2026
  FROM client_spend c
  FULL OUTER JOIN forecast_metrics f ON c.PLUSCO_CLIENT_ID = f.FO_Client
  GROUP BY 1
)
SELECT
  COALESCE(c.AGENCY, INITCAP(f.CL_Agency))             AS AGENCY,
  COALESCE(c.BU_REGION, f.CL_Business_Unit_Region)     AS BU_REGION,
  COALESCE(c.BUSINESS_LEAD, f.CL_Business_Lead)        AS BUSINESS_LEAD,
  COALESCE(c.GM_POD, f.GM_Pod)                         AS GM_POD,
  COALESCE(c.PLUSCO_CLIENT_NAME, f.CL_Name, f.FO_Client) AS CLIENT_NAME,
  COALESCE(c.PLUSCO_CLIENT_ID,   f.FO_Client)          AS PLUSCO_CLIENT_ID,
  be.scenario_meta_mapping,
  SAFE_DIVIDE(c.labs_2026, c.total_2026)               AS labs_share_total_media_2026,
  c.labs_2026                                          AS labs_spend_2026,
  lbp.labs_by_partner_2026                             AS labs_by_partner_2026,
  c.total_2026                                         AS total_spend_2026,
  lp.labs_target_rfq2_2026,
  lp.labs_booked_mir_2026,
  SAFE_DIVIDE(lp.labs_booked_mir_2026, lp.labs_target_rfq2_2026) AS labs_pct_target_2026,
  lp.labs_target_billups_2026,    lp.labs_booked_billups_2026,
  lp.labs_target_miq_2026,        lp.labs_booked_miq_2026,
  lp.labs_target_amazon_2026,     lp.labs_booked_amazon_2026,
  lp.labs_target_yahoo_2026,      lp.labs_booked_yahoo_2026,
  lp.labs_target_quantcast_2026,  lp.labs_booked_quantcast_2026,
  lp.labs_target_reddit_2026,     lp.labs_booked_reddit_2026,
  lp.labs_target_aim_2026,        lp.labs_booked_aim_2026,
  lp.labs_target_stackadapt_2026, lp.labs_booked_stackadapt_2026,
  SAFE_DIVIDE(c.prog_labs_2026, c.prog_2026)           AS prog_labs_share_of_prog_2026,
  c.prog_labs_2026                                     AS prog_labs_spend_2026,
  c.meta_2026                                          AS meta_spend_2026,
  c.meta_2025                                          AS meta_spend_2025,
  SAFE_DIVIDE(c.meta_2026, c.social_2026)              AS meta_share_of_social_2026,
  SAFE_DIVIDE(c.meta_2025, c.social_2025)              AS meta_share_of_social_2025,
  SAFE_DIVIDE(c.meta_2026, c.social_2026)
  - SAFE_DIVIDE(c.meta_2025, c.social_2025)            AS meta_share_variance_yoy,
  CASE
    WHEN UPPER(COALESCE(c.PLUSCO_CLIENT_NAME, f.CL_Name, f.FO_Client)) = 'BRP'
      THEN NULL
    WHEN COALESCE(c.meta_2025, 0) = 0
      AND COALESCE(c.meta_2026, 0) = 0
      THEN 'Divested Meta Share'
    WHEN COALESCE(c.meta_2025, 0) > 0
      AND COALESCE(c.meta_2026, 0) = 0
      THEN 'Divested Meta Share'
    WHEN COALESCE(c.meta_2025, 0) = 0
      AND COALESCE(c.meta_2026, 0) > 0
      THEN 'Increasing Meta Share'
    WHEN SAFE_DIVIDE(c.meta_2026, c.social_2026)
       - SAFE_DIVIDE(c.meta_2025, c.social_2025) <= -0.01
      THEN 'Divested Meta Share'
    WHEN SAFE_DIVIDE(c.meta_2026, c.social_2026)
       - SAFE_DIVIDE(c.meta_2025, c.social_2025) >= 0.01
      THEN 'Increasing Meta Share'
    ELSE 'Flat Meta Share'
  END                                                  AS meta_share_trend,
  CASE
    WHEN c.meta_2025 = 0 OR c.meta_2025 IS NULL           THEN 'No Data'
    WHEN SAFE_DIVIDE(c.meta_2026 - c.meta_2025, c.meta_2025) <= -0.30 THEN 'YOY Divestment of min. 30%'
    WHEN SAFE_DIVIDE(c.meta_2026 - c.meta_2025, c.meta_2025) > -0.30  THEN 'Divestment Shortfall'
    ELSE 'No Data'
  END                                                  AS flag_meta_share_yoy,
  t.target_meta_spend_2026,
  SAFE_DIVIDE(t.target_meta_spend_2026, f.social_forecast_rfq1) AS target_meta_share_2026,
  tv2.target_meta_spend_2026_v2_annual                          AS target_meta_spend_2026_v2,
  SAFE_DIVIDE(tv2.target_meta_spend_2026_v2_annual, f.social_forecast_rfq1) AS target_meta_share_2026_v2,
  ta.annual_target_meta_spend_2026,
  SAFE_DIVIDE(ta.annual_target_meta_spend_2026, f.social_forecast_rfq1) AS annual_target_meta_share_2026,
  SAFE_DIVIDE(c.meta_2026, t.target_meta_spend_2026)                AS spend_pacing,
  SAFE_DIVIDE(c.meta_2026, tv2.target_meta_spend_2026_v2_annual)    AS spend_pacing_v2,
  SAFE_DIVIDE(c.meta_2026, ta.annual_target_meta_spend_2026)        AS annual_spend_pacing,
  SAFE_DIVIDE(c.meta_2026, c.social_2026)
    - SAFE_DIVIDE(t.target_meta_spend_2026, f.social_forecast_rfq1)              AS meta_share_vs_target,
  SAFE_DIVIDE(c.meta_2026, c.social_2026)
    - SAFE_DIVIDE(tv2.target_meta_spend_2026_v2_annual, f.social_forecast_rfq1)  AS meta_share_vs_target_v2,
  SAFE_DIVIDE(c.meta_2026, c.social_2026)
    - SAFE_DIVIDE(ta.annual_target_meta_spend_2026, f.social_forecast_rfq1)      AS annual_meta_share_vs_target,
  SAFE_DIVIDE(EXTRACT(MONTH FROM CURRENT_DATE()), 12)               AS pct_year_complete,
  SAFE_DIVIDE(
    SAFE_DIVIDE(c.meta_2026, t.target_meta_spend_2026),
    SAFE_DIVIDE(EXTRACT(MONTH FROM CURRENT_DATE()), 12)
  ) * 100                                                           AS pacing_index,
  SAFE_DIVIDE(
    SAFE_DIVIDE(c.meta_2026, tv2.target_meta_spend_2026_v2_annual),
    SAFE_DIVIDE(EXTRACT(MONTH FROM CURRENT_DATE()), 12)
  ) * 100                                                           AS pacing_index_v2,
  SAFE_DIVIDE(
    SAFE_DIVIDE(c.meta_2026, ta.annual_target_meta_spend_2026),
    SAFE_DIVIDE(EXTRACT(MONTH FROM CURRENT_DATE()), 12)
  ) * 100                                                           AS annual_pacing_index,
  CASE
    WHEN COALESCE(c.social_2026, 0) = 0                             THEN 'No Data'
    WHEN COALESCE(c.social_2025, 0) = 0
      OR COALESCE(c.meta_2025, 0) = 0                               THEN 'No Historical Data'
    WHEN SAFE_DIVIDE(c.meta_2026, c.social_2026)
       - SAFE_DIVIDE(t.target_meta_spend_2026, f.social_forecast_rfq1) <= 0
      THEN 'Divestment Target Achieved'
    ELSE 'Divestment Target Unmet'
  END                                                               AS flag_meta_share_vs_target,
  CASE
    WHEN COALESCE(c.social_2026, 0) = 0                             THEN 'No Data'
    WHEN COALESCE(c.social_2025, 0) = 0
      OR COALESCE(c.meta_2025, 0) = 0                               THEN 'No Historical Data'
    WHEN SAFE_DIVIDE(c.meta_2026, c.social_2026)
       - SAFE_DIVIDE(tv2.target_meta_spend_2026_v2_annual, f.social_forecast_rfq1) <= 0
      THEN 'Divestment Target Achieved'
    ELSE 'Divestment Target Unmet'
  END                                                               AS flag_meta_share_vs_target_v2,
  CASE
    WHEN COALESCE(c.social_2026, 0) = 0                             THEN 'No Data'
    WHEN COALESCE(c.social_2025, 0) = 0
      OR COALESCE(c.meta_2025, 0) = 0                               THEN 'No Historical Data'
    WHEN SAFE_DIVIDE(c.meta_2026, c.social_2026)
       - SAFE_DIVIDE(ta.annual_target_meta_spend_2026, f.social_forecast_rfq1) <= 0
      THEN 'Divestment Target Achieved'
    ELSE 'Divestment Target Unmet'
  END                                                               AS annual_flag_meta_share_vs_target,
  c.social_2026                                           AS social_spend_2026,
  c.social_2025                                           AS social_spend_2025,
  f.social_forecast_rfq1                                  AS social_forecast_rfq1,
  c.social_2026 - c.meta_2026                             AS other_platforms_spend_2026,
  c.social_2025 - c.meta_2025                             AS other_platforms_spend_2025,
  SAFE_DIVIDE(c.social_2026 - c.meta_2026, c.social_2026) AS other_platforms_share_social_2026,
  SAFE_DIVIDE(c.social_2026 - c.meta_2026, c.social_2026)
  - SAFE_DIVIDE(c.social_2025 - c.meta_2025, c.social_2025) AS other_platforms_share_variance,
  c.digital_2026                                           AS digital_spend_2026,
  c.digital_2025                                           AS digital_spend_2025,
  c.dd_2026                                                AS digital_direct_spend_2026,
  c.dd_2025                                                AS digital_direct_spend_2025,
  SAFE_DIVIDE(c.dd_2026, c.digital_2026)                  AS dd_share_of_digital_2026,
  SAFE_DIVIDE(c.dd_2026, c.digital_2026)
  - SAFE_DIVIDE(c.dd_2025, c.digital_2025)                AS dd_share_variance_vs_2025_ppt,
  c.dd_deal_2026                                           AS dd_deal_spend_2026,
  c.dd_nondeal_2026                                        AS dd_nondeal_spend_2026,
  SAFE_DIVIDE(c.dd_deal_2026, c.dd_2026)                  AS dd_pct_deal_partners,
  SAFE_DIVIDE(c.dd_nondeal_2026, c.dd_2026)               AS dd_pct_nondeal_partners,
  c.prog_2026                                              AS prog_spend_2026,
  c.prog_2025                                              AS prog_spend_2025,
  SAFE_DIVIDE(c.prog_2026, c.digital_2026)                AS prog_share_of_digital_2026,
  SAFE_DIVIDE(c.prog_2026, c.digital_2026)
  - SAFE_DIVIDE(c.prog_2025, c.digital_2025)              AS prog_share_variance_vs_2025_ppt,
  c.prog_deal_2026                                         AS prog_deal_spend_2026,
  c.prog_nondeal_2026                                      AS prog_nondeal_spend_2026,
  SAFE_DIVIDE(c.prog_deal_2026, c.prog_2026)              AS prog_pct_deal_partners,
  SAFE_DIVIDE(c.prog_nondeal_2026, c.prog_2026)           AS prog_pct_nondeal_partners,
  m.miq_social_mbf_forecast                                AS miq_social_forecast_2026,
  c.miq_social_mir_2026                                    AS miq_social_spend_2026,
  SAFE_DIVIDE(c.miq_social_mir_2026, m.miq_social_mbf_forecast) AS miq_social_pacing,
  CASE
    WHEN COALESCE(be.eligible_billups_ooh, 'Yes') = 'Yes'
    THEN c.ooh_2026
    ELSE 0
  END                                                      AS ooh_spend_2026,
  CASE
    WHEN COALESCE(be.eligible_billups_ooh, 'Yes') = 'Yes'
    THEN c.billups_ooh_2026
    ELSE 0
  END                                                      AS billups_ooh_spend_2026,
  CASE
    WHEN COALESCE(be.eligible_billups_ooh, 'Yes') = 'Yes'
    THEN SAFE_DIVIDE(c.billups_ooh_2026, c.ooh_2026)
    ELSE NULL
  END                                                      AS billups_ooh_share_of_ooh_2026,
  CASE
    WHEN COALESCE(be.eligible_billups_print, 'Yes') = 'Yes'
    THEN c.print_2026
    ELSE 0
  END                                                      AS print_spend_2026,
  CASE
    WHEN COALESCE(be.eligible_billups_print, 'Yes') = 'Yes'
    THEN c.billups_print_2026
    ELSE 0
  END                                                      AS billups_print_spend_2026,
  CASE
    WHEN COALESCE(be.eligible_billups_print, 'Yes') = 'Yes'
    THEN SAFE_DIVIDE(c.billups_print_2026, c.print_2026)
    ELSE NULL
  END                                                      AS billups_print_share_of_print_2026,
  COALESCE(be.eligible_billups_ooh, 'Yes')                AS eligible_billups_ooh,
  COALESCE(be.eligible_billups_print, 'Yes')              AS eligible_billups_print,
  mk.monthly_kpis                                          AS monthly_kpis
FROM client_spend c
FULL OUTER JOIN forecast_metrics f ON c.PLUSCO_CLIENT_ID = f.FO_Client
LEFT JOIN miq_social_forecast m ON COALESCE(c.PLUSCO_CLIENT_ID, f.FO_Client) = m.FO_Client
LEFT JOIN billups_eligibility be ON COALESCE(c.PLUSCO_CLIENT_ID, f.FO_Client) = be.PLUSCO_CLIENT_ID
JOIN target_cte t ON COALESCE(c.PLUSCO_CLIENT_ID, f.FO_Client) = t.client_id
LEFT JOIN target_v2_annual tv2 ON COALESCE(c.PLUSCO_CLIENT_ID, f.FO_Client) = tv2.client_id
LEFT JOIN target_annual ta ON COALESCE(c.PLUSCO_CLIENT_ID, f.FO_Client) = ta.client_id
LEFT JOIN labs_partner_annual lp ON COALESCE(c.PLUSCO_CLIENT_ID, f.FO_Client) = lp.client_id
LEFT JOIN labs_by_partner lbp ON c.PLUSCO_CLIENT_ID = lbp.PLUSCO_CLIENT_ID
LEFT JOIN monthly_kpis mk ON COALESCE(c.PLUSCO_CLIENT_ID, f.FO_Client) = mk.client_id
ORDER BY AGENCY, CLIENT_NAME;