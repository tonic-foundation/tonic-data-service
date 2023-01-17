-- v4: Points are base quantity * hours on the book / factor based on price bp from midmarket.
--
-- Daily rollover has been removed! Hours cap at 24, you must cancel for
-- yourself to receive points.
--
-- Daily parameters and eligible markets have been removed!
-- It's up to the app code to decide which markets to include/what price cutoffs to use.
--
-- Liquidity is counted within 2% of midmarket.
-- Liquidity gets less valuable with the cube of distance from midmarket.
-- Past 2%, your liquidity is worth 0.
begin
;

create
or replace function rewards.to_decimal(_v numeric, _decimals integer) returns float as $$
select
    _v / POW(10, _decimals);

$$ language sql;

create
or replace function rewards.bp_distance(_a numeric, _b numeric) returns float as $$
select
    (_a - _b) / _a * 10000 $$ language sql;

-- get midmarket price at the time an order was placed.
-- if bids were empty, returns the best ask price.
-- if asks were empty, returns the best bid price.
-- best price is emitted *after* the orderbook is mutated by the new order.
-- so if ob was: [ASKS 7 6 5] [BIDS 3 2 1]
-- and the new order is buy@4, then best ask will be 5 and best bid will be *3*
create
or replace function rewards.midmarket_price_native(best_bid numeric, best_ask numeric) returns numeric as $$
select
    case
        when best_ask is null
        and best_bid is null then null
        when best_ask is null then best_bid
        when best_bid is null then best_ask
        else (best_bid + best_ask) / 2
    end midmarket_price_native;

$$ language sql;

create
or replace function rewards.is_eligible_account_v4(_account_id text, _symbol_unused text) returns boolean language plpgsql as $$ begin
    return case
        when _account_id like '%.cellfi-prod.near' then true
        when _account_id like 'tng%' then true
        else exists (
            select
            from
                rewards.eligible_account ea
            where
                ea.account_id = _account_id
        )
    end eligible;

end $$;

-- migrate from v3
create table if not exists rewards.payout_v4 as (
    select
        *
    from
        rewards.payout_v3
);

-- daily params/per-market params removed
-- 'created' event removed (unused)
create
or replace function rewards.get_points_v4_input(_symbol text, _date date) returns table (
    market_id text,
    account_id text,
    order_created_at timestamp,
    event_type text,
    event_ts timestamp,
    order_id text,
    order_number integer,
    original_limit_price float,
    original_side text,
    original_size float,
    original_bp_distance float,
    bp_distance float,
    decrement_amount float,
    eligible_hours_on_book numeric
) language plpgsql as $$ begin
    return query with limit_order_events as (
        select
            m.market_id,
            m.account_id,
            m.created_at order_created_at,
            'filled' event_type,
            f.created_at event_ts,
            m.order_id,
            m.id order_number,
            rewards.to_decimal(m.limit_price :: numeric, market.quote_decimals) original_limit_price,
            m.side as original_side,
            rewards.to_decimal(m.quantity :: numeric, market.base_decimals) original_size,
            -- note: it is impossible for best_bid and best_ask to both be null
            -- at fill time, and impossible for both to be null when an order
            -- posts. ie, midmarket price will never be null if there is a fill.
            -- maker order at time it was placed
            rewards.bp_distance(
                rewards.midmarket_price_native(m.best_bid :: numeric, m.best_ask :: numeric),
                m.limit_price :: numeric
            ) original_bp_distance,
            -- maker order at time it was traded against. necessarily 0 because
            -- the order executed
            0 bp_distance,
            -- is it better to use 
            -- rewards.bp_distance(
            --     rewards.midmarket_price_native(t.best_bid :: numeric, t.best_ask :: numeric),
            --     f.fill_price :: numeric
            -- ) bp_distance,
            -- this is ok: guarantee this is for maker order only
            rewards.to_decimal(f.fill_qty :: numeric, market.base_decimals) decrement_amount
        from
            fill_event f
            join order_event m on m.order_id = f.maker_order_id
            join order_event t on t.order_id = f.taker_order_id
            join market on market.symbol = _symbol
            and market.id = m.market_id
        where
            f.created_at between _date
            and _date + interval '1 day'
        union
        all
        select
            o.market_id,
            o.account_id,
            o.created_at order_created_at,
            'cancelled' event_type,
            c .created_at event_ts,
            o.order_id,
            o.id order_number,
            rewards.to_decimal(o.limit_price :: numeric, market.quote_decimals) original_limit_price,
            o.side as original_side,
            rewards.to_decimal(o.quantity :: numeric, market.base_decimals) original_size,
            -- similar to above: it's impossible for original midmarket price to be
            -- null if order posted, and impossible to be null if cancelled
            rewards.bp_distance(
                rewards.midmarket_price_native(o.best_bid :: numeric, o.best_ask :: numeric),
                o.limit_price :: numeric
            ) original_bp_distance,
            rewards.bp_distance(
                rewards.midmarket_price_native(c .best_bid :: numeric, c .best_ask :: numeric),
                o.limit_price :: numeric
            ) bp_distance,
            rewards.to_decimal(
                coalesce(c .cancelled_qty, o.quantity) :: numeric,
                market.base_decimals
            ) decrement_amount -- column is null for 2022-09-19 and before
        from
            order_event o
            join cancel_event c on o.order_id = c .order_id
            join market on market.symbol = _symbol
            and market.id = o.market_id
        where
            c .created_at between _date
            and _date + interval '1 day'
    )
    select
        o. *,
        least(
            extract(
                epoch
                from
                    (
                        -- unlike v2, there are no rollover points in v3/v4.
                        -- calculation simply maxes out at 24 prior to the event
                        o.event_ts - o.order_created_at
                    ) / 3600
            ),
            24
        ) as eligible_hours_on_book
    from
        limit_order_events o;

end $$;

create
or replace function rewards.get_liquidity_hours_v4(_symbol text, _date date) returns table (
    account_id text,
    market_id text,
    order_id text,
    liquidity_hours float,
    price_multiplier float
) language plpgsql as $$ begin
    return query with worse_distance as (
        select
            *,
            -- we use the worse of the two bp distances (dist when created vs dist
            -- when size decreased)
            greatest(
                coalesce(abs(bp_distance), -1),
                coalesce(abs(original_bp_distance), -1)
            ) worse_bp_distance
        from
            rewards.get_points_v4_input(_symbol, _date)
    )
    select
        wd.account_id,
        wd.market_id,
        wd.order_id,
        -- liquidity hours contribution for this event
        wd.decrement_amount * wd.eligible_hours_on_book liquidity_hours,
        case
            -- Counted within 2% of midmarket.
            -- Liquidity gets less valuable with the cube of distance from midmarket.
            -- Past 2%, your liquidity is worth 0.
            when wd.worse_bp_distance is not null
            and wd.worse_bp_distance < 2000 then POW((2000 - wd.worse_bp_distance) / 2000, 3)
            else 0
        end price_multiplier
    from
        worse_distance wd
        join market_with_denomination m on wd.market_id = m.id;

end $$;

create
or replace function rewards.get_lp_shares_v4(_symbol text, _date date) returns table (
    market_id text,
    account_id text,
    account_liquidity_hours float,
    total_liquidity_hours float,
    share float
) language plpgsql as $$ begin
    return query with liquidity_hours as (
        select
            l.market_id,
            l.account_id,
            sum(l.liquidity_hours * l.price_multiplier) account_liquidity_hours
        from
            rewards.get_liquidity_hours_v4(_symbol, _date) l
        where
            rewards.is_eligible_account_v4(l.account_id, 'unused')
        group by
            l.market_id,
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

end;