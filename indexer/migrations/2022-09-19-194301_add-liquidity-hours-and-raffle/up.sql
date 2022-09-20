begin
;

create type payout_source as enum('lp', 'raffle');

alter table
    rewards.payouts
add
    -- other value is raffle
    column source payout_source default 'lp';

-- Rollover points are computed in app code using params from from_date.
create table rewards.rollover_points (
    account_id text,
    points numeric,
    from_date date
);

create unique index rollover_points__account_id_from_date on rewards.rollover_points(account_id, from_date);

-- We're doing this in the simplest way possible:
--
-- Points are dollars of liquidity * hours on the book * some multipliers
-- determined by the price, side, etc.
--
-- (dollars of liquidity = amount of USN volume, not dependent on price)
--
-- 1: Liquidity hours is something like the integral of this graph
--
--  ^ open quantity
--  |
--  |----+ fill
--  |    |
--  |    +----+ fill
--  |         |
--  |         +------+ order cancelled
--  |________________|_______________________ time ->
--
create view rewards.usn_rewards_calculator_v2 as (
    with const as (
        select
            1000000000000000000 one_usn
    ),
    limit_order_events as (
        -- table with one row for each event: created, filled, cancelled
        -- along with the decrease in size 
        select
            market_id,
            account_id,
            created_at order_created_at,
            'created' event_type,
            created_at event_ts,
            order_id,
            id order_number,
            quantity original_size,
            null decrement_amount
        from
            order_event
        union
        all
        select
            o.market_id,
            account_id,
            o.created_at order_created_at,
            'filled' event_type,
            f.created_at event_ts,
            o.order_id,
            o.id order_number,
            o.quantity original_size,
            f.fill_qty decrement_amount
        from
            order_event o
            join fill_event f on o.order_id = f.maker_order_id -- only maker volume counts for liquidty points!
        union
        all
        select
            o.market_id,
            account_id,
            o.created_at order_created_at,
            'cancelled' event_type,
            c .created_at event_ts,
            o.order_id,
            o.id order_number,
            o.quantity original_size,
            coalesce(c .cancelled_qty, o.quantity) decrement_amount -- column is null for 2022-09-19 and before
        from
            order_event o
            join cancel_event c on o.order_id = c .order_id
    ),
    -- Liquidity from previous day is counted in rollover_points. Thus, hours
    -- between events maxes out at 24h to avoid double count
    hours_between_events as (
        select
            *,
            least(
                extract(
                    epoch
                    from
                        (event_ts - order_created_at) / 3600
                ),
                24
            ) as hours_between
        from
            limit_order_events
    ),
    dollar_hours_per_day as (
        -- gives dollar_hours *up to 24h previous*
        select
            *,
            date(event_ts) event_date,
            decrement_amount :: numeric * hours_between / const.one_usn dollar_hours
        from
            hours_between_events
            cross join const
    ),
    multipliers as (
        select
            d. *,
            (
                -- 1 if eligible, 0 if not
                exists (
                    select
                    from
                        rewards.eligible_account ea
                    where
                        ea.account_id = d.account_id
                )
            ) :: int eligibility_multiplier,
            params.max_price_multiplier / rewards.bumper(
                abs(
                    (o.limit_price :: numeric - const.one_usdc) / 100
                )
            ) price_multiplier,
            -- buys help maintain the peg so they get 2x boost
            case
                when o.side = 'sell' then 1
                else 2
            end side_multiplier
        from
            dollar_hours_per_day d full
            outer join order_event o on o.id = d.order_number
            join rewards.params params on params.reward_date = event_date
            cross join rewards.const const
    ),
    -- At this point, we _could_ calculate remaining open quantities in sql to
    -- compute rollover points, but since points depend on price as well, the query
    -- becomes complicated. Instead, rollover points are computed in a scheduled job
    -- based on RPC and saved in another table, rewards.rollover_points.
    points_calculator as (
        select
            market_id,
            account_id,
            event_date,
            -- NOTE: the time divisor has been removed, since it has no effect on
            -- the current formula besides scaling
            sum(
                dollar_hours * m.eligibility_multiplier * m.side_multiplier * price_multiplier
            ) points
        from
            multipliers m
        group by
            market_id,
            account_id,
            event_date
    )
    select
        account_id,
        event_date,
        points
    from
        points_calculator
        cross join rewards.const const
    where
        points is not null -- not sure this can happen
        and market_id = const.usn_usdc_market_id
);

with all_points as (
    select
        *,
        sum(points) over(partition by event_date) total_points
    from
        rewards.usn_rewards_calculator_v2
),
shares as (
    select
        *,
        points / total_points share
    from
        all_points
)
select
    account_id,
    event_date,
    trunc(points, 4) points,
    trunc(total_points, 4) total_points,
    trunc(share * 100, 4) share
from
    shares
where
    event_date = '2022-09-19'
order by
    points desc
limit
    500;

rollback;