// parameters for the day
import { FastifyInstance } from 'fastify';

const PAYOUT_QUERY = `
select
    account_id,
    payout,
    reward_date
from
    rewards.payouts
    and payout > 0
order by
    reward_date,
    payout desc,
    account_id;
`;

const PAYOUT_QUERY_WITH_DATE = `
select
    account_id,
    payout,
    reward_date
from
    rewards.payouts
where
    reward_date = :reward_date
    and payout > 0
order by
    reward_date,
    payout desc,
    account_id;
`;

export interface Payout {
  account_id: string;
  payout: string;
  reward_date: Date;
}

function formatOutput(payouts: Payout[], format: 'csv' | 'json'): string | Payout[] {
  if (format === 'json') {
    return payouts;
  }
  return payouts.map((p) => [p.account_id, p.payout, p.reward_date.toISOString().split('T')[0]].join(',')).join('\n');
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
    // TODO: search? or maybe return params with history?
    handler: async (req, resp) => {
      const { date, format = 'json' } = req.query;
      const { knex } = server;

      if (date) {
        const { rows } = await knex.raw<{ rows: Payout[] }>(PAYOUT_QUERY_WITH_DATE, { reward_date: date });
        resp.status(200).send(formatOutput(rows, format));
      } else {
        const { rows } = await knex.raw<{ rows: Payout[] }>(PAYOUT_QUERY);
        resp.status(200).send(formatOutput(rows, format));
      }
    },
  });

  done();
}
