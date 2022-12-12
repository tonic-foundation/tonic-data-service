-- v3: Points are base quantity * hours on the book * multiplier based on price.
--
-- Daily rollover has been removed! Hours cap at 24, you must cancel for
-- yourself to receive points.
begin
;

create table rewards.const_v3 as (
    select
        date('2022-10-01') start_date
);

create table rewards.eligible_market_v3 (
    symbol text not null,
    market_id text not null,
    unique(market_id)
);

insert into
    rewards.eligible_market_v3
select
    symbol,
    id market_id
from
    market
where
    symbol like '%usdc';

-- There's no payout v2 because we didn't make a new one for leaderboard v2.
-- Going forward, all versions will match.
create table rewards.payout_v3 as (
    select
        *,
        -- migrate the usn/usdc lp payouts
        -- nb: fee rebates are in the fee_rebates schema; this schema will only
        -- be for lp rewards and likely should be renamed to lp_rewards
        (
            select
                id
            from
                market
            where
                symbol = 'usn/usdc'
        ) market_id
    from
        rewards.payouts
);

alter table
    rewards.payout_v3
add
    constraint payout_uniqueness unique(account_id, reward_date, market_id, source);

create table rewards.params_v3 (
    id serial primary key,
    for_date date,
    -- it's more convenient denormalized
    symbol text,
    -- which market is it for
    market_id text,
    max_price_rank_multiplier numeric default 5,
    max_eligible_price_rank numeric default 25,
    rewards_pool numeric default 0
);

alter table
    rewards.params_v3
add
    constraint params_uniqueness unique(for_date, market_id);

create view rewards.points_v3_input as (
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
            price_rank original_price_rank,
            price_rank,
            -- taker fills don't count so regardless of what the posted quantity
            -- is, the decrement amount is 0
            '0' decrement_amount
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
            o.price_rank original_price_rank,
            f.maker_price_rank price_rank,
            -- this is ok: guarantee this is for maker order only
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
            o.price_rank original_price_rank,
            c .price_rank price_rank,
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
                    (
                        -- unlike v2, there are no rollover points in v3.
                        -- calculation simply maxes out at 24 prior to the event
                        event_ts - order_created_at
                    ) / 3600
            ),
            24
        ) as eligible_hours_on_book
    from
        limit_order_events o
    where
        market_id in (
            select
                market_id
            from
                rewards.eligible_market_v3
        )
        and event_ts > (
            select
                start_date
            from
                rewards.const_v3
        )
);

create view rewards.liquidity_hours_v3 as with worse_price_rank as (
    select
        input. *,
        -- we use the worse of the two price ranks (rank when created vs rank
        -- when size decreased)
        greatest(
            coalesce(price_rank, -1),
            coalesce(original_price_rank, -1)
        ) worse_price_rank
    from
        rewards.points_v3_input input
)
select
    account_id,
    input.market_id,
    input.order_id,
    input.event_date,
    -- liquidity hours contribution for this event
    decrement_amount :: numeric / base_denomination * eligible_hours_on_book liquidity_hours,
    -- price rank multiplier for this event
    case
        -- <0 -> it wasn't posted at all
        -- =0 -> it was the first price level on the book
        -- >0 -> it was worse than the first price level on the book
        when worse_price_rank >= 0 -- prevent subtraction overflow
        and worse_price_rank < params.max_eligible_price_rank then params.max_price_rank_multiplier * (
            params.max_eligible_price_rank - worse_price_rank
        ) / (params.max_price_rank_multiplier)
        else 0
    end price_rank_multiplier
from
    worse_price_rank input
    join market_with_denomination m on input.market_id = m.id
    join rewards.params_v3 params on input.event_date = params.for_date
    and input.market_id = params.market_id;

create
or replace function rewards.get_lp_shares_v3(_symbol text, _date date) returns table (
    account_id text,
    account_liquidity_hours float,
    total_liquidity_hours float,
    share float
) language plpgsql as $$ begin
    return query with liquidity_hours as (
        select
            l.account_id,
            sum(l.liquidity_hours * l.price_rank_multiplier) account_liquidity_hours
        from
            rewards.liquidity_hours_v3 l
        where
            exists (
                select
                    from
                rewards.eligible_account ea
                    where
                ea.account_id = l.account_id
            )
            and market_id = (
                select
                    market_id
                from
                    rewards.eligible_market_v3
                where
                    symbol = _symbol
            )
            and event_date = _date
        group by
            l.account_id
    ),
    total as (
        select
            *,
            sum(l.account_liquidity_hours) over () total_liquidity_hours
        from
            liquidity_hours l
        where
            l.account_liquidity_hours > 0
    )
    select
        t. *,
        t.account_liquidity_hours / t.total_liquidity_hours share
    from
        total t;

end $$;

create
or replace function rewards.get_lp_rewards_v3(_symbol text, _date date) returns table (
    account_id text,
    account_liquidity_hours float,
    total_liquidity_hours float,
    share float,
    shares_sum float,
    reward float
) language plpgsql as $$ begin
    return query with lp_rewards as (
        select
            s. *,
            sum(s.share) over () shares_sum,
            s.share * params.rewards_pool reward
        from
            rewards.get_lp_shares_v3(_symbol, _date) s
            join rewards.params_v3 params on for_date = _date
            and params.symbol = _symbol
    )
    select
        *
    from
        lp_rewards
    order by
        reward desc;

end $$;

end;
