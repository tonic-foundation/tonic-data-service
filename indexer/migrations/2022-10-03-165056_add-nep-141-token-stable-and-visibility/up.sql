-- Your SQL goes here
begin
;

alter table
    nep_141_token
add
    column stable boolean default false;

alter table
    nep_141_token
add
    column visible boolean default false;

end;