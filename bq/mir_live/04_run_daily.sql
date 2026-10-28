-- MIR_Live.run_daily — the scheduled entry point (scheduled query "MIR_Live daily build",
-- every day 22:00 UTC). On full-refresh days mediaocean-data's raw Spot/Prisma loads have finished
-- as late as ~19:20 UTC, and its master tables are rebuilt ~17:20 UTC.
--   1. keep Spot history (refresh_spot_history; aborts on a partial Spot load)
--   2. build MIR_Live.MIR_staging
--   3. check it against the current MIR before replacing it (see run_build) — on failure the run
--      errors (failure e-mail) and MIR keeps the previous build
--   4. snapshot MIR as MIR_Live_snapshots.MIR_YYYYMMDD (90-day expiry; replaced if the day is rebuilt)
--      so a manual MIR pulled on any day can be QA'd against that day's automated MIR (05_qa_compare.sql).
--
-- After a deliberate logic change that moves closed months, run once with the checks off:
--   CALL `plusco-media-invest-solutions.MIR_Live.run_build`(TRUE);

CREATE OR REPLACE PROCEDURE `plusco-media-invest-solutions.MIR_Live.run_build`(skip_checks BOOL)
BEGIN
  DECLARE today STRING DEFAULT FORMAT_DATE('%Y%m%d', CURRENT_DATE('America/Montreal'));
  DECLARE new_rows, old_rows INT64;
  DECLARE new_spot, new_prisma, new_2025, old_2025 NUMERIC;
  DECLARE problem STRING DEFAULT '';

  CALL `plusco-media-invest-solutions.MIR_Live.refresh_spot_history`();
  CALL `plusco-media-invest-solutions.MIR_Live.build_mir_table`(
    'plusco-media-invest-solutions.MIR_Live.spot_history',
    'plusco-media-invest-solutions.MIR_Live.MIR_staging',
    CONCAT('MIR AUTO ', FORMAT_DATE('%Y-%m-%d', CURRENT_DATE('America/Montreal'))));

  SET (new_rows, new_spot, new_prisma, new_2025) = (
    SELECT AS STRUCT COUNT(*),
      SUM(IF(MEDIA_CODE IN ('N','R','T'), NET_ORDERED_CAD, 0)),
      SUM(IF(MEDIA_CODE NOT IN ('N','R','T'), NET_ORDERED_CAD, 0)),
      SUM(IF(PLUSCO_YEAR = '2025', NET_ORDERED_CAD, 0))
    FROM `plusco-media-invest-solutions.MIR_Live.MIR_staging`);
  SET (old_rows, old_2025) = (
    SELECT AS STRUCT COUNT(*), SUM(IF(PLUSCO_YEAR = '2025', NET_ORDERED_CAD, 0))
    FROM `plusco-media-invest-solutions.MIR_Live.MIR`);

  -- A half-loaded raw table shows up as a missing system, a row drop or a moved closed year.
  IF IFNULL(new_spot, 0) <= 0 THEN SET problem = CONCAT(problem, 'no Spot dollars; '); END IF;
  IF IFNULL(new_prisma, 0) <= 0 THEN SET problem = CONCAT(problem, 'no Prisma dollars; '); END IF;
  IF new_rows < 0.95 * old_rows THEN SET problem = CONCAT(problem, FORMAT('rows %d vs %d before; ', new_rows, old_rows)); END IF;
  IF ABS(new_2025 - old_2025) > 0.01 * ABS(old_2025) THEN
    SET problem = CONCAT(problem, FORMAT('2025 total %s vs %s before; ', CAST(ROUND(new_2025) AS STRING), CAST(ROUND(old_2025) AS STRING)));
  END IF;

  IF problem != '' AND NOT skip_checks THEN
    INSERT INTO `plusco-media-invest-solutions.MIR_Live.run_log` (run_at, step, detail, rows_out, net_ordered_cad)
    VALUES (CURRENT_TIMESTAMP(), 'checks', CONCAT('FAILED, MIR not replaced: ', problem), new_rows, new_spot + new_prisma);
    RAISE USING MESSAGE = CONCAT('MIR_Live checks failed, MIR left unchanged: ', problem);
  END IF;

  CREATE OR REPLACE TABLE `plusco-media-invest-solutions.MIR_Live.MIR`
  COPY `plusco-media-invest-solutions.MIR_Live.MIR_staging`;

  INSERT INTO `plusco-media-invest-solutions.MIR_Live.run_log` (run_at, step, detail, rows_out, net_ordered_cad)
  VALUES (CURRENT_TIMESTAMP(), 'checks', IF(problem = '', 'ok', CONCAT('SKIPPED: ', problem)), new_rows, new_spot + new_prisma);

  EXECUTE IMMEDIATE FORMAT('DROP SNAPSHOT TABLE IF EXISTS `plusco-media-invest-solutions.MIR_Live_snapshots.MIR_%s`', today);
  EXECUTE IMMEDIATE FORMAT('''
    CREATE SNAPSHOT TABLE `plusco-media-invest-solutions.MIR_Live_snapshots.MIR_%s`
    CLONE `plusco-media-invest-solutions.MIR_Live.MIR`
    OPTIONS (expiration_timestamp = TIMESTAMP_ADD(CURRENT_TIMESTAMP(), INTERVAL 90 DAY))''', today);

  INSERT INTO `plusco-media-invest-solutions.MIR_Live.run_log` (run_at, step, detail)
  VALUES (CURRENT_TIMESTAMP(), 'snapshot', CONCAT('MIR_Live_snapshots.MIR_', today));
END;

-- 5. rebuild MIR_Live.MIR_NATIVE (the MIR in PCC_Dashboard_NATIVE's layout, 06_build_native.sql). It reads
--    the MO Client Key and Vendor Database 2.0 Google Sheets, so the schedule's owner needs Drive access;
--    a failure is logged and e-mailed, and MIR itself is already up to date by then.
CREATE OR REPLACE PROCEDURE `plusco-media-invest-solutions.MIR_Live.run_daily`()
BEGIN
  CALL `plusco-media-invest-solutions.MIR_Live.run_build`(FALSE);

  BEGIN
    CALL `plusco-media-invest-solutions.MIR_Live.build_native`(
      'plusco-media-invest-solutions.MIR_Live.MIR',
      'plusco-media-invest-solutions.MIR_Live.MIR_NATIVE',
      CONCAT('MIR LIVE ', FORMAT_DATE('%Y-%m-%d', CURRENT_DATE('America/Montreal'))));
    INSERT INTO `plusco-media-invest-solutions.MIR_Live.run_log` (run_at, step, detail, rows_out, net_ordered_cad)
    SELECT CURRENT_TIMESTAMP(), 'build_native', 'ok', COUNT(*), CAST(SUM(NET_ORDERED_CAD) AS NUMERIC)
    FROM `plusco-media-invest-solutions.MIR_Live.MIR_NATIVE`;
    -- 6. clients and vendors to confirm, for the morning e-mail (07_exceptions.sql).
    CALL `plusco-media-invest-solutions.MIR_Live.refresh_exceptions`();
  EXCEPTION WHEN ERROR THEN
    INSERT INTO `plusco-media-invest-solutions.MIR_Live.run_log` (run_at, step, detail)
    VALUES (CURRENT_TIMESTAMP(), 'build_native', CONCAT('FAILED: ', @@error.message));
    RAISE USING MESSAGE = CONCAT('MIR_Live.MIR_NATIVE not rebuilt (MIR is): ', @@error.message);
  END;
END;
