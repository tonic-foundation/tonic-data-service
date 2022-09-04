-- populated with a script at the start of the competition
create table competition.nft_holder (
    account_id text primary key,
    n_held integer default 0,
    multiplier decimal default 1
);