// Implements the CoinMarketCap spot summary endpoint.
import { Tonic } from '@tonic-foundation/tonic';
import { FastifyInstance } from 'fastify';
import { getConfig } from '../../../config';
import { ForceProperties } from '../../../types/util';
import { getNearNobodyAccount } from '../../../util';
import { toExternalSymbol } from './helper';

/**
 * Query for Summary endpoint. Accepts no parameters.
 */
const SUMMARY_QUERY = `
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
    (select
        fill_price::numeric from fill_event
        where market_id = f.market_id
        and created_at < now() - interval '24 hour'
        order by created_at desc
        limit 1
    ) as previous,
    max(fill_price::numeric)::numeric as highest_price_24h,
    min(fill_price::numeric)::numeric as lowest_price_24h,
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
    raw.previous / quote.denomination previous,
    raw.highest_price_24h / quote.denomination highest_price_24h,
    raw.lowest_price_24h / quote.denomination lowest_price_24h,
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

interface BaseSummary {
  trading_pairs: string;
  quote_volume: number;
  base_volume: number;

  last_price?: number;
  price_change_percent_24h?: number;
  highest_price_24h?: number;
  lowest_price_24h?: number;
  highest_bid?: number;
  lowest_ask?: number;
}

type Summary = BaseSummary & {
  price_change_percent_24h?: number;
};

type RawSummary = ForceProperties<BaseSummary, string> & {
  market_id: string;
  previous?: string;
};

/**
 * Get basic 24h stats about all markets.
 */
export default function (server: FastifyInstance, _: unknown, done: () => unknown) {
  server.route({
    url: '/summary',
    method: 'GET',
    handler: async (request, response) => {
      const { knex } = server;

      const key = `coinmarketcap-summary`;
      let summary = server.cache.getTimed(key);
      if (!summary) {
        const tonic = new Tonic(await getNearNobodyAccount(), getConfig().TONIC_CONTRACT_ID);
        const { rows } = await knex.raw<{ rows: RawSummary[] }>(SUMMARY_QUERY);

        summary = await Promise.all(
          rows.map(async (r) => {
            request.log.info(`Getting market ${r.market_id}`);
            const market = await tonic.getMarket(r.market_id);
            const orderbook = await market.getOrderbook(1);
            const highest_bid = orderbook.bids.length ? orderbook.bids[0][0] : 0;
            const lowest_ask = orderbook.asks.length ? orderbook.asks[0][0] : 0;

            const last_price = Number(r.last_price || '0');
            const highest_price_24h = Number(r.highest_price_24h || '0');
            const lowest_price_24h = Number(r.lowest_price_24h || '0');

            let price_change_percent_24h;
            if (r.previous) {
              const previous = Number(r.previous);
              const priceChange24h = last_price - previous;
              price_change_percent_24h = (priceChange24h * 100) / previous;
            } else {
              price_change_percent_24h = 0;
            }

            return {
              trading_pairs: toExternalSymbol(r.trading_pairs),
              base_volume: Number(r.base_volume),
              quote_volume: Number(r.quote_volume),
              highest_price_24h,
              lowest_price_24h,
              last_price,
              highest_bid,
              lowest_ask,
              price_change_percent_24h,
            } as Summary;
          })
        );
        server.cache.setTimed(key, summary, 60_000 * 10);
      }

      response.status(200).send(summary);
    },
  });

  done();
}
