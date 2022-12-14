-- This file should undo anything in `up.sql`
begin
;

drop view rewards.liquidity_hours_v3;

drop view rewards.points_v3_input;

drop table rewards.params_v3;

drop table rewards.payout_v3;

drop table rewards.eligible_market_v3;

drop table rewards.const_v3;

-- todo: drop functions
end;