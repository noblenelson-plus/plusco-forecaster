-- filepath: bq/labs_pacing_wide.sql
-- View PCC_Media_Investment.labs_pacing_wide: labs_pacing_unified pivoted to one column per partner.
-- Read by KPI_BY_CLIENT_2025_vs_2026 (labs targets / booked by partner).
-- Before 2026-11-20 this view lived only in BigQuery; this file is now its source of truth.
-- CHANGE (MIQ-SEM, 2026-11-20): adds forecast_miq_sem / booked_miq_sem (additive; existing columns
--   unchanged). KPI_BY_CLIENT adds them to its MIQ sums.
CREATE OR REPLACE VIEW `plusco-media-invest-solutions.PCC_Media_Investment.labs_pacing_wide` AS
SELECT
  client_id,
  client_name,
  gm_pod,
  agency,
  bu_region,
  business_lead,
  month_num,
  year_month,
  CASE
    WHEN month_num BETWEEN 1 AND 3   THEN 'Q1'
    WHEN month_num BETWEEN 4 AND 6   THEN 'Q2'
    WHEN month_num BETWEEN 7 AND 9   THEN 'Q3'
    WHEN month_num BETWEEN 10 AND 12 THEN 'Q4'
  END AS quarter,
  labs_partner,

  -- Generic columns (work with labs_partner dimension)
  SUM(CASE WHEN metric_type = 'Forecast' THEN value_cad END) AS forecast_value,
  SUM(CASE WHEN metric_type = 'Booked'   THEN value_cad END) AS booked_value,

  -- Partner-specific forecast columns
  SUM(CASE WHEN metric_type = 'Forecast' AND labs_partner = 'AMAZON'        THEN value_cad END) AS forecast_amazon,
  SUM(CASE WHEN metric_type = 'Forecast' AND labs_partner = 'BILLUPS-OOH'   THEN value_cad END) AS forecast_billups_ooh,
  SUM(CASE WHEN metric_type = 'Forecast' AND labs_partner = 'BILLUPS-PRINT' THEN value_cad END) AS forecast_billups_print,
  SUM(CASE WHEN metric_type = 'Forecast' AND labs_partner = 'MIQ-PROG'      THEN value_cad END) AS forecast_miq_prog,
  SUM(CASE WHEN metric_type = 'Forecast' AND labs_partner = 'MIQ-SOCIAL'    THEN value_cad END) AS forecast_miq_social,
  SUM(CASE WHEN metric_type = 'Forecast' AND labs_partner = 'QUANTCAST'     THEN value_cad END) AS forecast_quantcast,
  SUM(CASE WHEN metric_type = 'Forecast' AND labs_partner = 'YAHOO'         THEN value_cad END) AS forecast_yahoo,
  -- AIM rolls up all variants (AIM / AIM-Prog / AIM-Social / AIM-SEM), like MIQ.
  SUM(CASE WHEN metric_type = 'Forecast' AND labs_partner IN ('AIM','AIM-PROG','AIM-SOCIAL','AIM-SEM') THEN value_cad END) AS forecast_aim,
  SUM(CASE WHEN metric_type = 'Forecast' AND labs_partner = 'STACKADAPT'    THEN value_cad END) AS forecast_stackadapt,
  SUM(CASE WHEN metric_type = 'Forecast' AND labs_partner = 'REDDIT'        THEN value_cad END) AS forecast_reddit,
  NULLIF(SUM(CASE WHEN metric_type = 'Forecast' THEN value_cad END), 0) AS total_labs_forecast,

  -- Partner-specific booked columns (NULL -> 0)
  COALESCE(SUM(CASE WHEN metric_type = 'Booked' AND labs_partner = 'AMAZON'        THEN value_cad END), 0) AS booked_amazon,
  COALESCE(SUM(CASE WHEN metric_type = 'Booked' AND labs_partner = 'BILLUPS-OOH'   THEN value_cad END), 0) AS booked_billups_ooh,
  COALESCE(SUM(CASE WHEN metric_type = 'Booked' AND labs_partner = 'BILLUPS-PRINT' THEN value_cad END), 0) AS booked_billups_print,
  COALESCE(SUM(CASE WHEN metric_type = 'Booked' AND labs_partner = 'MIQ-PROG'      THEN value_cad END), 0) AS booked_miq_prog,
  COALESCE(SUM(CASE WHEN metric_type = 'Booked' AND labs_partner = 'MIQ-SOCIAL'    THEN value_cad END), 0) AS booked_miq_social,
  COALESCE(SUM(CASE WHEN metric_type = 'Booked' AND labs_partner = 'QUANTCAST'     THEN value_cad END), 0) AS booked_quantcast,
  COALESCE(SUM(CASE WHEN metric_type = 'Booked' AND labs_partner = 'YAHOO'         THEN value_cad END), 0) AS booked_yahoo,
  -- AIM rolls up all variants, like MIQ.
  COALESCE(SUM(CASE WHEN metric_type = 'Booked' AND labs_partner IN ('AIM','AIM-PROG','AIM-SOCIAL','AIM-SEM') THEN value_cad END), 0) AS booked_aim,
  COALESCE(SUM(CASE WHEN metric_type = 'Booked' AND labs_partner = 'STACKADAPT'    THEN value_cad END), 0) AS booked_stackadapt,
  COALESCE(SUM(CASE WHEN metric_type = 'Booked' AND labs_partner = 'REDDIT'        THEN value_cad END), 0) AS booked_reddit,
  COALESCE(SUM(CASE WHEN metric_type = 'Booked' THEN value_cad END), 0) AS total_labs_booked,

  -- MIQ-SEM (2026-11-20), appended last so the existing columns keep their positions.
  SUM(CASE WHEN metric_type = 'Forecast' AND labs_partner = 'MIQ-SEM' THEN value_cad END) AS forecast_miq_sem,
  COALESCE(SUM(CASE WHEN metric_type = 'Booked' AND labs_partner = 'MIQ-SEM' THEN value_cad END), 0) AS booked_miq_sem

FROM `plusco-media-invest-solutions.PCC_Media_Investment.labs_pacing_unified`
GROUP BY client_id, client_name, gm_pod, agency, bu_region, business_lead, month_num, year_month, quarter, labs_partner;
