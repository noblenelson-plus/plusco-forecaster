-- MIR_Live.refresh_spot_history — replaces every spot date the live raw extract covers with
-- current data and leaves older dates untouched.
--
-- Why: mo_raw_spot's weekly full refresh truncates spot_buyline / spot_buylinespot and reloads
-- MediaOcean's extract, whose window moves forward a quarter at a time (2024-09-30 → 2024-12-30
-- → 2025-03-31 in 2026). Reading raw directly loses those months; this table keeps them.
--
-- Guard: aborts (and changes nothing) if the raw load looks partial, i.e. it holds fewer than
-- 80 % of the spots history already has for the same dates.

CREATE OR REPLACE PROCEDURE `plusco-media-invest-solutions.MIR_Live.refresh_spot_history`()
BEGIN
  DECLARE raw_min DATE;
  DECLARE raw_spots INT64;
  DECLARE hist_spots INT64;

  CREATE TEMP TABLE cur AS
  SELECT
    SB.media_code,
    SB.client_code,
    SBS.product_code,
    SB.estimate_code,
    TRIM(SB.station_code) AS station_code,
    SBS.spot_date,
    CAST(SUM(SBS.ordered_client_cost) AS NUMERIC) AS ordered_net,
    CAST(SUM(IF(SBS.aff_date = DATE '1970-01-01', 0, SBS.ordered_client_cost)) AS NUMERIC) AS post_aff_net,
    COUNT(*) AS n_spots
  FROM `mediaocean-data.mo_raw_spot.spot_buyline` SB
  JOIN `mediaocean-data.mo_raw_spot.spot_buylinespot` SBS
    ON SB.buy_id = SBS.buy_id
  WHERE NOT EXISTS (
    SELECT 1 FROM `mediaocean-data.mo_raw_spot.spot_deleted_buyline` SDB
    WHERE SDB.buyline_key = SB.buyline_key
  )
  GROUP BY 1, 2, 3, 4, 5, 6;

  SET raw_min = (SELECT MIN(spot_date) FROM cur);
  SET raw_spots = (SELECT SUM(n_spots) FROM cur);
  SET hist_spots = (
    SELECT SUM(n_spots) FROM `plusco-media-invest-solutions.MIR_Live.spot_history`
    WHERE spot_date >= raw_min
  );

  IF raw_min IS NULL OR raw_spots < 0.8 * IFNULL(hist_spots, 0) THEN
    INSERT INTO `plusco-media-invest-solutions.MIR_Live.run_log` (run_at, step, detail, raw_min_date, spots)
    VALUES (CURRENT_TIMESTAMP(), 'refresh_spot_history', FORMAT('ABORTED: raw has %d spots vs %d in history for the same dates', IFNULL(raw_spots, 0), IFNULL(hist_spots, 0)), raw_min, raw_spots);
    RAISE USING MESSAGE = FORMAT('Spot raw load looks partial (%d spots vs %d in history from %t); history left unchanged.', IFNULL(raw_spots, 0), IFNULL(hist_spots, 0), raw_min);
  END IF;

  BEGIN TRANSACTION;
    DELETE FROM `plusco-media-invest-solutions.MIR_Live.spot_history` WHERE spot_date >= raw_min;
    INSERT INTO `plusco-media-invest-solutions.MIR_Live.spot_history`
      (media_code, client_code, product_code, estimate_code, station_code, spot_date, ordered_net, post_aff_net, n_spots, loaded_from, loaded_at)
    SELECT *, 'raw', CURRENT_TIMESTAMP() FROM cur;
  COMMIT TRANSACTION;

  INSERT INTO `plusco-media-invest-solutions.MIR_Live.run_log` (run_at, step, detail, raw_min_date, spots)
  VALUES (CURRENT_TIMESTAMP(), 'refresh_spot_history', 'ok', raw_min, raw_spots);
END;
