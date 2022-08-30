-- Your SQL goes here

alter table market add column base_lot_size text not null default '';
alter table market add column quote_lot_size text not null default '';
