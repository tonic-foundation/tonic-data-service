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
-- More in detail, the way to operate a rewards program is
--   1. Set parameters (start date, eligible spread bps, multipliers, etc)
--      - yarn ts-node scripts/rewards/init-program.ts
--   2. At the start of day,
--      i.   Set the day's rewards pool (yarn ts-node scrips/rewards/set-params.ts)
--      ii.  Compute the previous day's payouts in app code and save (yarn ts-node scrips/rewards/update-payouts.ts)
--           - This script runs in a transaction and the payouts table has a
--             unique index to prevent duplicate payouts per day, so it's safe
--             to re-run this if it fails for some reason.
--      iii. Save previous day's parameters in the audit table (happens automatically in the update-payouts script)
--      iv.  Optional: update multipliers (see i.)
begin
;

create schema rewards;

grant usage on schema rewards to readonly;

alter default privileges in schema rewards grant
select
    on tables to readonly;

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
        date('1970-01-01') start_date,
        date('1970-01-01') end_date
);

-- parameters for computing points, total prize pool, etc
create table rewards.params (
    id serial primary key,
    reward_date date,
    max_price_multiplier numeric default 5,
    -- <= this many bps from 1.000 is eligible
    eligible_bp_distance numeric default 4,
    -- the lower this is, the more we reward length of time on orderbook
    time_divisor numeric default 4,
    rewards_pool numeric default 0
);

create unique index params_date on rewards.params(reward_date);

-- if you're not in this table, your points go to 0
create table rewards.signup (account_id text not null, unique(account_id));

create view rewards.eligible_account as (
    select
        s.account_id
    from
        rewards.signup s
        join nft.nft_holder h on s.account_id = h.account_id
    where
        h.n_held > 0
);

create view rewards.point_multipliers as (
    with fills_by_date as (
        select
            *,
            date(created_at) reward_date
        from
            fill_event
    ),
    multiplier_params as (
        select
            f.maker_account_id,
            (
                exists (
                    select
                    from
                        rewards.eligible_account ea
                    where
                        ea.account_id = f.maker_account_id
                )
            ) :: int eligibility_multiplier,
            abs((f.fill_price :: numeric - const.one_usdc) / 100) as bp_distance,
            greatest(
                1,
                -- Time-based points boost. The longer the order was on the
                -- book, the larger the boost, up to 24h.
                --
                -- Starts at 1, caps at 24 / params.time_divisor
                least(
                    24,
                    extract(
                        epoch
                        from
                            f.created_at - o.created_at
                    ) / 3600
                ) :: numeric / params.time_divisor
            ) as time_multiplier,
            -- Resting bids help maintain the peg so they get a 2x boost.
            -- (is_bid == false) -> 0 + 1
            -- (is_bid == true) -> 1 + 1
            (not f.is_bid) :: int + 1 as side_multiplier,
            fill_qty :: numeric / const.one_usn as points_base,
            f.reward_date
        from
            fills_by_date f
            inner join order_event o on f.maker_order_id = o.order_id
            cross join rewards.const const
            join rewards.params params on params.reward_date = f.reward_date
        where
            f.market_id = const.usn_usdc_market_id
    )
    select
        maker_account_id,
        eligibility_multiplier,
        bp_distance,
        time_multiplier,
        side_multiplier,
        points_base,
        mp.reward_date,
        -- the closer your were to midmarket, the more points you get
        params.max_price_multiplier / rewards.bumper(bp_distance) as price_multiplier
    from
        multiplier_params mp
        cross join rewards.const const
        join rewards.params params on params.reward_date = mp.reward_date
    where
        bp_distance <= params.eligible_bp_distance
);

create view rewards.usn_rewards_calculator as (
    select
        maker_account_id account_id,
        trunc(
            sum(
                eligibility_multiplier * price_multiplier * time_multiplier * side_multiplier :: numeric * points_base
            ),
            4
        ) points,
        reward_date
    from
        rewards.point_multipliers
    group by
        account_id,
        reward_date
);

create table rewards.payouts (
    account_id text,
    points numeric,
    payout numeric,
    reward_date date,
    -- if set, means paid. if not, means pending payment
    paid_in_tx_id text default null,
    unique(account_id, reward_date)
);

commit;