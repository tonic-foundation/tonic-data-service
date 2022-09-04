// Overall stats about the competition, including start time, total rewards so
// far, distinct users, etc
import { FastifyInstance } from 'fastify';

const STATS_QUERY = `
with live_payouts as (
  select
    *
  from
    rewards.usn_rewards_calculator
  cross join
    rewards.const const
  where
    reward_date >= const.start_date
),
stats as (
  select
    sum(reward) total_rewards,
    count(distinct account_id) total_participants
  from
    live_payouts
),
stats_per_day as (
  select
    sum(reward) daily_rewards,
    count(distinct account_id) daily_participants,
    reward_date
  from
    live_payouts
  group by reward_date
)
select
  s.total_rewards,
  s.total_participants,
  const.start_date,
  spd.reward_date,
  spd.daily_rewards,
  spd.daily_participants
from
  stats_per_day spd
  cross join stats s
  cross join rewards.const const
order by
  spd.reward_date asc;
`;

interface StatsRow {
  /**
   * Total since start of program, paid or pending.
   */
  total_rewards: number;

  /**
   * Distinct participants with reward earned on at least one day.
   */
  total_participants: number;

  /**
   * UTC start date.
   */
  start_date: Date;

  /**
   * UTC date.
   */
  reward_date: Date;

  /**
   * Total rewards earned on `reward_date`.
   */
  daily_rewards: number;

  /**
   * Total distinct participants who earned any reward on `reward_date`.
   */
  daily_participants: number;
}

export interface Stats {
  total_rewards: number;
  total_participants: number;
  start_date: Date;
  daily_stats: Pick<StatsRow, 'reward_date' | 'daily_rewards' | 'daily_participants'>[];
}

function intoStats(rows: StatsRow[]): Stats {
  if (!rows.length) {
    return {
      total_rewards: 0,
      total_participants: 0,
      start_date: new Date(), // wrong but whatever
      daily_stats: [],
    };
  }

  return {
    total_rewards: rows[0].total_rewards,
    total_participants: rows[0].total_participants,
    start_date: rows[0].start_date,
    // assume this is in date order due to the query
    daily_stats: rows.map((r) => ({
      daily_participants: r.daily_participants,
      daily_rewards: r.daily_rewards,
      reward_date: r.reward_date,
    })),
  };
}

export default function (server: FastifyInstance, _: unknown, done: () => unknown) {
  server.route<{
    Querystring: { account?: string };
    Headers: unknown;
  }>({
    url: '/stats',
    method: 'GET',
    handler: async (_, resp) => {
      const { knex } = server;

      const cacheKey = `rewards-stats`;
      let res = server.cache.getTimed(cacheKey);
      if (!res) {
        const { rows } = await knex.raw<{ rows: StatsRow[] }>(STATS_QUERY);
        res = intoStats(rows);
        // 15 minutes
        server.cache.setTimed(cacheKey, res, 15 * 60_000);
      }

      resp.status(200).send(res);
    },
  });

  done();
}
