import { FastifyInstance } from 'fastify';

const REWARDS_HISTORY_QUERY = `
select
  *
from
  rewards.payouts
where
  account_id = :account
order by
  reward_date desc;
`;

interface Reward {
  max_price_multiplier: number;
  eligible_bp_distance: number;
  time_divisor: number;
  account_id: string;
  reward: number;
  reward_date: Date;
  paid: boolean;
}

export default function (server: FastifyInstance, _: unknown, done: () => unknown) {
  server.route<{
    Querystring: { account?: string };
    Headers: unknown;
  }>({
    url: '/rewards-history',
    method: 'GET',
    schema: {
      querystring: {
        account: { type: 'string' },
      },
    },
    handler: async (req, resp) => {
      const { account } = req.query;

      if (!account?.length) {
        resp.status(400).send({
          error: 'missing account parameter',
        });
        return;
      }

      const { knex } = server;
      const { rows } = await knex.raw<{
        rows: Reward[];
      }>(REWARDS_HISTORY_QUERY, {
        account,
      });

      console.log(rows);

      if (rows.length) {
        resp.status(200).send(rows);
      } else {
        resp.status(404);
      }
    },
  });

  done();
}
