begin
;

create view rewards.usn_payouts_leaderboard as (
    with rewards_total as (
        select
            sum(points :: numeric) total,
            reward_date
        from
            rewards.usn_rewards_calculator
        group by
            reward_date
    ),
    shares as (
        select
            c .account_id,
            c .points,
            points / t.total share,
            t.reward_date
        from
            rewards.usn_rewards_calculator c
            join rewards_total t on t.reward_date = c .reward_date
    )
    select
        dense_rank() over (
            partition by shares.reward_date
            order by
                points desc,
                account_id
        ) ranking,
        account_id,
        points,
        share,
        trunc(share * p.rewards_pool, 2) payout,
        shares.reward_date
    from
        shares
        join rewards.params p on p.reward_date = shares.reward_date
    order by
        ranking,
        account_id
);

end;