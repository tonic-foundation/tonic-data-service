-- Your SQL goes here
begin
;

alter table
    order_event
add
    column best_bid text default null;

alter table
    order_event
add
    column best_ask text default null;

alter table
    order_event
add
    column open_quantity text default null;

end;