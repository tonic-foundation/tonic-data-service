-- This file should undo anything in `up.sql`

-- undo deletion of fill_event__market_id__created_at
create index fill_event__market_id__created_at on fill_event(market_id, created_at);

-- undo creation of new indices on fill_event
drop index fill_event_market_id;
drop index fill_event_market_id_created_at_desc;
drop index fill_event_maker_order_id;
drop index fill_event_taker_order_id;

-- undo creation of new indices on order_event
drop index order_event_market_id;
drop index order_event_account_id;
drop index order_event_order_id;
