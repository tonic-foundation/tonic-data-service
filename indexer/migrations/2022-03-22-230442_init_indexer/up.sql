-- Your SQL goes here
--
-- indexer events
--
create table if not exists market_event (
    id serial primary key,

    receipt_id text not null,
    created_at timestamp default current_timestamp,

    market_id text not null,
    base_token_id text not null,
    quote_token_id text not null
);

create index market_event__receipt_id on market_event(receipt_id);

create table if not exists order_event (
    id serial primary key,

    receipt_id text not null,
    created_at timestamp default current_timestamp,

    order_id text not null,
    market_id text not null,
    -- user_id text not null,
    limit_price text not null,
    quantity text not null,
    side text not null,
    order_type text not null
);

create index order_event__receipt_id on order_event(receipt_id);

create table if not exists fill_event (
    id serial primary key,

    receipt_id text not null,
    created_at timestamp default current_timestamp,

    market_id text not null,
    maker_order_id text not null,
    -- maker_user_id text not null,
    taker_order_id text not null,
    -- taker_user_id text not null,
    fill_qty text not null,
    fill_price text not null,
    quote_qty text not null,
    taker_fee text not null,
    maker_rebate text not null
);

create index fill_event__receipt_id on fill_event(receipt_id);

-- for recent trades
create index fill_event__market_id__created_at on fill_event(market_id, created_at);

create table if not exists cancel_event (
    id serial primary key,

    receipt_id text not null,
    created_at timestamp default current_timestamp,

    market_id text not null,
    order_id text not null,
    refund_amount text not null,
    refund_token text not null
);

create index cancel_event__receipt_id on cancel_event(receipt_id);

--
-- "hard objects"
--
create table if not exists nep_141_token (
    id varchar(64) primary key,
    spec text default 'ft-1.0.0',
    name text not null,
    symbol text not null,
    decimals smallint not null,
    icon text,
    reference text,
    reference_hash text,
    created_at timestamp default current_timestamp
);

create table if not exists market (
    id text primary key,
    symbol text not null,
    base_decimals smallint not null,
    quote_decimals smallint not null,
    base_token_id varchar(64) references nep_141_token(id),
    quote_token_id varchar(64) references nep_141_token(id),
    created_at timestamp default current_timestamp
);

create index market__symbol on market(symbol);

--
-- views
--
create
or replace view tv_market as
select
    m.id as market_id,
    m.symbol as market_symbol,
    b.decimals as base_decimals,
    q.decimals as quote_decimals
from
    market as m
    join nep_141_token as b on m.base_token_id = b.id
    join nep_141_token as q on m.quote_token_id = q.id;


--
-- triggers
--
create or replace function publish_event_to_channel()
returns trigger
as $$
begin
    perform pg_notify(tg_argv[0]::text, row_to_json(new)::text);
    return new;
end;
$$ language plpgsql;

create trigger publish after insert on market_event
for each row execute function publish_event_to_channel('market');

create trigger publish after insert on order_event
for each row execute function publish_event_to_channel('order');

create trigger publish after insert on fill_event
for each row execute function publish_event_to_channel('fill');

create trigger publish after insert on cancel_event
for each row execute function publish_event_to_channel('cancel');
