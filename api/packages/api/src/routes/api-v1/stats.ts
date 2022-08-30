import { FastifyInstance } from 'fastify';
import { ForceProperties } from '../../types/util';

// missing the leading select here because we use knex.select to unwrap
const STATS_QUERY = `
  (select
      fill_price from fill_event
      where market_id = :market
      order by created_at desc
      limit 1
  ) as latest,
  (select
      fill_price from fill_event
      where market_id = :market
      and created_at < now() - interval '24 hour'
      order by created_at desc
      limit 1
  ) as previous,
  max(fill_price::numeric) as high,
  min(fill_price::numeric) as low,
  sum(fill_qty::numeric) as quantity
from fill_event
where market_id = :market
and created_at > now() - interval '24 hour'
`;

export interface MarketStats24h {
  latest?: number;
  previous?: number;
  high?: number;
  low?: number;
  quantity: number;
}

/**
 * Get basic 24h stats about a market (OHLV and the latest executed trade price).
 */
export default function (server: FastifyInstance, _: unknown, done: () => unknown) {
  server.route<{
    Querystring: { market: string };
    Headers: unknown;
  }>({
    url: '/stats',
    method: 'GET',
    schema: {
      querystring: {
        market: { type: 'string' },
      },
    },
    handler: async (request, response) => {
      const { knex } = server;
      const { market } = request.query;

      if (!market) {
        response.send(400).send({ error: 'missing market parameter' });
        return;
      }

      const tools = await server.getMarketInfoAndUtils(market);
      if (!tools) {
        response.send(404);
        return;
      }
      const { priceStringToNumber, quantityStringToNumber } = tools;

      const statsCacheKey = `market-stats-${market}`;
      const ttl = 10_000; // 10 seconds

      let stats: MarketStats24h | undefined = server.cache.getTimed(statsCacheKey);
      if (!stats) {
        const rawStats: ForceProperties<MarketStats24h, string> = await knex.first(knex.raw(STATS_QUERY, { market }));
        stats = {
          high: priceStringToNumber(rawStats.high),
          low: priceStringToNumber(rawStats.low),
          latest: priceStringToNumber(rawStats.latest),
          previous: priceStringToNumber(rawStats.previous),
          quantity: quantityStringToNumber(rawStats.quantity) || 0,
        };
        server.cache.setTimed(statsCacheKey, stats, ttl);
      }

      response.status(200).send({ stats });
    },
  });

  done();
}
