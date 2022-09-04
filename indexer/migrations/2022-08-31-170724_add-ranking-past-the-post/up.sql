-- NB: there are a few things in here that expect volumes to be in USDC.
-- Read carefully if using other tokens.
BEGIN
;

CREATE
OR REPLACE FUNCTION floor_time(ts TIMESTAMP, seconds INT) RETURNS TIMESTAMP LANGUAGE SQL IMMUTABLE RETURNS NULL ON NULL INPUT RETURN to_timestamp(
    floor(
        (
            extract(
                'epoch'
                from
                    ts
            ) / seconds
        )
    ) * seconds
);

CREATE VIEW competition.token_decimals AS (
    SELECT
        id,
        pow(10, decimals) denomination
    FROM
        nep_141_token
);

CREATE VIEW competition.account_quote_volume_1d AS (
    SELECT
        DISTINCT o.account_id,
        -- shift to match by 16:00 start/end times
        floor_time(f.created_at, 86400) + interval '57600 second' as ts,
        (sum(f.quote_qty :: numeric) OVER w) :: numeric / denomination :: numeric as v,
        m.symbol
    FROM
        fill_event f
        JOIN order_event o ON f.taker_order_id = o.order_id
        OR f.maker_order_id = o.order_id
        JOIN market m ON o.market_id = m.id
        JOIN competition.token_decimals tokd ON m.quote_token_id = tokd.id WINDOW w AS (
            PARTITION BY o.account_id,
            floor_time(f.created_at, 86400) + interval '57600 second'
        )
);

CREATE view competition.quote_volume_1d AS (
    SELECT
        *
    FROM
        competition.account_quote_volume_1d
        CROSS JOIN competition.const AS const
    WHERE
        ts BETWEEN const.start_ts
        AND const.end_ts
        AND symbol IN (
            SELECT
                symbol
            FROM
                competition.eligible_market cm
                JOIN market m ON m.id = cm.market_id
        )
);

CREATE VIEW competition.quote_volume_1d_with_goblin AS (
    SELECT
        v1d. *,
        unwrap_or(nft.n_held, 0) n_held,
        unwrap_or(nft.multiplier, 1) multiplier,
        (unwrap_or(nft.multiplier, 1) * v1d.v) vol_after_goblin
    FROM
        competition.quote_volume_1d v1d
        LEFT JOIN competition.nft_holder nft ON nft.account_id = v1d.account_id
    WHERE
        v1d.account_id NOT IN (
            SELECT
                *
            FROM
                competition.excluded_account
        )
);

CREATE VIEW competition.achieved_10k_per_day AS (
    select
        *,
        case
            when vol_after_goblin :: numeric > 10000 :: numeric then 1
            else 0
        end achieved
    from
        competition.quote_volume_1d_with_goblin
    WHERE
        account_id NOT IN (
            SELECT
                *
            FROM
                competition.excluded_account
        )
);

CREATE VIEW competition.account_quote_volume_5s AS (
    SELECT
        DISTINCT o.account_id,
        floor_time(f.created_at, 5) as ts,
        (sum(f.quote_qty :: numeric) OVER w) :: numeric / denomination :: numeric as v,
        m.symbol
    FROM
        fill_event f
        JOIN order_event o ON f.taker_order_id = o.order_id
        OR f.maker_order_id = o.order_id
        JOIN market m ON o.market_id = m.id
        JOIN competition.token_decimals tokd ON m.quote_token_id = tokd.id WINDOW w AS (
            PARTITION BY o.account_id,
            floor_time(f.created_at, 5)
        )
);

CREATE view competition.quote_volume_5s AS (
    SELECT
        *
    FROM
        competition.account_quote_volume_5s
        CROSS JOIN competition.const AS const
    WHERE
        ts BETWEEN const.start_ts
        AND const.end_ts
        AND account_id NOT IN (
            SELECT
                *
            FROM
                competition.excluded_account
        )
);

CREATE VIEW competition.quote_volume_5s_with_goblin AS (
    SELECT
        v5s. *,
        unwrap_or(nft.n_held, 0) n_held,
        unwrap_or(nft.multiplier, 1) multiplier,
        (unwrap_or(nft.multiplier, 1) * v5s.v) vol_with_goblin
    FROM
        competition.quote_volume_5s v5s
        LEFT JOIN competition.nft_holder nft ON nft.account_id = v5s.account_id
);

CREATE VIEW competition.first_to_10k AS WITH running_total_by_user AS (
    SELECT
        account_id,
        ts,
        SUM(vol_with_goblin) OVER(
            PARTITION BY account_id
            ORDER BY
                ts ASC ROWS BETWEEN UNBOUNDED PRECEDING
                AND CURRENT ROW
        ) AS running_total
    FROM
        competition.quote_volume_5s_with_goblin
),
achievers AS (
    SELECT
        DISTINCT ON (account_id) account_id,
        MIN(running_total) as total,
        MIN(ts) AS achieved_at
    FROM
        running_total_by_user
    WHERE
        running_total >= 10000 :: numeric
    GROUP BY
        account_id
)
select
    *
from
    achievers
order by
    achieved_at asc;

END;

-- how to get number of days achieved:
-- with days_achieved as (select account_id, sum(achieved) days from competition.achieved_10k_per_day group by account_id) select * from days_achieved order by days desc;
-- with days_achieved as (select account_id, sum(achieved) days from competition.achieved_10k_per_day where ts between '2022-07-20 16:00:00'::timestamp and '2022-07-24 15:59:00'::timestamp group by account_id) select * from days_achieved order by days desc;
-- get all with 10k vol combined over all races
-- with total_volumes as (select account_id, trunc(sum(total_volume::numeric),2) vol from competition.ranking_overall group by account_id), achieved as (select * from total_volumes where vol > 10000::numeric) select * from achieved order by vol desc;
-- how to get daily volume rankings
-- create temporary view rank_per_day as (
-- select dense_rank() over(partition by ts ORDER BY vol_after_goblin desc) daily_rank, account_id, ts, vol_after_goblin from competition.quote_volume_1d_with_goblin);