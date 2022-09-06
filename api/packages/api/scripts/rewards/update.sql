-- Calculate new rewards
-- note: the rewards table has a unique constraint on (account id, reward date)
begin
;

create temporary table previous as (
    select
        reward_date
    from
        rewards.payouts
    order by
        reward_date desc
    limit
        1
);

-- optional: delete the most recent record. unsure if this is necessary.
-- uncomment if you get unique contrainst violations on the payouts table
-- delete from
--     rewards.payouts using previous
-- where
--     payouts.reward_date = previous.reward_date;
-- dummy for formatter
select
    1;

-- do the update
insert into
    rewards.payouts (
        max_price_multiplier,
        eligible_bp_distance,
        time_divisor,
        account_id,
        reward,
        reward_date
    )
select
    -- select the params; parameters may change over the course of
    -- the month, and this is the easiest way to do an audit
    -- TODO: select the total volume in this time?
    params.max_price_multiplier,
    params.eligible_bp_distance,
    params.time_divisor,
    r.account_id,
    r.reward,
    r.reward_date
from
    rewards.usn_rewards_calculator r
    cross join rewards.params params
    cross join previous
where
    -- stop at today (ie, this always fills in until previous day to prevent
    -- partially computing a day and having to clean up later)
    r.reward_date > previous.reward_date
    and r.reward_date < date(now());

select
    *
from
    rewards.payouts
order by
    reward_date desc;

commit;
