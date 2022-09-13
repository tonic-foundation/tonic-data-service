// parameters for the day
import { FastifyInstance } from 'fastify';

const LEADERBOARD_QUERY_WITH_DATE = `
with rewards_total as (
    select
        sum(points :: numeric) total
    from
        rewards.usn_rewards_calculator
),
shares as (
    select
        account_id,
        points,
        points / t.total share,
        reward_date
    from
        rewards.usn_rewards_calculator c
        cross join rewards_total t
)
select
    dense_rank() over (order by points desc, account_id) ranking,
    account_id,
    points,
    trunc(share * p.rewards_pool, 2) payout,
    shares.reward_date
from
    shares
    join rewards.params p on p.reward_date = shares.reward_date
where
    shares.reward_date = :reward_date;
`;

export interface Ranking {
  ranking: string;
  account_id: string;
  payout: string;
  reward_date: Date;
}

function formatOutput(payouts: Ranking[], format: 'csv' | 'json'): string | Ranking[] {
  if (format === 'json') {
    return payouts;
  }
  return payouts
    .map((p) => [p.ranking, p.account_id, p.payout, p.reward_date.toISOString().split('T')[0]].join(','))
    .join('\n');
}

export default function (server: FastifyInstance, _: unknown, done: () => unknown) {
  server.route<{
    Headers: unknown;
    Querystring: {
      date?: string;
      format?: 'csv' | 'json';
    };
  }>({
    url: '/leaderboard',
    method: 'GET',
    schema: {
      querystring: {
        date: { type: 'string' },
        format: { type: 'string' },
      },
    },
    handler: async (req, resp) => {
      const { date, format = 'json' } = req.query;
      const { knex } = server;

      if (!date) {
        resp.status(400).send({ msg: 'missing date' });
        return;
      }

      const data = await server.withCache({
        key: `rewards-leaderboard-${date}-${format}`,
        ttl: 5 * 60_000,
        async get() {
          const { rows } = await knex.raw<{ rows: Ranking[] }>(LEADERBOARD_QUERY_WITH_DATE, { reward_date: date });
          return formatOutput(rows, format);
        },
      });

      resp.status(200).send(data);
    },
  });

  done();
}
