-- This file should undo anything in `up.sql`

-- views
drop view tv_market;

-- objects
drop table market;
drop table nep_141_token;

-- events
drop table market_event;
drop table order_event;
drop table fill_event;
drop table cancel_event;

drop function publish_event_to_channel;
