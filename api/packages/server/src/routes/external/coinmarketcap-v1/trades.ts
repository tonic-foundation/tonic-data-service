// Implements the CoinMarketCap trades endpoint (Spot Endpoint A4) for getting
// recent trades.
import { FastifyInstance } from 'fastify';
import { ForceProperties } from '../../../types/util';
import { toInternalSymbol } from './helper';

type Direction = 'sell' | 'buy';
interface Trade {
  trade_id: number; // why does it have to be a number
  price: string; // what
  base_volume: string; // what
  quote_volume: string; // what
  timestamp: string; // what
  type: Direction;
}

type RawTrade = ForceProperties<Trade, string> & {
  market_id: string;
  symbol: string;
};

const TRADES_QUERY = `
with token_decimals as (
  SELECT id, pow(10, decimals)::numeric denomination
  FROM nep_141_token
),
market_volume_24h as (
  select
    m.id market_id,
    m.symbol,
    -- f.id is the internal integer id
    f.id trade_id,
    -- millis
    round(extract(epoch from f.created_at)::numeric * 1000) as timestamp,
    o.side type,
    fill_price::numeric / quote.denomination as price,
    quote_qty::numeric / quote.denomination as quote_volume,
    fill_qty::numeric / base.denomination as base_volume
  from fill_event f
  join
    market m
    on m.id = f.market_id
  join
    order_event o
    on o.order_id = f.taker_order_id
  join
    token_decimals base
    on base.id = m.base_token_id
  join
    token_decimals quote
    on quote.id = m.quote_token_id
  where
    f.created_at > now() - interval '1 day'
)
select
  *
from market_volume_24h
where
  symbol = :symbol;
`;

/**
 * Get recent trades in a market. Accepts one parameter, `{ symbol: string }`.
 *
 * The docs say "24 hour historical full trades available as minimum
 * requirement", but the endpoint isn't spec'd to take any parameters. We dump
 * all trades from 24h.
 */
export default function (server: FastifyInstance, _: unknown, done: () => unknown) {
  server.route<{
    Params: { market_pair: string };
  }>({
    url: '/trades/:market_pair',
    method: 'GET',
    schema: {
      params: {
        type: 'object',
        properties: {
          market_pair: { type: 'string' },
        },
      },
    },
    handler: async (request, response) => {
      const { market_pair } = request.params;

      if (!market_pair) {
        response.send(400).send({ error: 'missing market_pair parameter' });
        return;
      }

      const { rows } = await server.knex.raw<{ rows: RawTrade[] }>(TRADES_QUERY, {
        symbol: toInternalSymbol(market_pair),
      });

      const trades: Trade[] = rows.map((r) => {
        return {
          trade_id: Number(r.trade_id),
          // spec lists all strings so this is fine
          base_volume: r.base_volume,
          price: r.price,
          quote_volume: r.quote_volume,
          timestamp: r.timestamp,
          type: r.type as Direction,
        };
      });

      response.status(200).send(trades);
    },
  });

  done();
}
