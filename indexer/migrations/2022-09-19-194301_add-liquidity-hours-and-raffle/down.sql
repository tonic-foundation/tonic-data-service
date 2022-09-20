-- This file should undo anything in `up.sql`
begin
;

drop view rewards.leaderboard_v2;

drop view rewards.shares_v2;

drop view rewards.usn_rewards_calculator_v2;

drop table rewards.rollover_points;

alter table
    rewards.params drop column fill_multiplier;

alter table
    rewards.payouts drop column source;

drop type rewards.payout_source;

end;