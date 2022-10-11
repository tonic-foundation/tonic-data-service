-- Your SQL goes here
begin
;

create view nep_141_token_denomination as (
    select
        *,
        pow(10, decimals) denomination
    from
        nep_141_token
);

create view market_with_denomination as (
    select
        m. *,
        bt.denomination base_denomination,
        qt.denomination quote_denomination
    from
        market m
        join nep_141_token_denomination bt on m.base_token_id = bt.id
        join nep_141_token_denomination qt on m.quote_token_id = qt.id
);

end;