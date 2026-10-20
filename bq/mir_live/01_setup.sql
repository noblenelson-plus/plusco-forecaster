-- MIR_Live setup — run ONCE (re-running would reseed spot_history from the 2026-10-01 snapshot).
-- Creates the datasets, the run log, and seeds spot_history from the oldest snapshot that still
-- holds Jan–Mar 2025 Spot (mediaocean-data.mo_raw_spot.*_2026-10-01). After seeding, call
-- MIR_Live.refresh_spot_history() so every date the live raw tables still cover is replaced
-- by current data (see 02_refresh_spot_history.sql).

CREATE SCHEMA IF NOT EXISTS `plusco-media-invest-solutions.MIR_Live`
  OPTIONS (location = 'northamerica-northeast1',
           description = 'Automated MIR built daily from MediaOcean raw (mediaocean-data). See bq/mir_live/README.md.');

CREATE SCHEMA IF NOT EXISTS `plusco-media-invest-solutions.MIR_Live_snapshots`
  OPTIONS (location = 'northamerica-northeast1',
           description = 'Daily snapshots of MIR_Live.MIR (90-day expiry), used to QA a manual MIR pulled on any day.');

-- One row per step of every run, so a bad load can be traced.
CREATE TABLE IF NOT EXISTS `plusco-media-invest-solutions.MIR_Live.run_log` (
  run_at       TIMESTAMP,
  step         STRING,
  detail       STRING,
  raw_min_date DATE,
  spots        INT64,
  rows_out     INT64,
  net_ordered_cad NUMERIC
);

-- Spot history at spot grain (MCPE parts × station × spot date). Never truncated: the daily
-- refresh only replaces dates the raw extract still covers, so months that fall out of
-- MediaOcean's rolling extract window are kept.
CREATE OR REPLACE TABLE `plusco-media-invest-solutions.MIR_Live.spot_history`
OPTIONS (description = 'Spot buys aggregated per MCPE × station × spot_date. Rows before the raw extract window are kept from earlier loads.')
AS
SELECT
  SB.media_code,
  SB.client_code,
  SBS.product_code,
  SB.estimate_code,
  TRIM(SB.station_code) AS station_code,
  SBS.spot_date,
  CAST(SUM(SBS.ordered_client_cost) AS NUMERIC) AS ordered_net,
  -- Billable/payable = ordered cost of affidavited (post-aff) spots, as in L2_Media.MIR_automated_PROC.
  CAST(SUM(IF(SBS.aff_date = DATE '1970-01-01', 0, SBS.ordered_client_cost)) AS NUMERIC) AS post_aff_net,
  COUNT(*) AS n_spots,
  'snapshot 2026-10-01' AS loaded_from,
  CURRENT_TIMESTAMP() AS loaded_at
FROM `mediaocean-data.mo_raw_spot.spot_buyline_2026-10-01` SB
JOIN `mediaocean-data.mo_raw_spot.spot_buylinespot_2026-10-01` SBS
  ON SB.buy_id = SBS.buy_id
GROUP BY 1, 2, 3, 4, 5, 6;
