-- MIR_Live.learn_order_networks — which TV network each conventional-network Spot order is.
--
-- MediaOcean books conventional network TV on group "stations" (FRACN French, ENGCN English, TORHN, MTLFN,
-- VANVN and affiliate groups). Each buyline carries an order id, and each order is one network, but the
-- order file (mo_raw_spot.spot_order, order -> network) arrives empty. The manual MIR does show each network,
-- so we learn order -> network from it:
--   1. amount: an order whose campaign-month total equals exactly one network line of the manual MIR
--      (majority vote across months);
--   2. program: a program name that always meant one network on that group station ("TVA NOUVELLES 12" -> TVA)
--      labels the other orders with that program;
--   3. leftover: when exactly one manual network is still unexplained in a campaign month and the remaining
--      orders add up to it, they are that network.
-- Results are kept (never overwritten) in MIR_Live.order_network, and the program list in
-- MIR_Live.program_network labels future orders after the manual pull stops. build_native (06) uses both
-- to split the group stations; what stays unknown keeps the group code.
-- Checked on the Oct 27 manual MIR: 89 % of 2025–2026 group-station dollars labelled, ~90 % of those equal
-- to the manual MIR at campaign × month × network.

CREATE TABLE IF NOT EXISTS `plusco-media-invest-solutions.MIR_Live.order_network` (
  order_id STRING, network STRING, how STRING, learned_on DATE);
CREATE TABLE IF NOT EXISTS `plusco-media-invest-solutions.MIR_Live.program_network` (
  station STRING, program STRING, network STRING, learned_on DATE);
-- The manual MIR's network split per campaign month, kept for months whose orders have left MediaOcean's
-- extract window (spot_history keeps their dollars but not their order ids, e.g. Jan–Mar 2025).
CREATE TABLE IF NOT EXISTS `plusco-media-invest-solutions.MIR_Live.manual_network_share` (
  MCPE STRING, month STRING, network STRING, share FLOAT64, learned_on DATE);

CREATE OR REPLACE PROCEDURE `plusco-media-invest-solutions.MIR_Live.learn_order_networks`(manual_table STRING)
BEGIN
  DECLARE today DATE DEFAULT CURRENT_DATE('America/Montreal');

  -- Group-station orders (no '/' in the station code; specialty channels are 'ADDK/NF' and need no split).
  CREATE TEMP TABLE net_orders AS
  SELECT
    CONCAT('N-', SB.client_code, '-', SBS.product_code, '-', SB.estimate_code) AS MCPE,
    FORMAT_DATE('%Y-%m', SBS.spot_date) AS month,
    COLLATE(TRIM(SB.station_code), '') AS station,
    COLLATE(SB.order_id, '') AS order_id,
    MIN(REGEXP_REPLACE(UPPER(COLLATE(SB.program_name, '')), r'^=\s*', '')) AS program,
    SUM(SBS.ordered_client_cost) AS net
  FROM `mediaocean-data.mo_raw_spot.spot_buyline` SB
  JOIN `mediaocean-data.mo_raw_spot.spot_buylinespot` SBS ON SB.buy_id = SBS.buy_id
  WHERE SB.media_code = 'N' AND NOT REGEXP_CONTAINS(COLLATE(SB.station_code, ''), r'/') AND SB.order_id IS NOT NULL
    AND NOT REGEXP_CONTAINS(COLLATE(SB.client_code, ''), r'^[0-9]H')  -- Horizon (1H…, 2H…) is never part of the MIR
    AND NOT EXISTS (SELECT 1 FROM `mediaocean-data.mo_raw_spot.spot_deleted_buyline` D WHERE D.buyline_key = SB.buyline_key)
  GROUP BY 1, 2, 3, 4;

  -- The manual MIR's network lines (vendors that are not specialty channels).
  EXECUTE IMMEDIATE REPLACE('''
  CREATE TEMP TABLE manual AS
  WITH specialty AS (
    SELECT DISTINCT TRIM(SPLIT(COLLATE(station_code, ''), '/')[OFFSET(0)]) AS code
    FROM `mediaocean-data.mo_raw_spot.spot_buyline`
    WHERE media_code = 'N' AND REGEXP_CONTAINS(COLLATE(station_code, ''), r'/')
  )
  SELECT CONCAT('N', SUBSTR(MCPE, 2)) AS MCPE, MONTH AS month, TRIM(VENDOR_CODE) AS network, SUM(NET_ORDERED) AS net
  FROM `{{MANUAL}}`
  WHERE MEDIA_CODE = 'N' AND TRIM(VENDOR_CODE) NOT IN (SELECT code FROM specialty)
  GROUP BY 1, 2, 3''', '{{MANUAL}}', manual_table);

  -- 1. amount
  CREATE TEMP TABLE learned1 AS
  SELECT order_id, ARRAY_AGG(network ORDER BY votes DESC LIMIT 1)[OFFSET(0)] AS network
  FROM (
    SELECT order_id, network, COUNT(*) AS votes
    FROM (
      SELECT o.order_id, m.network, COUNT(*) OVER (PARTITION BY o.MCPE, o.month, o.order_id) AS candidates
      FROM net_orders o
      JOIN manual m ON m.MCPE = o.MCPE AND m.month = o.month AND o.net != 0
        AND ABS(m.net - o.net) <= GREATEST(2, 0.002 * ABS(o.net))
    )
    WHERE candidates = 1
    GROUP BY 1, 2
  )
  GROUP BY 1;

  -- 2. program names that always meant one network on a station
  CREATE TEMP TABLE prog_map AS
  SELECT station, program, ANY_VALUE(network) AS mapped_network
  FROM (SELECT DISTINCT o.station, o.program, l.network FROM net_orders o JOIN learned1 l USING (order_id) WHERE o.program != '')
  GROUP BY 1, 2
  HAVING COUNT(DISTINCT network) = 1;

  CREATE TEMP TABLE learned2 AS
  SELECT order_id, network, 'amount' AS how FROM learned1
  UNION ALL
  SELECT o.order_id, ANY_VALUE(p.mapped_network), 'program'
  FROM net_orders o JOIN prog_map p ON p.station = o.station AND p.program = o.program
  WHERE o.order_id NOT IN (SELECT order_id FROM learned1)
  GROUP BY 1
  HAVING COUNT(DISTINCT p.mapped_network) = 1;

  -- 3. the one network left in a campaign month
  CREATE TEMP TABLE learned3 AS
  WITH o AS (SELECT o.*, l.network FROM net_orders o LEFT JOIN learned2 l USING (order_id)),
  explained AS (SELECT MCPE, month, network, SUM(net) AS net FROM o WHERE network IS NOT NULL GROUP BY 1, 2, 3),
  remaining_manual AS (
    SELECT m.MCPE, m.month, m.network, m.net - IFNULL(e.net, 0) AS net
    FROM manual m LEFT JOIN explained e USING (MCPE, month, network)
    WHERE ABS(m.net - IFNULL(e.net, 0)) > 2
  ),
  remaining_raw AS (SELECT MCPE, month, ARRAY_AGG(order_id) AS orders, SUM(net) AS net FROM o WHERE network IS NULL GROUP BY 1, 2),
  one_left AS (
    SELECT r.MCPE, r.month, ANY_VALUE(rm.network) AS network, ANY_VALUE(r.orders) AS orders
    FROM remaining_raw r JOIN remaining_manual rm USING (MCPE, month)
    GROUP BY 1, 2
    HAVING COUNT(*) = 1 AND ABS(SUM(rm.net) - ANY_VALUE(r.net)) <= GREATEST(2, 0.005 * ABS(ANY_VALUE(r.net)))
  )
  SELECT order_id, ANY_VALUE(l.network) AS network, 'leftover' AS how
  FROM one_left l, UNNEST(l.orders) AS order_id
  WHERE order_id NOT IN (SELECT order_id FROM learned2)
  GROUP BY 1
  HAVING COUNT(DISTINCT l.network) = 1;

  -- Keep what was learned before; add what is new.
  INSERT INTO `plusco-media-invest-solutions.MIR_Live.order_network` (order_id, network, how, learned_on)
  SELECT order_id, network, how, today
  FROM (SELECT * FROM learned2 UNION ALL SELECT * FROM learned3)
  WHERE order_id NOT IN (SELECT order_id FROM `plusco-media-invest-solutions.MIR_Live.order_network`);

  -- Program list from everything learned so far (still one network per station + program).
  CREATE OR REPLACE TABLE `plusco-media-invest-solutions.MIR_Live.program_network` AS
  SELECT station, program, ANY_VALUE(learned) AS network, today AS learned_on
  FROM (
    SELECT o.station, o.program, t.network AS learned
    FROM net_orders o JOIN `plusco-media-invest-solutions.MIR_Live.order_network` t USING (order_id)
    WHERE o.program != '')
  GROUP BY 1, 2
  HAVING COUNT(DISTINCT learned) = 1;

  INSERT INTO `plusco-media-invest-solutions.MIR_Live.manual_network_share` (MCPE, month, network, share, learned_on)
  SELECT MCPE, month, network, SAFE_DIVIDE(net, SUM(net) OVER (PARTITION BY MCPE, month)), today
  FROM manual
  WHERE (MCPE, month) NOT IN (SELECT AS STRUCT MCPE, month FROM `plusco-media-invest-solutions.MIR_Live.manual_network_share`)
  QUALIFY SAFE_DIVIDE(net, SUM(net) OVER (PARTITION BY MCPE, month)) IS NOT NULL;

  INSERT INTO `plusco-media-invest-solutions.MIR_Live.run_log` (run_at, step, detail, rows_out)
  SELECT CURRENT_TIMESTAMP(), 'learn_order_networks', CONCAT('from ', manual_table), COUNT(*)
  FROM `plusco-media-invest-solutions.MIR_Live.order_network`;
END;
