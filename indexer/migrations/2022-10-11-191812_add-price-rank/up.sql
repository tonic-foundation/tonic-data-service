-- Your SQL goes here
begin
;

-- null means the data was not available for indexing at the time
alter table
    fill_event
add
    column maker_price_rank integer default null;

alter table
    order_event
add
    column price_rank integer default null;

alter table
    cancel_event
add
    column price_rank integer default null;

end;