begin
;

alter table
    cancel_event
add
    -- unfortunate
    column cancelled_qty text default null;

end;