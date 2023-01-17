-- This file should undo anything in `up.sql`
begin
;

drop function rewards.get_lp_shares_v4;

drop function rewards.get_liquidity_hours_v4;

drop function rewards.get_points_v4_input;

drop table rewards.payout_v4;

drop function rewards.is_eligible_account_v4;

drop function rewards.midmarket_price_native;

drop function rewards.bp_distance;

drop function rewards.to_decimal;

end;