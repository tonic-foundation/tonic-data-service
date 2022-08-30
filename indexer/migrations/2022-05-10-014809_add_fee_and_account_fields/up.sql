-- Your SQL goes here
alter table order_event add column referrer_rebate text not null default '0';
alter table order_event add column referrer_id text default null;

alter table fill_event add column is_bid boolean not null;
alter table fill_event add column taker_account_id text not null;
alter table fill_event add column maker_account_id text not null;