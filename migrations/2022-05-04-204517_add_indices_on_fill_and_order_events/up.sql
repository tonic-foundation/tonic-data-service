-- Your SQL goes here

-- remove the existing fill_event__market_id__created_at index 
drop index fill_event__market_id__created_at;

-- create indices on fill_event table
create index fill_event_market_id on fill_event(market_id);
create index fill_event_market_id_created_at_desc on fill_event(market_id, created_at desc);
create index fill_event_maker_order_id on fill_event(maker_order_id);
create index fill_event_taker_order_id on fill_event(taker_order_id);

-- create indices on order_event table
create index order_event_market_id  on order_event(market_id);
create index order_event_account_id on order_event(account_id);
create index order_event_order_id   on order_event(order_id);
