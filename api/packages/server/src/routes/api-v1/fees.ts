import { FastifyInstance } from 'fastify';

const ALL_TIME_QUERY = `
with usdc_markets as (select id from market_with_denomination where symbol like '%usdc%')
select sum(taker_fee::numeric/1000000::numeric) sum
from order_event where market_id in (select id from usdc_markets);
`;

const ONE_DAY_QUERY = `
with usdc_markets as (select id from market_with_denomination where symbol like '%usdc%')
select sum(taker_fee::numeric/1000000::numeric) sum
from order_event where market_id in (select id from usdc_markets)
and created_at > now() - interval '1 day';
`;

export default function (server: FastifyInstance, _: unknown, done: () => unknown) {
  server.route<{
    Headers: unknown;
  }>({
    url: '/fees',
    method: 'GET',
    handler: async (_, response) => {
      const allTime = await server.withCache({
        key: 'volume.all-time',
        ttl: 60 * 60_000,
        async get() {
          const { rows } = await server.knex.raw<{ rows: { sum: number }[] }>(ALL_TIME_QUERY);
          return rows[0].sum;
        },
      });
      const oneDay = await server.withCache({
        key: 'volume.one-day',
        ttl: 15 * 60_000,
        async get() {
          const { rows } = await server.knex.raw<{ rows: { sum: number }[] }>(ONE_DAY_QUERY);
          return rows[0].sum;
        },
      });

      response.status(200).send({ allTime, oneDay });
    },
  });

  done();
}
