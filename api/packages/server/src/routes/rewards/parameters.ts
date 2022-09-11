// Summary of an account's payouts (pending, paid, and total)
import { FastifyInstance } from 'fastify';

/**
 * If the account earned no rewards on a given day, the row for that day will
 * simply be missing. Missing days are filled in on the frontend.
 */
const PARAMETERS_QUERY = `
  select
    start_date,
    rewards_pool
  from
    rewards.params p
  cross join
    rewards.const c
  where
    p.reward_date = date(now());
`;

export interface RewardsProgramParameters {
  start_date: string;
  end_date: string;
}

export default function (server: FastifyInstance, _: unknown, done: () => unknown) {
  server.route<{
    Headers: unknown;
    Querystring: {
      date: string;
    };
  }>({
    url: '/parameters',
    method: 'GET',
    schema: {
      querystring: {
        date: { type: 'string' },
      },
    },
    // TODO: search? or maybe return params with history?
    handler: async (_, resp) => {
      const { knex } = server;
      const { rows } = await knex.raw<{
        rows: unknown[];
      }>(PARAMETERS_QUERY);
      resp.status(200).send(rows[0]);
    },
  });

  done();
}
