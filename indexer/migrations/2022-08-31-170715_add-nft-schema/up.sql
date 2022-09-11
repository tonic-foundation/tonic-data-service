-- populated with a script at the start of the competition
begin;

create schema nft;

grant usage on schema nft to readonly;

alter default privileges in schema nft grant select on tables to readonly;

create table nft.nft_holder (
    account_id text primary key,
    n_held integer default 0,
    multiplier decimal default 1
);

end;