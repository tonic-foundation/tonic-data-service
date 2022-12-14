// Overall stats about the competition, including start time, total rewards so
// far, distinct users, etc
import { FastifyInstance } from 'fastify';

// was doing live payouts but parameters change daily at the
// *end of the day* based on volume, so can't use that
const STATS_QUERY = `
with all_payouts as (
  select
    *
  from
    rewards.payouts
  cross join
    rewards.const const
  where
    reward_date >= const.start_date
),
stats as (
  select
    sum(payout) total_payouts,
    count(distinct account_id) total_participants
  from
    all_payouts
),
stats_per_day as (
  select
    sum(payout) daily_payouts,
    count(distinct account_id) daily_participants,
    reward_date
  from
    all_payouts
  group by reward_date
)
select
  s.total_payouts,
  s.total_participants,
  const.start_date,
  spd.reward_date,
  spd.daily_payouts,
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
  total_payouts: number;

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
  daily_payouts: number;

  /**
   * Total distinct participants who earned any reward on `reward_date`.
   */
  daily_participants: number;
}

export interface Stats {
  total_payouts: number;
  total_participants: number;
  start_date: Date;
  daily_stats: Pick<StatsRow, 'reward_date' | 'daily_payouts' | 'daily_participants'>[];
}

function intoStats(rows: StatsRow[]): Stats {
  if (!rows.length) {
    return {
      total_payouts: 0,
      total_participants: 0,
      start_date: new Date(), // wrong but whatever
      daily_stats: [],
    };
  }

  return {
    total_payouts: rows[0].total_payouts,
    total_participants: rows[0].total_participants,
    start_date: rows[0].start_date,
    // assume this is in date order due to the query
    daily_stats: rows.map((r) => ({
      daily_participants: r.daily_participants,
      daily_payouts: r.daily_payouts,
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

      const res = await server.withCache({
        key: `rewards-stats`,
        ttl: 15 * 60_000,
        async get() {
          const { rows } = await knex.raw<{ rows: StatsRow[] }>(STATS_QUERY);
          return intoStats(rows);
        },
      });

      resp.status(200).send(res);
    },
  });

  done();
}
