-- This file should undo anything in `up.sql`
alter table fill_event add column taker_fee text not null default '0';

alter table order_event drop column account_id;

alter table order_event drop column taker_fee;