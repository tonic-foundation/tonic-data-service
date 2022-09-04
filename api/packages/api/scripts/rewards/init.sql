-- initial load; must run this at least once
insert into
    rewards.payouts
select
    params.max_price_multiplier,
    params.eligible_bp_distance,
    params.time_divisor,
    r.account_id,
    r.reward,
    r.reward_date
from
    rewards.usn_rewards_calculator r
    cross join rewards.const const
    cross join rewards.params params
where
    r.reward_date >= const.start_date
    and r.reward_date < date(now());