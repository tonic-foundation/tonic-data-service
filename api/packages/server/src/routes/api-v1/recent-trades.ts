import { FastifyInstance } from 'fastify';
import { NewFill } from '@tonic-foundation/indexer-models';
import { maybeDate } from '../../util';
import { subHours } from 'date-fns';

type RecentTrade = Pick<NewFill, 'created_at' | 'fill_price' | 'fill_qty'>;

/**
 * Takes params :market :after :limit
 */
const QUERY_WITH_CLIENT_ID = `
select
(extract(epoch from f.created_at)::bigint + 1) * 1000 as created_at,
f.fill_qty,
f.fill_price,
buck.client_id taker_client_id,
buck.order_id taker_order_id,
mo.client_id maker_client_id,
mo.order_id maker_order_id
from fill_event f
join order_event buck
on buck.order_id = f.taker_order_id
join order_event mo
on mo.order_id = f.maker_order_id
where f.market_id = :market
and f.created_at > :after
order by f.created_at desc
limit :limit;
`;

/**
 * Takes params :market :after :limit
 */
const QUERY_DEFAULT = `
select
(extract(epoch from f.created_at)::bigint + 1) * 1000 as created_at,
fill_qty,
fill_price
from fill_event f
where f.market_id = :market
and f.created_at > :after
order by f.created_at desc
limit :limit;
`;

interface QueryParams {
  market: string;
  after?: Date | null;
  limit?: number;
  includeIds?: boolean;
}
// idc
function makeQueryParams(params: QueryParams): [string, Record<string, any>] {
  return [
    params.includeIds ? QUERY_WITH_CLIENT_ID : QUERY_DEFAULT,
    {
      market: params.market,
      after: params.after || subHours(new Date(), 6),
      limit: Math.min(params.limit || 50, 200),
    },
  ];
}

/**
 * List recent trades in a market.
 */
export default function (server: FastifyInstance, _: unknown, done: () => unknown) {
  server.route<{
    Querystring: { market: string; limit?: number; after?: string; includeIds?: boolean };
    Headers: unknown;
  }>({
    url: '/recent-trades',
    method: 'GET',
    schema: {
      querystring: {
        market: { type: 'string' },
        limit: { type: 'integer' },
        after: { type: 'string' },
        includeIds: { type: 'boolean' },
      },
    },
    // http handler used for polling/fetching initial list of requests when populating a ui
    handler: async (request, response) => {
      const { market, limit = 50, after, includeIds } = request.query;
      const [query, args] = makeQueryParams({ market, after: maybeDate(after), limit, includeIds });
      const { rows: trades } = await server.knex.raw<{ rows: RecentTrade[] }>(query, args);

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
