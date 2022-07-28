-- This file should undo anything in `up.sql`
alter table order_event drop column referrer_rebate;
alter table order_event drop column referrer_id;

alter table fill_event drop column is_bid;
alter table fill_event drop column taker_account_id;
alter table fill_event drop column maker_account_id;