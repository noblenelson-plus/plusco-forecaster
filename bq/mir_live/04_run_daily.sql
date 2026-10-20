-- MIR_Live.run_daily — the scheduled entry point (scheduled query "MIR_Live daily build",
-- every day 18:00 UTC: after raw Prisma (~10:45 UTC), raw Spot (~14:35 UTC) and the
-- mediaocean-data master tables (~17:20 UTC) have landed).
--   1. keep Spot history (refresh_spot_history)
--   2. rebuild MIR_Live.MIR
--   3. snapshot it as MIR_Live_snapshots.MIR_YYYYMMDD (90-day expiry) so a manual MIR pulled on
--      any day can be QA'd against the automated MIR of that same day (05_qa_compare.sql).

CREATE OR REPLACE PROCEDURE `plusco-media-invest-solutions.MIR_Live.run_daily`()
BEGIN
  DECLARE today STRING DEFAULT FORMAT_DATE('%Y%m%d', CURRENT_DATE('America/Montreal'));

  CALL `plusco-media-invest-solutions.MIR_Live.refresh_spot_history`();
  CALL `plusco-media-invest-solutions.MIR_Live.build_mir_table`(
    'plusco-media-invest-solutions.MIR_Live.spot_history',
    'plusco-media-invest-solutions.MIR_Live.MIR',
    CONCAT('MIR AUTO ', FORMAT_DATE('%Y-%m-%d', CURRENT_DATE('America/Montreal'))));

  EXECUTE IMMEDIATE FORMAT('''
    CREATE SNAPSHOT TABLE IF NOT EXISTS `plusco-media-invest-solutions.MIR_Live_snapshots.MIR_%s`
    CLONE `plusco-media-invest-solutions.MIR_Live.MIR`
    OPTIONS (expiration_timestamp = TIMESTAMP_ADD(CURRENT_TIMESTAMP(), INTERVAL 90 DAY))''', today);

  INSERT INTO `plusco-media-invest-solutions.MIR_Live.run_log` (run_at, step, detail)
  VALUES (CURRENT_TIMESTAMP(), 'snapshot', CONCAT('MIR_Live_snapshots.MIR_', today));
END;
