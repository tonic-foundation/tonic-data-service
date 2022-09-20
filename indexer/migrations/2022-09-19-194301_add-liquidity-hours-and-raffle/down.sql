-- This file should undo anything in `up.sql`
begin
;

drop view rewards.usn_rewards_calculator_v2;

drop table rewards.rollover_points;

end;