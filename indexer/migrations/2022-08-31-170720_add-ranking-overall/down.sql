begin
;

-- drop in reverse order
drop materialized view competition.ranking_overall;

drop view competition.tpum;

drop view competition.tpm;

drop view competition.tvpur;

drop view competition.volume_per_market;

drop view competition.quote_volume;

drop function competition.unwrap_or;

commit;