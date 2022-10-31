import { FastifyInstance } from 'fastify';

const PARAMETERS_QUERY = `
  select
    rewards_pool
  from
    rewards.params_v3 p
  where
    p.for_date = current_date;
`;

interface RewardsParams {
  rewards_pool: string;
}

export default function (server: FastifyInstance, _: unknown, done: () => unknown) {
  server.route<{
    Headers: unknown;
    Querystring: {
      /**
       * ticker of the market to get params for
       */
      market: string;
    };
  }>({
    url: '/parameters',
    method: 'GET',
    schema: {
      querystring: {
        market: { type: 'string' },
      },
    },
    handler: async (req, resp) => {
      const { market } = req.query;

      if (!market?.length) {
        // return all?
        resp.status(400).send({
          error: 'missing market parameter',
        });
        return;
      }

      const { knex } = server;
      const { rows } = await knex.raw<{
        rows: RewardsParams[];
      }>(PARAMETERS_QUERY);

      if (rows.length) {
        resp.status(200).send(rows[0]);
      } else {
        const defaultParams: RewardsParams = { rewards_pool: '0' };
        resp.status(200).send(defaultParams);
      }
    },
  });

  done();
}
