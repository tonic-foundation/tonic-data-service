import { FastifyInstance } from 'fastify';

const PARAMETERS_QUERY = `
  select
    symbol,
    rewards_pool
  from
    rewards.params_v3 p
  where
    p.for_date = current_date;
`;

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
    handler: async (req, resp) => {
      const { date } = req.query;
      const { rows } = await server.knex.raw(PARAMETERS_QUERY, { for_date: date });
      resp.status(200).send(rows);
    },
  });

  done();
}
