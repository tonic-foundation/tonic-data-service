import { FastifyInstance } from 'fastify';

const ORDER_QUERY = `
with fills as (
    select
        o.order_id,
        f.created_at filled_at,
        f.fill_qty,
        f.fill_price
    from order_event o
    join fill_event f
    on o.order_id = f.taker_order_id
    or o.order_id = f.maker_order_id
),
order_status as (
  select
      o.order_id,
      o.side,
      o.market_id,
      o.created_at order_created_at,
      CASE WHEN c.order_id IS NOT NULL
          THEN true
          ELSE false
      END canceled
  from order_event o
  left join cancel_event c
  on o.order_id = c.order_id
)
select
  *
from order_status os
left join fills f
on f.order_id = os.order_id
where os.order_id = :id
order by order_created_at, filled_at
`;

export interface RawFill {
  market_id: string;
  side: string;
  order_id: string;
  order_created_at: Date;
  filled_at: Date;
  fill_qty: string;
  fill_price: string;
  canceled: boolean;
}

export interface Fill {
  created_at: Date;
  quantity: number | string;
  price: number | string;
}

export interface Response {
  raw: boolean;
  order_id: string;
  market_id: string;
  created_at: Date;
  side: string;
  canceled: boolean;
  fills: Fill[];
}

/**
 * Find information about a single order.
 */
export default function (server: FastifyInstance, _: unknown, done: () => unknown) {
  server.route<{
    Querystring: { id: string };
    Headers: unknown;
  }>({
    url: '/order',
    method: 'GET',
    schema: {
      querystring: {
        id: { type: 'string' },
      },
    },
    handler: async (request, response) => {
      const { knex } = server;
      const { id } = request.query;

      if (!id) {
        response.send(400).send({ error: 'missing id parameter' });
        return;
      }

      const { rows: data } = await knex.raw<{ rows: RawFill[] }>(ORDER_QUERY, { id });

      if (!data.length) {
        response.status(404).send({ error: 'order not found' });
        return;
      }

      // since we left join on fills, null fill --> order exists but no trades
      // have happened as a result
      const rawFills = data.filter((f) => !!f.fill_price);

      const marketId = data[0].market_id;
      const tools = await server.getMarketInfoAndUtils(marketId);
      const fills: Fill[] = tools
        ? rawFills.map((r) => {
            return {
              created_at: r.filled_at,
              price: tools.priceStringToNumber(r.fill_price)!,
              quantity: tools.quantityStringToNumber(r.fill_qty)!,
            };
          })
        : rawFills.map((r) => {
            // trade exists in index but we don't support charting for the market.
            // return raw data instead (price/quantity are strings)
            return {
              created_at: r.filled_at,
              price: r.fill_price,
              quantity: r.fill_qty,
            };
          });

      const [o] = data;
      const resp: Response = {
        order_id: id,
        market_id: marketId,
        raw: false,
        created_at: o.order_created_at,
        side: o.side,
        canceled: o.canceled,
        fills,
      };
      response.status(200).send(resp);
    },
  });

  done();
}
