import { FastifyInstance } from 'fastify';

const ALL_TIME_QUERY = `
with usdc_markets as
(select id from market_with_denomination where symbol like '%usdc%')
select sum(quote_qty::numeric/1000000::numeric) sum
from fill_event where market_id in (select id from usdc_markets);
`;

const ONE_DAY_QUERY = `
with usdc_markets as
(select id from market_with_denomination where symbol like '%usdc%')
select sum(quote_qty::numeric/1000000::numeric) sum
from fill_event where market_id in (select id from usdc_markets)
and created_at > now() - interval '1 day';
`;

export default function (server: FastifyInstance, _: unknown, done: () => unknown) {
  server.route<{
    Headers: unknown;
  }>({
    url: '/volume',
    method: 'GET',
    handler: async (_, response) => {
      const key = 'fees';
      const fees = await server.withCache({
        key,
        ttl: 15 * 60_000,
        async get() {
          const allTimeQuery = server.knex.raw<{ rows: { sum: number }[] }>(ALL_TIME_QUERY);
          const oneDayQuery = server.knex.raw<{ rows: { sum: number }[] }>(ONE_DAY_QUERY);

          const [{ rows: allTime }, { rows: oneDay }] = await Promise.all([allTimeQuery, oneDayQuery]);

          return {
            allTime: Number(allTime[0].sum),
            oneDay: Number(oneDay[0].sum),
          };
        },
      });

      response.status(200).send(fees);
    },
  });

  done();
}
