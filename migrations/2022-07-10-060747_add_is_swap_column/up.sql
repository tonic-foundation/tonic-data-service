-- Your SQL goes here
alter table
    order_event
add
    column is_swap boolean default false;