import { FastifyInstance } from 'fastify';
import { Reward } from './util';

const REWARDS_HISTORY_QUERY = `
select
  reward,
  reward_date,
  paid
from
  rewards.payouts
where
  account_id = :account
order by
  reward_date desc;
`;

export default function (server: FastifyInstance, _: unknown, done: () => unknown) {
  server.route<{
    Querystring: { account?: string };
    Headers: unknown;
  }>({
    url: '/history',
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

      if (rows.length) {
        resp.status(200).send(rows);
      } else {
        resp.status(404);
      }
    },
  });

  done();
}
