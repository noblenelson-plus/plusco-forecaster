-- MIR_Live raw data health — the automated version of Yves's QA_Refresh sheet (a pivot of
-- mediaocean-data.mo_raw_QA.mo_raw_counts: row count of every raw MediaOcean table after each load).
--
-- MIR_Live.raw_loads            one row per dataset × table × day (last load of the day) with the previous load.
-- MIR_Live.raw_health(as_of)    the problems seen up to `as_of` (Montreal time) over the last 7 days, with a
--                               severity; `as_of` makes any past moment replayable.
-- MIR_Live.raw_load_days(as_of) one row per dataset × day: refresh type, time, rows, change — the email's grid.
--
-- mo_raw_counts times are Montreal local time. Rules, learned from Aug–Nov 2026 history:
--   - Expected loads: a dataset is expected on a weekday when it loaded on at least 6 of the 8 previous same
--     weekdays (Spot doesn't load on Sundays). Until an hour past the latest of those 8 loads it is only pending,
--     then missing (error); a load more than 2 h after its usual (median) time is late (warning).
--   - Frozen: the core transactional tables (Spot buy lines, Print buys, Prisma placements, the IO invoice file)
--     only stand still on a Tue–Sat load during an incident (Aug 11–20, Sep 8–11, Sep 29–30, Oct 27–29); one such
--     load is a warning, two in a row an error.
--   - Drops (tables the MIR reads): a daily load never removed more than 1.5 % of a table, so −2 % is an error.
--     Monday full refreshes of Spot drop up to ~27 % when MediaOcean moves its extract window forward (kept in
--     MIR_Live.spot_history), reported as info up to −35 %; other datasets' full refreshes stay within −1 %.
--   - A watched table missing from a load, or empty when it had rows, is an error.
--   - MediaOcean's master tables (L2_Media.master_*) are rebuilt every afternoon; older than 30 h is an error.

CREATE OR REPLACE VIEW `plusco-media-invest-solutions.MIR_Live.raw_loads` AS
WITH raw AS (
  SELECT COLLATE(dataset, '') AS ds, COLLATE(`table`, '') AS tbl, date AS day, time, cnt, COLLATE(status, '') AS status
  FROM `mediaocean-data.mo_raw_QA.mo_raw_counts`
  WHERE COLLATE(dataset, '') IN ('mo_raw_io', 'mo_raw_print', 'mo_raw_prisma', 'mo_raw_spot')
  QUALIFY ROW_NUMBER() OVER (PARTITION BY dataset, `table`, date ORDER BY time DESC) = 1
)
SELECT
  ds, tbl, day, time, DATETIME(day, time) AS loaded_at, status, cnt,
  LAG(cnt) OVER w AS prev_cnt,
  LAG(day) OVER w AS prev_day,
  SAFE_DIVIDE(cnt - LAG(cnt) OVER w, LAG(cnt) OVER w) AS pct,
  tbl IN ('spot_buyline', 'spot_buylinespot', 'spot_billed_summary', 'spot_paid_summary', 'spot_estimate',
          'spot_client', 'spot_rep', 'spot_agency', 'print_buy', 'print_buy_summary', 'print_client',
          'print_estimate', 'print_agency', 'placements', 'placements_monthly', 'buy_orders',
          'Prisma_PQ_Placement_Invoice') AS watched,
  tbl IN ('spot_buyline', 'spot_buylinespot', 'print_buy', 'placements', 'Prisma_PQ_Placement_Invoice') AS core
FROM raw
WINDOW w AS (PARTITION BY ds, tbl ORDER BY day);

CREATE OR REPLACE TABLE FUNCTION `plusco-media-invest-solutions.MIR_Live.raw_load_days`(as_of DATETIME) AS (
  SELECT
    ds, day, FORMAT_DATE('%a', day) AS dow,
    ANY_VALUE(status) AS status,
    MIN(time) AS first_time, MAX(time) AS last_time,
    COUNT(*) AS tables,
    SUM(cnt) AS total_rows,
    SUM(cnt) - SUM(prev_cnt) AS change_rows
  FROM `plusco-media-invest-solutions.MIR_Live.raw_loads`
  WHERE loaded_at <= as_of AND day > DATE_SUB(DATE(as_of), INTERVAL 7 DAY)
  GROUP BY ds, day
);

CREATE OR REPLACE TABLE FUNCTION `plusco-media-invest-solutions.MIR_Live.raw_health`(as_of DATETIME) AS (
  WITH loads AS (
    SELECT * FROM `plusco-media-invest-solutions.MIR_Live.raw_loads` WHERE loaded_at <= as_of
  ),
  days AS (
    SELECT d AS day FROM UNNEST(GENERATE_DATE_ARRAY(DATE_SUB(DATE(as_of), INTERVAL 6 DAY), DATE(as_of))) d
  ),
  ds_days AS (
    SELECT *, LAG(day) OVER (PARTITION BY ds ORDER BY day) AS prev_day
    FROM (SELECT ds, day, MAX(time) AS time, COUNT(*) AS tables FROM loads GROUP BY ds, day)
  ),
  -- What is normal for each dataset on each day: loaded on ≥ 6 of the 8 previous same weekdays, by which time.
  expect AS (
    SELECT d.day, x.ds,
      COUNTIF(l.day IS NOT NULL) AS loaded_weeks,
      APPROX_QUANTILES(l.time, 2)[OFFSET(1)] AS usual_time,
      -- Missing once later than any of those 8 weeks, plus an hour.
      MAX(l.time) AS latest_time
    FROM days d
    CROSS JOIN (SELECT DISTINCT ds FROM loads) x
    CROSS JOIN UNNEST(GENERATE_ARRAY(1, 8)) w
    LEFT JOIN ds_days l ON l.ds = x.ds AND l.day = DATE_SUB(d.day, INTERVAL 7 * w DAY)
    GROUP BY d.day, x.ds
  ),
  missing AS (
    SELECT
      IF(DATETIME_ADD(DATETIME(e.day, e.latest_time), INTERVAL 1 HOUR) < as_of, 'error', 'pending') AS severity,
      e.day, e.ds, CAST(NULL AS STRING) AS tbl, 'not loaded' AS check_name,
      IF(DATETIME_ADD(DATETIME(e.day, e.latest_time), INTERVAL 1 HOUR) < as_of,
        FORMAT('did not load (usually in by %s)', FORMAT_TIME('%H:%M', e.usual_time)),
        FORMAT('not in yet (usually in by %s)', FORMAT_TIME('%H:%M', e.usual_time))) AS message
    FROM expect e
    LEFT JOIN ds_days l USING (ds, day)
    WHERE e.loaded_weeks >= 6 AND l.day IS NULL
  ),
  late AS (
    SELECT 'warning' AS severity, l.day, l.ds, CAST(NULL AS STRING), 'late',
      FORMAT('loaded at %s (usually by %s)', FORMAT_TIME('%H:%M', l.time), FORMAT_TIME('%H:%M', e.usual_time))
    FROM ds_days l JOIN expect e USING (ds, day)
    WHERE e.loaded_weeks >= 6 AND DATETIME(l.day, l.time) > DATETIME_ADD(DATETIME(l.day, e.usual_time), INTERVAL 2 HOUR)
  ),
  -- Watched tables absent from a dataset's load that day (they were in its previous load).
  absent AS (
    SELECT 'error', l.day, l.ds, p.tbl, 'table missing', 'missing from the load (was in the previous one)'
    FROM ds_days l
    JOIN loads p ON p.ds = l.ds AND p.watched AND p.day = l.prev_day
    LEFT JOIN loads t ON t.ds = l.ds AND t.tbl = p.tbl AND t.day = l.day
    WHERE l.day IN (SELECT day FROM days) AND t.tbl IS NULL
  ),
  changes AS (
    SELECT
      CASE
        WHEN cnt = 0 THEN 'error'
        WHEN ds = 'mo_raw_spot' AND status = 'Full Refresh' AND pct >= -0.35 THEN 'info'
        ELSE 'error'
      END AS severity,
      day, ds, tbl, IF(cnt = 0, 'empty', 'drop') AS check_name,
      CASE
        WHEN cnt = 0 THEN FORMAT('empty (had %s rows)', FORMAT('%\'d', prev_cnt))
        WHEN ds = 'mo_raw_spot' AND status = 'Full Refresh' AND pct >= -0.35 THEN
          FORMAT('weekly refresh dropped %.1f %% (%s → %s rows): MediaOcean moved its extract window; older spots are kept in the MIR history',
            -100 * pct, FORMAT('%\'d', prev_cnt), FORMAT('%\'d', cnt))
        ELSE FORMAT('dropped %.1f %% (%s → %s rows)', -100 * pct, FORMAT('%\'d', prev_cnt), FORMAT('%\'d', cnt))
      END
    FROM loads
    WHERE watched AND prev_cnt >= 100 AND day IN (SELECT day FROM days) AND (cnt = 0 OR pct < -0.02)
  ),
  -- Core tables standing still on a Tue–Sat load; streak = consecutive such loads.
  still AS (
    SELECT *, COUNTIF(NOT stuck) OVER (PARTITION BY ds, tbl ORDER BY day) AS grp
    FROM (
      SELECT ds, tbl, day, cnt, cnt = prev_cnt AND EXTRACT(DAYOFWEEK FROM day) BETWEEN 3 AND 7 AS stuck
      FROM loads WHERE core
    )
  ),
  frozen AS (
    SELECT IF(streak >= 2, 'error', 'warning'), day, ds, tbl, 'frozen',
      IF(streak >= 2, FORMAT('unchanged for %d loads in a row (%s rows): MediaOcean is probably not sending new data', streak, FORMAT('%\'d', cnt)),
        FORMAT('unchanged since the previous load (%s rows); normal only after a holiday', FORMAT('%\'d', cnt)))
    FROM (
      SELECT *, COUNT(*) OVER (PARTITION BY ds, tbl, grp ORDER BY day) - 1 AS streak FROM still
    )
    WHERE stuck AND day IN (SELECT day FROM days)
  ),
  masters AS (
    SELECT 'error', DATE(as_of), 'L2_Media', table_id, 'master stale',
      FORMAT('not rebuilt since %s', FORMAT_DATETIME('%b %d %H:%M', DATETIME(TIMESTAMP_MILLIS(last_modified_time), 'America/Montreal')))
    FROM `mediaocean-data.L2_Media.__TABLES__`
    WHERE table_id IN ('master_client', 'master_estimate', 'master_product', 'master_vendor', 'master_media')
      AND DATETIME(TIMESTAMP_MILLIS(last_modified_time), 'America/Montreal') < DATETIME_SUB(as_of, INTERVAL 30 HOUR)
      -- Only meaningful for the present: past runs can't see when a table was modified before its latest rebuild.
      AND DATE(as_of) >= CURRENT_DATE('America/Montreal')
  )
  SELECT * FROM missing
  UNION ALL SELECT * FROM late
  UNION ALL SELECT * FROM absent
  UNION ALL SELECT * FROM changes
  UNION ALL SELECT * FROM frozen
  UNION ALL SELECT * FROM masters
);
