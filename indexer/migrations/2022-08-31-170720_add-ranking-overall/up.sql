-- Creates the views for leaderboard rankings. Adjust the `competition.const`
-- table to run for different competitions.
begin
;

create
or replace function competition.unwrap_or(val numeric, def numeric) returns numeric language sql immutable return case
    when val is null then def
    else val
end;

-- create a view per-account volumes by market. this is the basis for all rankings.
create view competition.quote_volume as (
    select
        o.account_id,
        f.market_id,
        sum(f.quote_qty :: numeric) market_volume
    from
        fill_event f
        join order_event o on f.maker_order_id = o.order_id
        or f.taker_order_id = o.order_id
        left join nft.nft_holder nft on nft.account_id = f.maker_account_id
        or nft.account_id = f.taker_account_id
        cross join competition.const
    where
        o.account_id not in (
            select
                account_id
            from
                competition.excluded_account
        )
        and f.created_at between competition.const.start_ts
        and competition.const.end_ts
    group by
        o.account_id,
        f.market_id
);

-- Volume per market per user
create view competition.volume_per_market as (
    select
        race,
        account_id,
        v.market_id market_id,
        sum(market_volume / e.one_quote) market_volume
    from
        competition.quote_volume v
        join competition.eligible_market e on e.market_id = v.market_id
    group by
        race,
        account_id,
        v.market_id
);

-- Total volume by user per race
create view competition.tvpur as (
    select
        race,
        account_id,
        sum(market_volume) as total_volume
    from
        competition.volume_per_market
    group by
        race,
        account_id
);

-- total volume per market joined to total volume per user
create view competition.tpm as (
    select
        competition.tvpur.race,
        competition.tvpur.account_id,
        competition.volume_per_market.market_id,
        competition.volume_per_market.market_volume,
        competition.tvpur.total_volume
    from
        competition.tvpur
        join competition.volume_per_market on competition.tvpur.account_id = competition.volume_per_market.account_id
        and competition.tvpur.race = competition.volume_per_market.race
);

-- tpm after multiplier
create view competition.tpum as (
    select
        competition.tpm. *,
        competition.unwrap_or(nft.n_held, 0) n_held,
        competition.unwrap_or(nft.multiplier, 1) multiplier,
        (
            competition.unwrap_or(nft.multiplier, 1) * competition.tpm.total_volume
        ) after_multiplier
    from
        competition.tpm
        left join nft.nft_holder nft on nft.account_id = competition.tpm.account_id
);

-- Create rankings as materialized view. Clients can use the `race` column to
-- distinguish between different races (eg, 'usdc' or 'stable') if there are
-- more than one.
create materialized view competition.ranking_overall as (
    select
        dense_rank() over(
            partition by race
            order by
                tpum.after_multiplier desc,
                tpum.account_id
        ) as overall_rank,
        *
    from
        competition.tpum
);

-- Create index so that materialized view can be refreshed concurrently
create unique index ranking_overall_refresh on competition.ranking_overall(account_id, market_id);

commit;