import { FastifyInstance } from 'fastify';
import { ForceProperties } from '../../types/util';

const maybeDate = (s: string): Date | null => {
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
};

interface Trade {
  order_id: string;
  created_at: Date;
  /**
   * Amount of base traded
   */
  quantity: number;
  price: number;
  /**
   * Amount of quote traded
   */
  volume: number;
  direction: 'Buy' | 'Sell';
}

const HISTORY_QUERY = `
    f.created_at,
    f.fill_qty as quantity,
    f.fill_price as price,
    f.quote_qty as volume,
    o.order_id,
    o.side as raw_side
from fill_event f
join order_event o
on (
    o.order_id = f.taker_order_id
    or o.order_id = f.maker_order_id
)
where o.account_id = :account
and o.market_id = :market
`;

/**
 * Get an account's trade history in a market.
 */
export default function (server: FastifyInstance, _: unknown, done: () => unknown) {
  server.route<{
    Querystring: { market: string; account: string; limit?: number; after?: string };
    Headers: unknown;
  }>({
    url: '/trade-history',
    method: 'GET',
    schema: {
      querystring: {
        market: { type: 'string' },
        account: { type: 'string' },
        limit: { type: 'integer' },
        after: { type: 'string' },
      },
    },
    // http handler used for polling/fetching initial list of requests when populating a ui
    handler: async (request, response) => {
      const { knex } = server;
      const { market, account, limit = 50, after } = request.query;

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

      function toTrade(
        data: ForceProperties<Trade, string> & {
          raw_side: 'buy' | 'sell';
        }
      ): Trade {
        if (!data.price || !data.quantity) {
          throw new Error('invalid trade missing price or quantity');
        }
        return {
          created_at: new Date(data.created_at),
          direction: data.raw_side === 'sell' ? 'Sell' : 'Buy',
          order_id: data.order_id,
          price: priceStringToNumber(data.price)!,
          quantity: quantityStringToNumber(data.quantity)!,
          volume: priceStringToNumber(data.volume)!,
        };
      }

      const trades = await knex
        .select(knex.raw(HISTORY_QUERY, { market, account }))
        .orderBy('f.created_at', 'desc')
        .limit(limit)
        .modify((q) => {
          if (!after) {
            return;
          }
          const d = maybeDate(after);
          if (d) {
            q.andWhere('f.created_at', '>', d.toISOString());
          }
        });

      response.status(200).send({ trades: trades.map(toTrade) });
    },
  });

  done();
}
