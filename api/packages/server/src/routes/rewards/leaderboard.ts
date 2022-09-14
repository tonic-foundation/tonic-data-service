// live leaderboard using the points calculator view
import { FastifyInstance } from 'fastify';

const LEADERBOARD_QUERY_WITH_DATE = `
select *
from rewards.usn_payouts_leaderboard
where
  reward_date = :reward_date
  and points > 0
order by ranking, account_id;
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
