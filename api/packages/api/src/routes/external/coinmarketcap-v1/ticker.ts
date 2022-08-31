// Implements the CoinMarketCap ticker endpoint (Spot Endpoint A2) for getting
// 24h summary of all supported tickers.
import { FastifyInstance } from 'fastify';
import { ForceProperties } from '../../../types/util';
import { toExternalSymbol } from './helper';

/**
 * Query for Ticker endpoint. Accepts no parameters.
 */
const TICKER_QUERY = `
with token_decimals as (
  SELECT id, pow(10, decimals)::numeric denomination
  FROM nep_141_token
),
stats_24h_raw as (
  select 
    market_id,
    m.symbol trading_pairs,
    (select
        fill_price::numeric from fill_event
        where market_id = f.market_id
        order by created_at desc
        limit 1
    ) as last_price,
    sum(quote_qty::numeric)::numeric as quote_volume,
    sum(fill_qty::numeric)::numeric as base_volume
  from
    fill_event f
  join
    market m
    on m.id = f.market_id
  where
    f.created_at > now() - interval '24 hour'
  group by m.symbol, f.market_id
),
stats_24h as (
  select
    raw.market_id,
    raw.trading_pairs,
    raw.last_price / quote.denomination last_price,
    raw.quote_volume / quote.denomination quote_volume,
    raw.base_volume / base.denomination base_volume
  from
    stats_24h_raw raw
  join
    market m
    on m.id = raw.market_id
  join
    token_decimals base
    on base.id = m.base_token_id
  join
    token_decimals quote
    on quote.id = m.quote_token_id
  -- invisible markets usually won't have trades anyway
  where m.visible
)
select * from stats_24h;
`;

interface TickerSummary {
  // XXX: the docs show these values as strings?
  quote_volume: string;
  base_volume: string;
  last_price?: string;
  // XXX: this one field is camel case?
  isFrozen: '0';
}

type RawTickerSummary = ForceProperties<TickerSummary, string> & {
  trading_pairs: string;
};

/**
 * Get basic 24h stats for all tickers.
 */
export default function (server: FastifyInstance, _: unknown, done: () => unknown) {
  server.route({
    url: '/ticker',
    method: 'GET',
    handler: async (_, response) => {
      const { knex } = server;

      const key = `coinmarketcap-ticker`;
      let tickers = server.cache.getTimed(key);
      if (!tickers) {
        const { rows } = await knex.raw<{ rows: RawTickerSummary[] }>(TICKER_QUERY);
        tickers = Object.fromEntries(
          rows.map((r) => {
            const ticker = toExternalSymbol(r.trading_pairs);
            const summary: TickerSummary = {
              base_volume: r.base_volume,
              quote_volume: r.quote_volume,
              last_price: r.last_price || '0',
              isFrozen: '0',
            };
            return [ticker, summary] as const;
          })
        );
        server.cache.setTimed(key, tickers, 60_000 * 10);
      }

      response.status(200).send(tickers);
    },
  });

  done();
}
