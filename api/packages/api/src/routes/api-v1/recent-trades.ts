import { FastifyInstance } from 'fastify';
import { NewFill } from '@tonic-foundation/indexer-models';
import { maybeDate } from '../../util';

type RecentTrade = Pick<NewFill, 'created_at' | 'fill_price' | 'fill_qty'>;

/**
 * List recent trades in a market.
 */
export default function (server: FastifyInstance, _: unknown, done: () => unknown) {
  server.route<{
    Querystring: { market: string; limit?: number; after?: string };
    Headers: unknown;
  }>({
    url: '/recent-trades',
    method: 'GET',
    schema: {
      querystring: {
        market: { type: 'string' },
        limit: { type: 'integer' },
        after: { type: 'string' },
      },
    },
    // http handler used for polling/fetching initial list of requests when populating a ui
    handler: async (request, response) => {
      const { market, limit = 50, after } = request.query;
      const trades: RecentTrade[] = await server
        .knex<NewFill>('fill_event')
        .select(
          // hack: add 1 to the second so the client doesn't underfetch next period
          server.knex.raw(`(extract(epoch from created_at)::bigint + 1) * 1000 as created_at`),
          'fill_price',
          'fill_qty'
        )
        .where({ market_id: market })
        .modify((q) => {
          if (!after) {
            return;
          }
          const d = maybeDate(after);
          if (d) {
            q.andWhere('created_at', '>', d.toISOString());
          }
        })
        .orderBy('created_at', 'desc')
        .limit(limit);

      response.status(200).send({
        trades: trades
          .map(({ created_at, ...t }) => {
            return {
              ...t,
              created_at: parseInt(created_at),
            };
          })
          .reverse(),
      });
    },
  });

  done();
}
