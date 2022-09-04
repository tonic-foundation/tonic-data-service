-- example of how to update params

-- available options and defaults
-- -- multiplier when quoted price is exactly 1.000
-- 5 :: numeric max_price_multiplier,
-- -- <= this many bps from 1.000 is eligible
-- 4 :: numeric eligible_bp_distance,
-- -- the lower this is, the more we reward length of time on orderbook
-- 4 :: numeric time_divisor
update
    rewards.params
set
    eligible_bp_distance = 10
where
    true;

update
    rewards.const
set
 start_date = date('2022-08-01 16:00:00' :: timestamp)
where
    true;
