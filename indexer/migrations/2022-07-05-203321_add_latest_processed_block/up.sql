-- Your SQL goes here
create table indexer_processed_block (
    block_height integer primary key,
    processed_at timestamp default current_timestamp
);