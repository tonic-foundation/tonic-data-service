-- This file should undo anything in `up.sql`
begin
;

drop view rewards.leaderboard_v2;

drop view rewards.shares_v2;

drop view rewards.usn_rewards_calculator_v2;

drop function rewards.calculate_points_v2;

drop view rewards.usn_liquidity_hours;

drop view rewards.points_v2_inputs;

drop view rewards.rollover_points;

drop table rewards.rollover_orders;

alter table
    rewards.params drop column fill_multiplier;

alter table
    rewards.payouts drop column source;

drop type rewards.payout_source;

end;