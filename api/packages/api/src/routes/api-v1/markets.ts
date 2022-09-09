import { FastifyInstance } from 'fastify';
import { Market } from '@tonic-foundation/indexer-models';

/**
 * List/search markets supported by the API.
 */
export default function (server: FastifyInstance, _: unknown, done: () => unknown) {
  server.route<{
    Querystring: { baseToken?: string; quoteToken?: string };
    Headers: unknown;
  }>({
    url: '/markets',
    method: 'GET',
    schema: {
      querystring: {
        baseToken: { type: 'string' },
        quoteToken: { type: 'string' },
      },
    },
    handler: async (_, response) => {
      const key = 'markets-list';
      const markets = await server.withCache({
        key,
        ttl: 15 * 60_000,
        async get() {
          return await server
            .knex<Market>('market')
            .select(
              'id',
              'symbol',
              'created_at',
              'base_token_id',
              'quote_token_id',
              'base_decimals',
              'quote_decimals',
              'base_lot_size',
              'quote_lot_size'
            )
            .where('visible', true)
            .orderBy('symbol', 'desc');
        },
      });

      response.status(200).send({ markets: markets || [] });
    },
  });

  done();
}
