--
-- 5 minute candles
--
CREATE MATERIALIZED VIEW IF NOT EXISTS candle_5m AS (
  SELECT DISTINCT
    market_id,
    to_timestamp(floor((extract('epoch' from created_at) / 300 )) * 300) as t,
    first_value(fill_price) OVER w as o,
    min(fill_price) OVER w as l,
    max(fill_price) OVER w as h,
    last_value(fill_price) OVER w as c,
    sum(fill_qty::numeric) OVER w as v,
    rank() OVER w as the_rank
  FROM
    fill_event
  WINDOW w AS (PARTITION BY market_id, to_timestamp(floor((extract('epoch' from created_at) / 300 )) * 300))
);
CREATE UNIQUE INDEX IF NOT EXISTS candle_5m_market_time ON candle_5m (market_id, t);

--
-- 15 minute candles
--
CREATE MATERIALIZED VIEW IF NOT EXISTS candle_15m AS (
  SELECT DISTINCT
    market_id,
    to_timestamp(floor((extract('epoch' from created_at) / 900 )) * 900) as t,
    first_value(fill_price) OVER w as o,
    min(fill_price) OVER w as l,
    max(fill_price) OVER w as h,
    last_value(fill_price) OVER w as c,
    sum(fill_qty::numeric) OVER w as v,
    rank() OVER w as the_rank
  FROM
    fill_event
  WINDOW w AS (PARTITION BY market_id, to_timestamp(floor((extract('epoch' from created_at) / 900 )) * 900))
);
CREATE UNIQUE INDEX IF NOT EXISTS candle_15m_market_time ON candle_15m (market_id, t);

--
-- 30 minute candles
--
CREATE MATERIALIZED VIEW IF NOT EXISTS candle_30m AS (
  SELECT DISTINCT
    market_id,
    to_timestamp(floor((extract('epoch' from created_at) / 1800 )) * 1800) as t,
    first_value(fill_price) OVER w as o,
    min(fill_price) OVER w as l,
    max(fill_price) OVER w as h,
    last_value(fill_price) OVER w as c,
    sum(fill_qty::numeric) OVER w as v,
    rank() OVER w as the_rank
  FROM
    fill_event
  WINDOW w AS (PARTITION BY market_id, to_timestamp(floor((extract('epoch' from created_at) / 1800 )) * 1800))
);
CREATE UNIQUE INDEX IF NOT EXISTS candle_30m_market_time ON candle_30m (market_id, t);

--
-- 60 minute candles
--
CREATE MATERIALIZED VIEW IF NOT EXISTS candle_60m AS (
  SELECT DISTINCT
    market_id,
    to_timestamp(floor((extract('epoch' from created_at) / 3600 )) * 3600) as t,
    first_value(fill_price) OVER w as o,
    min(fill_price) OVER w as l,
    max(fill_price) OVER w as h,
    last_value(fill_price) OVER w as c,
    sum(fill_qty::numeric) OVER w as v,
    rank() OVER w as the_rank
  FROM
    fill_event
  WINDOW w AS (PARTITION BY market_id, to_timestamp(floor((extract('epoch' from created_at) / 3600 )) * 3600))
);
CREATE UNIQUE INDEX IF NOT EXISTS candle_60m_market_time ON candle_60m (market_id, t);
