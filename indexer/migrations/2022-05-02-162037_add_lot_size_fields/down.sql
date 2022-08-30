-- This file should undo anything in `up.sql`

alter table market drop column base_lot_size;
alter table market drop column quote_lot_size;
