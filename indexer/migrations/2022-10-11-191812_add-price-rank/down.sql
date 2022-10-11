-- This file should undo anything in `up.sql`
begin
;

alter table
    fill_event drop column maker_price_rank;

alter table
    order_event drop column price_rank;

alter table
    cancel_event drop column price_rank;

end;