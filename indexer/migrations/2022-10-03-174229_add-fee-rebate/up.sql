-- Your SQL goes here
begin
;

create schema fee_rebates;

grant usage on schema fee_rebates to readonly;

alter default privileges in schema fee_rebates grant
select
    on tables to readonly;

create table fee_rebates.params as (
    select
        '2022-10-01' :: date start_date,
        '2022-10-31' :: date end_date
);

-- eligible fees are taker fee - referrer rebate in markets denominated in a
-- stable quote currency
create view fee_rebates.eligible_fees_daily as with stables as (
    select
        *,
        pow(10, decimals) denomination
    from
        nep_141_token
    where
        stable
),
eligible_markets as (
    select
        m.id,
        m.symbol ticker,
        s.symbol quote_symbol,
        s.denomination quote_denomination
    from
        market m
        join stables s on m.quote_token_id = s.id
),
fees_human as (
    select
        o.account_id,
        o.market_id,
        ticker,
        o.created_at fee_collected_at,
        -- useful later
        date(o.created_at) fee_date,
        o.taker_fee :: numeric / m.quote_denomination gross_taker_fee,
        (
            o.taker_fee :: numeric - o.referrer_rebate :: numeric
        ) / m.quote_denomination net_taker_fee
    from
        order_event o
        join eligible_markets m on o.market_id = m.id
    where
        taker_fee != '0'
)
select
    account_id,
    fee_date,
    -- total taker fee
    sum(gross_taker_fee) :: numeric gross,
    -- taker fee - referrer rebate
    sum(net_taker_fee) :: numeric net
from
    fees_human
group by
    account_id,
    fee_date
order by
    fee_date desc,
    net desc;

-- records of paid rebates
create table fee_rebates.rebates (
    account_id text,
    -- human readable USD
    amount numeric,
    paid_in_tx_id text,
    paid_at timestamp default now()
);

create view fee_rebates.rebate_summary as with total_paid as (
    select
        account_id,
        sum(amount) total_paid
    from
        fee_rebates.rebates
    group by
        account_id
),
total_eligible as (
    select
        account_id,
        sum(net) total_eligible
    from
        fee_rebates.eligible_fees_daily
        cross join fee_rebates.params p
    where
        fee_date >= p.start_date
        and fee_date <= p.end_date
    group by
        account_id
),
combined as (
    select
        te.account_id,
        trunc(coalesce(total_paid, 0), 2) total_paid,
        trunc(coalesce(total_eligible, 0), 2) total_eligible
    from
        total_eligible te full
        outer join total_paid tp on te.account_id = tp.account_id
)
select
    account_id,
    total_paid,
    total_eligible,
    greatest(total_eligible - total_paid, 0) outstanding
from
    combined;

end;