-- This file should undo anything in `up.sql`
begin
;

alter table
    cancel_event drop column best_bid;

alter table
    cancel_event drop column best_ask;

end;