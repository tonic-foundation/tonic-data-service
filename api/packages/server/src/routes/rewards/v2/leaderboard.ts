// live leaderboard using the points calculator view
import { FastifyInstance } from 'fastify';

const LEADERBOARD_QUERY_WITH_DATE = `
select
  event_date,
  ranking,
  account_id,
  points,
  share,
  trunc(share * p.rewards_pool, 2) payout
from
  rewards.leaderboard_v2 l
  join rewards.params p on p.reward_date = l.event_date
where
  event_date = :event_date
  and share > 0
order by
  ranking,
  account_id
`;

export interface Ranking {
  ranking: string;
  account_id: string;
  payout: string;
  points: string;
  share: string;
  event_date: Date;
}

function formatOutput(payouts: Ranking[], format: 'csv' | 'json'): string | Ranking[] {
  if (format === 'json') {
    return payouts;
  }
  return [
    'ranking,account_id,payout,share,points,event_date',
    ...payouts.map((p) =>
      [p.ranking, p.account_id, p.payout, p.share, p.points, p.event_date.toISOString().split('T')[0]].join(',')
    ),
  ].join('\n');
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
        key: `rewards-v2-leaderboard-${date}-${format}`,
        ttl: 5 * 60_000,
        async get() {
          const { rows } = await knex.raw<{ rows: Ranking[] }>(LEADERBOARD_QUERY_WITH_DATE, { event_date: date });
          return formatOutput(rows, format);
        },
      });

      resp.status(200).send(data);
    },
  });

  done();
}
