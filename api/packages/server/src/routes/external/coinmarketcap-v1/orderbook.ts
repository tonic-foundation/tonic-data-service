// Implements the CoinMarketCap orderbook endpoint (Spot A3) for fetching
// orderbook per market.
import { FastifyInstance } from 'fastify';
import { Market } from '@tonic-foundation/indexer-models';
import { getTonicClient } from '../../../util';
import { toInternalSymbol } from './helper';

interface Response {
  timestamp: number;
  bids: [number, number][];
  asks: [number, number][];
}

/**
 * Get orderbook for a market. Proxy for NEAR RPC query.
 */
export default function (server: FastifyInstance, _: unknown, done: () => unknown) {
  server.route<{
    Params: { market_pair: string };
    Querystring: { depth?: number; level?: unknown }; // don't support level
  }>({
    url: '/orderbook/:market_pair', // it's what they call it in the docs
    method: 'GET',
    schema: {
      querystring: {
        depth: { type: 'number' },
      },
      params: {
        type: 'object',
        properties: {
          market_pair: { type: 'string' },
        },
      },
    },
    handler: async (request, response) => {
      const { market_pair } = request.params;
      const { depth = 24 } = request.query;

      if (!market_pair) {
        response.send(400).send({ error: 'missing market_pair parameter' });
        return;
      }

      const key = `coinmarketcap-market-pair-${market_pair}-${depth}`;
      let ob = server.cache.getTimed(key);

      // coinmarketcap's "depth" is total- 12 depth is 6 per side
      // our "depth" is per side- 12 depth is 12 per side
      const obFetchDepth = Math.round(depth / 2);

      if (!ob) {
        const tonic = await getTonicClient();
        const symbol = toInternalSymbol(market_pair);
        const info = await server.knex<Market>('market').first('id').where('symbol', symbol);
        if (!info) {
          response.send(404).send({ error: 'market not found' });
          return;
        }
        const market = await tonic.getMarket(info.id);
        const { bids, asks } = await market.getOrderbook(obFetchDepth);
        // order by best bids and best asks, ie, bids high -> low, asks low -> high
        asks.reverse();
        ob = { timestamp: Date.now(), bids, asks } as Response;

        server.cache.setTimed(key, ob, 60_000 * 10);
      }

      response.status(200).send(ob);
    },
  });

  done();
}
