-- Your SQL goes here
alter table fill_event drop column taker_fee;

alter table order_event add column account_id text not null default '';

alter table order_event add column taker_fee text not null default '0';