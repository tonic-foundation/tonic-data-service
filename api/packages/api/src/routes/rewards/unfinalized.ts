// Non-finalized rewards for the current UTC day, computed using the view and
// cached for ~15 minutes per user.
import { FastifyInstance } from 'fastify';
import { Reward } from './util';

const REWARDS_TODAY_QUERY = `
select
  *
from
  rewards.usn_rewards_calculator
where
  account_id = :account
  and reward_date = date(now());
`;

export default function (server: FastifyInstance, _: unknown, done: () => unknown) {
  server.route<{
    Querystring: { account?: string };
    Headers: unknown;
  }>({
    url: '/unfinalized',
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

      const cacheKey = `rewards-unfinalized-${account}`;
      let res = server.cache.getTimed<Reward>(cacheKey);
      if (!res) {
        const { rows } = await knex.raw<{
          rows: Reward[];
        }>(REWARDS_TODAY_QUERY, {
          account,
        });
        if (rows.length) {
          res = rows[0];
          server.cache.setTimed(cacheKey, res, 60_000 * 15);
        }
      }

      if (res) {
        resp.status(200).send(res);
      } else {
        resp.status(404);
      }
    },
  });

  done();
}
