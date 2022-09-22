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

-- Fills get a slight boost under the new system.
alter table
    rewards.params
add
    column fill_multiplier numeric default 1;

-- Rollover points are computed using calculate_points_v2 (query is sent from
-- app code)
--
-- Since we get rollover orders using RPC, a few extra fields are saved here for
-- auditability.
--
-- (We could technically compute remaining order size in SQL; it's not that
-- hard, but it is very slow)
create table rewards.rollover_orders (
    account_id text,
    order_id text,
    open_quantity text,
    hours_on_book numeric,
    points numeric,
    from_date date
);

create unique index rollover_points__account_id_from_date on rewards.rollover_orders(account_id, order_id, from_date);

-- convenience view makes rollover points easier to include in the day's shares
create view rewards.rollover_points as (
    select
        account_id,
        date(from_date + interval '1 day') qualifying_date,
        sum(points) points
    from
        rewards.rollover_orders
    group by
        account_id,
        from_date
);

-- Make a single view for all the inputs for live points computation.
--
-- roughly, the way we compute points is: every time an order decreases for
-- eligible causes (cancel, filled by a taker), we compute:
--
--   liquidity hours = decrement amount * hours on book * multipliers
--
-- at the end of the day, orders that are still open are rolled over in a cron
-- job (see rewards.rollover_orders)
--
-- note: this only includes fills *when you're the maker*. your own taker volume
-- doesn't contribute points
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

-- currently unused, but gives liquidity hours per order
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

-- used in both the leaderboard here and the cron job for rollover points
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
    -- divide by 100 because the points add up too quickly if you don't scale,
    -- and they start to feel meaningless
    --
    -- for example, 10 $USN resting bid at 1.0000 for the day would be 10 * 24 *
    -- 5 * 2 * 1 = 2400 points. Most people are placing bigger orders and
    -- getting filled; eg., top trader from 2022-09-19 had around 300k points.
    -- Scaling down makes each point feel a bit more substantial.
    --
    -- for some reason, a cross join on rewards here slows things to a crawl, so one_usn is hard coded...
    coalesce(
        amount * hours_on_book * price_multiplier * side_multiplier * fill_multiplier / 1000000000000000000 / 100,
        0
    ) points
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
                )
            ) points
        from
            multipliers m
            join rewards.params p on m.event_date = p.reward_date
        where
            eligible -- this used to be a multiplier but is a boolean now
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
        market_id = const.usn_usdc_market_id
);

-- get shares for a given day, accounting for rollover points from the previous
create view rewards.shares_v2 as (
    with qualifying_points as (
        select
            account_id,
            0 points,
            points rollover_points,
            qualifying_date event_date
        from
            rewards.rollover_points
        union
        select
            account_id,
            points,
            0 rollover_points,
            event_date
        from
            rewards.usn_rewards_calculator_v2
    ),
    daily_total_points as (
        select
            event_date,
            sum(points + rollover_points) all_traders_points
        from
            qualifying_points
        group by
            event_date
    ),
    trader_points as (
        select
            account_id,
            event_date,
            sum(points) earned_points,
            sum(rollover_points) rollover_points
        from
            qualifying_points
        group by
            account_id,
            event_date
    ),
    shares as (
        select
            t. *,
            d.all_traders_points,
            (earned_points + rollover_points) / all_traders_points share
        from
            daily_total_points d
            join trader_points t on d.event_date = t.event_date
    )
    select
        account_id,
        event_date,
        trunc(earned_points, 4) earned_points,
        trunc(rollover_points, 4) rollover_points,
        trunc(earned_points + rollover_points, 4) points,
        trunc(all_traders_points, 4) all_traders_points,
        trunc(share, 4) share
    from
        shares
    where
        share > 0
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