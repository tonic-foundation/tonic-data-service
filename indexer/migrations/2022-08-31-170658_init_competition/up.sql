create schema competition;

create table competition.const as (
    select
        -- timestamps in utc
        '2022-07-12 16:00:00' :: timestamp start_ts,
        '2022-08-26 16:00:00' :: timestamp end_ts
);

create table competition.excluded_account (account_id text primary key);

create table competition.eligible_market (
    market_id text primary key,
    race text not null,
    -- for convenience, each market contains the size of one unit of its quote token
    one_quote numeric not null
);