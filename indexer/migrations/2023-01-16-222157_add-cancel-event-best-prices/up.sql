-- Your SQL goes here
begin
;

alter table
    cancel_event
add
    column best_bid text default null;

alter table
    cancel_event
add
    column best_ask text default null;

end;