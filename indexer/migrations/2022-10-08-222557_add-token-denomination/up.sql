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

end;