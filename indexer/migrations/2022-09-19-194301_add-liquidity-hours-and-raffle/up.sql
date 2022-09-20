-- v2: Points are usn amount * hours on the book * some multipliers determined
-- by the price, side, etc.
--
-- This is actually almost the same as v1, but includes the concept of rollover
-- points for portion of order still open at the end of the day
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
create table rewards.rollover_orders (
    account_id text,
    order_id text,
    open_quantity text,
    hours_on_book numeric,
    points numeric,
    from_date date
);

create unique index rollover_points__account_id_from_date on rewards.rollover_orders(account_id, order_id, from_date);

create view rewards.rollover_points as (
    select
        account_id,
        from_date,
        sum(points) points
    from
        rewards.rollover_orders
    group by
        account_id,
        from_date
);

-- note: this only includes fills *when you're the maker*
-- so it's not generally usable as an "order reduction events" table
--
-- roughly, the way we compute points is: every time an order decreases for
-- eligible causes (cancel, filled by a taker), we compute:
--
--   liquidity hours = decrement amount * hours on book 
--
-- apply some multipliers and that's the points
create view rewards.points_v2_inputs as (
    with limit_order_events as (
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
            limit_price,
            side as original_side,
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
            o.limit_price,
            o.side as original_side,
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
            o.limit_price,
            o.side as original_side,
            o.quantity original_size,
            coalesce(c .cancelled_qty, o.quantity) decrement_amount -- column is null for 2022-09-19 and before
        from
            order_event o
            join cancel_event c on o.order_id = c .order_id
    ) -- Liquidity from previous day is counted in rollover_points. Thus, hours
    -- between events maxes out at 24h to avoid double count
    select
        o. *,
        date(event_ts) event_date,
        least(
            extract(
                epoch
                from
                    (event_ts - order_created_at) / 3600
            ),
            24
        ) as hours_on_book
    from
        limit_order_events o
        cross join rewards.const const
    where
        -- this speeds things up tremendously. reason: everything is done with
        -- partitions on event_date, but we only have index for timestamp, so
        -- we have to do full scan. this constraint lets us use the timestamp
        -- index first to reduce the amount we have to scan
        event_ts > const.start_date
);

create view rewards.usn_liquidity_hours as (
    select
        o. *,
        -- total for this order in this market
        sum(
            decrement_amount :: numeric / const.one_usn * hours_on_book
        ) over (partition by market_id, order_id) total_usn_hours
    from
        rewards.points_v2_inputs o
        cross join rewards.const const
    where
        market_id = const.usn_usdc_market_id
);

create function rewards.calculate_points_v2 (
    limit_price numeric,
    amount numeric,
    hours_on_book numeric,
    side text,
    event_type text,
    eligible_bp_distance numeric,
    max_price_multiplier numeric,
    fill_multiplier numeric
) returns numeric as $$ with distance as (
    -- bps from mid-market
    select
        abs(
            (limit_price - const.one_usdc) / 100
        ) bp_distance
    from
        rewards.const const
),
multipliers as (
    select
        case
            when bp_distance > eligible_bp_distance then 0
            else max_price_multiplier / rewards.bumper(bp_distance)
        end price_multiplier,
        -- usn bids help maintain the peg so they get 2x boost
        case
            when side = 'buy' then 2
            else 1
        end side_multiplier,
        -- fills get slight boost
        case
            when event_type = 'filled' then coalesce(fill_multiplier, 1)
            else 1
        end fill_multiplier
    from
        distance
        cross join rewards.const const
)
select
    -- dollar hours x multipliers
    -- divide by 1 usn
    -- divide by 100 because the points add up too quickly without...
    --
    -- for scale, about 10 dollar bid liquidity at 1.0000 for the day would be
    -- 10 * 24 * 5 * 2 * 1 = 2400 (points seem meaningless) scaled down it would
    -- be 24
    --
    -- for some reason, a cross join on rewards here slows things to a crawl, so one_usn is hard coded...
    amount * hours_on_book * price_multiplier * side_multiplier * fill_multiplier / 1000000000000000000 / 100 points
from
    multipliers;

$$ language sql;

-- this gets new points earned today. does not account for rollover points
create view rewards.usn_rewards_calculator_v2 as (
    with multipliers as (
        select
            *,
            (
                -- 1 if eligible, 0 if not
                exists (
                    select
                    from
                        rewards.eligible_account e
                    where
                        e.account_id = o.account_id
                )
            ) eligible
        from
            rewards.points_v2_inputs o
    ),
    points_calculator as (
        select
            market_id,
            account_id,
            event_date,
            -- NOTE: the time divisor has been removed, since it has no effect on
            -- the current formula besides scaling
            sum(
                rewards.calculate_points_v2(
                    limit_price :: numeric,
                    decrement_amount :: numeric,
                    hours_on_book,
                    original_side,
                    event_type,
                    p.eligible_bp_distance,
                    p.max_price_multiplier,
                    p.fill_multiplier
                ) -- dollar_hours * m.eligibility_multiplier * m.side_multiplier * price_multiplier
            ) points
        from
            multipliers m
            join rewards.params p on m.event_date = p.reward_date
        where
            eligible
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

-- gets shares claimed today, accounting for rollover points
create view rewards.shares_v2 as (
    with daily_total_points as (
        select
            urc. *,
            coalesce(rp.points, 0) rollover_points,
            -- all traders
            sum(urc.points + coalesce(rp.points, 0)) over(partition by event_date) total_points
        from
            rewards.usn_rewards_calculator_v2 urc full
            outer join rewards.rollover_points rp on urc.account_id = rp.account_id
            and rp.from_date = date(urc.event_date - interval '1 day')
    ),
    shares as (
        select
            *,
            -- your points / all points
            (points + rollover_points) / total_points share
        from
            daily_total_points dtp
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

end;