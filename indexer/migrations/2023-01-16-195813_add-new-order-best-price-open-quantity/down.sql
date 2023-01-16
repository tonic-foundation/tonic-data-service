-- This file should undo anything in `up.sql`
begin
;

alter table
    order_event drop column best_bid;

alter table
    order_event drop column best_ask;

alter table
    order_event drop column open_quantity;

end;