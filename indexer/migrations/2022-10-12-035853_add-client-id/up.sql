-- Your SQL goes here
alter table
    order_event
add
    -- unfortunately, it's u32 in the contract, so now we have to support it
    column client_id bigint default null;