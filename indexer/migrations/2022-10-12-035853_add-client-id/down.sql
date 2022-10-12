-- This file should undo anything in `up.sql`
alter table
    order_event drop column client_id;