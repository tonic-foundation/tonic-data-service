begin
;

create type rewards.payout_source as enum('lp_reward', 'raffle');

-- We'll sometimes do raffles to drive DAUs. Raffle payouts will show in the
-- payout history view. A flag to differentiate raffles and LP rewards lets
-- us do more with the UI.
alter table
    rewards.payouts
add
    column source rewards.payout_source default 'lp_reward';

-- Fills will get a slight boost under the new system. for audit reasons,
-- previous days will have default 1
alter table
    rewards.params
add
    column fill_multiplier numeric default 1;

-- Rollover points are computed in app code using params from from_date.
-- They're basically liquidity hours for the portion of orders still open at the
-- end of the day (ie, not filled or cancelled), which carry over to the next
-- day. The formula in app code matches that in usn_rewards_calculator_v2. We do
-- this per-day segmentation because we do daily payouts. The reason for
-- carrying over to the next day instead of applying to the current day is that
-- the live leaderboard can't account for rollover points until the day ends,
-- which could cause a jump in points. Applying it to the next day makes the
-- payouts more predictable for the user.
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

create view rewards.shares_v2 as (
    with daily_total_points as (
        select
            urc. *,
            sum(urc.points) over(partition by event_date) total_points
        from
            rewards.usn_rewards_calculator_v2 urc full
            outer join rewards.rollover_points rp on urc.account_id = rp.account_id
            and rp.from_date = date(urc.event_date - interval '1 day')
    ),
    shares as (
        select
            *,
            points / total_points share
        from
            daily_total_points
    )
    select
        account_id,
        event_date,
        trunc(points, 4) points,
        trunc(total_points, 4) total_points,
        trunc(share * 100, 4) share
    from
        shares
);

create view rewards.leaderboard_v2 as (
    select
        dense_rank() over (
            partition by event_date
            order by
                points desc
        ) ranking,
        *
    from
        rewards.shares_v2
);

-- function for returning points given inputs and a date. used in the points
-- calculator, but also used by the rollover points script to ensure that
-- rollover points are computed the same way as normal points
create function rewards.calculate_points_v2(
    limit_price numeric,
    amount numeric,
    hours_on_book numeric,
    side text,
    event_type text,
    params_date date
) returns numeric as $$ with asdf as (
    with multipliers as (
        select
            params.max_price_multiplier / rewards.bumper(
                abs(
                    (limit_price - const.one_usdc) / 100
                )
            ) price_multiplier,
            -- buys help maintain the peg so they get 2x boost
            case
                when side = 'sell' then 1
                else 2
            end side_multiplier,
            case
                when event_type = 'filled' then params.fill_multiplier
                else 1
            end fill_multiplier
        from
            rewards.params
            cross join rewards.const const
        where
            reward_date = params_date
    )
    select
        hours_on_book * amount * price_multiplier * side_multiplier * fill_multiplier
    from
        multipliers
)
select
    *
from
    asdf;

$$ language sql;

-- select
--     *
-- from
--     rewards.leaderboard_v2
-- where
--     event_date = '2022-09-19';
select
    *,
    rewards.calculate_points_v2(1, 1, 1, 'sell', 'cancelled', '2022-09-20') foo
from
    rewards.shares_v2
where
    event_date = current_date
order by
    share desc;

rollback;