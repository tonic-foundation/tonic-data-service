-- NOTE
-- Previously, the way this worked was:
--   As soon as an order was filled, the rebate amount was multiplied by some
--   parameters and the result was the reward amount. This meant you'd know
--   in ~real time how much you'd earned, but
--     1. if volumes were low, you'd pay out nothing
--     2. the reward-per day was uncapped
--
-- Now, the way it works is:
--   Decide a fixed rewards pool for the day. You do the same calculation on
--   rebates, but treat the result as "points". At the end of the day, each
--   user is paid a share of the pool in proportion to their points earned.
--     1. you now only know the share that you've earned today, which is
--        unfinalized until the day ends
--     2. payouts are capped, math is easier, updates are easier, etc
--
-- However the "points" column is still called "rewards"
begin
;

create schema rewards;

grant usage on schema rewards to readonly;

alter default privileges in schema rewards grant select on tables to readonly;

-- return 1 if val is 0, else val. could've been min/max whatever
create
or replace function rewards.bumper(val numeric) returns numeric LANGUAGE SQL IMMUTABLE RETURNS NULL ON NULL INPUT RETURN case
    when val = 0 then 1
    else val
end;

create table rewards.const as (
    select
        1000000 :: numeric one_usdc,
        1000000000000000000 :: numeric one_usn,
        (
            select
                id
            from
                market
            where
                symbol = 'usn/usdc'
        ) usn_usdc_market_id,
        date('2022-08-29 16:00:00' :: timestamp) start_date
);

create table rewards.params as (
    select
        -- multiplier when quoted price is exactly 1.000
        5 :: numeric max_price_multiplier,
        -- <= this many bps from 1.000 is eligible
        4 :: numeric eligible_bp_distance,
        -- the lower this is, the more we reward length of time on orderbook
        4 :: numeric time_divisor,
        0 :: numeric rewards_pool
);

create view rewards.usn_reward_multipliers as (
    with multiplier_params as (
        select
            f.maker_account_id,
            abs((f.fill_price :: numeric - const.one_usdc) / 100) as bp_distance,
            greatest(
                1,
                -- hours since order created (up to 24 max)
                least(
                    24,
                    extract(
                        epoch
                        from
                            f.created_at - o.created_at
                    ) / 3600
                ) :: numeric / params.time_divisor
            ) as time_multiplier,
            -- maker buys help maintain the peg so they get a boost
            (not f.is_bid) :: int + 1 as side_multiplier,
            maker_rebate :: numeric / const.one_usdc as rebate_base_amount,
            f.created_at as filled_at
        from
            fill_event f
            inner join order_event o on f.maker_order_id = o.order_id
            cross join rewards.const const
            cross join rewards.params params
        where
            f.market_id = const.usn_usdc_market_id
    )
    select
        *,
        params.max_price_multiplier / rewards.bumper(bp_distance) as price_multiplier
    from
        multiplier_params
        cross join rewards.const const
        cross join rewards.params params
    where
        bp_distance <= params.eligible_bp_distance
);

create view rewards.usn_rewards_calculator as (
    select
        maker_account_id account_id,
        trunc(
            sum(
                price_multiplier * time_multiplier * side_multiplier :: numeric * rebate_base_amount
            ),
            4
        ) points,
        date(filled_at) as reward_date
    from
        rewards.usn_reward_multipliers
    group by
        account_id,
        reward_date
);

create table rewards.parameters_audit (
    max_price_multiplier numeric,
    eligible_bp_distance numeric,
    time_divisor numeric,
    -- in terms of whole number dollars, not decimal-aware
    rewards_pool numeric,
    reward_date date
);

create table rewards.payouts (
    account_id text,
    points numeric,
    payout numeric,
    reward_date date,
    -- if set, means paid. if not, means pending payment
    paid_in_tx_id text default null,
    unique (account_id, reward_date)
);

commit;
