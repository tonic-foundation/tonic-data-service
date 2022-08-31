import { BN } from 'bn.js';
import { FastifyInstance } from 'fastify';

import { bnToApproximateDecimal } from '@tonic-foundation/utils';
import { MarketInfo } from '../../../models/market-info';

interface OLHC {
  t: string;
  o: string;
  l: string;
  h: string;
  c: string;
  v: string;
}

interface BaseBars {
  t: number[];
  c: number[];
  o?: number[];
  h?: number[];
  l?: number[];
  v?: number[];
}
export type Bars = (BaseBars & { s: 'ok' }) | { s: 'error'; errmsg: string } | { s: 'no_data'; nextTime?: string };

// the info we need to turn fills into candles
interface MarketPriceMetadata {
  id: string;
  quote_decimals: number;
  base_decimals: number;
}

const OHLCV_QUERY_GENERIC = `
with candle as (
  SELECT DISTINCT
    market_id,
    to_timestamp(floor((extract('epoch' from created_at) / :resolution_seconds )) * :resolution_seconds) as t,
    first_value(fill_price) OVER w as o,
    min(fill_price) OVER w as l,
    max(fill_price) OVER w as h,
    last_value(fill_price) OVER w as c,
    sum(fill_qty::numeric) OVER w as v,
    rank() OVER w as the_rank
  FROM
    fill_event
  WINDOW w AS (PARTITION BY market_id, to_timestamp(floor((extract('epoch' from created_at) / :resolution_seconds )) * :resolution_seconds))
),
market_candle as (
  select market_id, o, l, h, c, v, t from candle
  WHERE
    market_id = :market
  AND
    t BETWEEN to_timestamp(:from) AND to_timestamp(:to)
  ORDER BY t DESC
  LIMIT :countback
)
select * from market_candle ORDER by t ASC
`;

/**
 * build the query for resolutions that have materialized views (60m, 15m) or
 * return the generic query
 */
function unsafeBuildQuery(resolution: number) {
  return `
with market_candle as (
  select market_id, o, l, h, c, v, t from candle_${resolution}m
  WHERE
    market_id = :market
  AND
    t BETWEEN to_timestamp(:from) AND to_timestamp(:to)
  ORDER BY t DESC
  LIMIT :countback
)
select * from market_candle ORDER by t ASC
`;
}
// see migrations
const ALLOWED_MINUTE_RESOLUTIONS = [15, 30, 60];

function getOhlvcQuery(resolutionMinutes: number) {
  if (ALLOWED_MINUTE_RESOLUTIONS.includes(resolutionMinutes)) {
    return unsafeBuildQuery(resolutionMinutes);
  }
  return OHLCV_QUERY_GENERIC;
}

/**
 * Implement TradingView history API for resolution in minutes.
 */
export default function (server: FastifyInstance, _: unknown, done: () => unknown) {
  server.route<{
    Querystring: {
      symbol: string;
      from: number;
      to: number;
      resolution: number;
      countback: number;
    };
    Headers: unknown;
  }>({
    url: '/history',
    method: 'GET',
    schema: {
      querystring: {
        symbol: { type: 'string' },
        from: { type: 'number' },
        to: { type: 'number' },
        resolution: { type: 'number', default: 5 }, // 5 minutes
        countback: { type: 'integer' },
      },
    },
    handler: async (request, response) => {
      const { knex } = server;
      const { symbol: rawSymbol, from, to, resolution, countback } = request.query;
      if (!rawSymbol) {
        response.status(400).send({ error: 'missing market parameter' });
        return;
      }

      const symbol = rawSymbol.toLowerCase();
      const cacheKey = `tv-history-${symbol}`;

      let meta = server.cache.get<MarketPriceMetadata>(cacheKey);
      if (!meta) {
        meta = await knex<MarketInfo>('market')
          .where('symbol', symbol.toLowerCase())
          .first('id', 'quote_decimals', 'base_decimals');
        server.cache.set(cacheKey, meta);
      }
      // if it's still not found, it didn't exist in db at all
      if (!meta) {
        response.status(404);
        return;
      }

      const { id, quote_decimals, base_decimals } = meta;
      const resolution_seconds = resolution * 60;
      const query = getOhlvcQuery(resolution);
      const { rows: olhc } = await knex.raw<{ rows: OLHC[] }>(query, {
        market: id,
        from,
        to,
        resolution_seconds,
        countback,
      });

      const parsePrice = (s: string) => bnToApproximateDecimal(new BN(s), quote_decimals);
      const parseQuantity = (s: string) => bnToApproximateDecimal(new BN(s), base_decimals);
      if (olhc.length) {
        const asTable = olhc.reduce(
          (acc, { t, o, l, h, c, v }) => {
            acc.t.push(Math.round(new Date(t).getTime() / 1000));
            acc.o?.push(parsePrice(o));
            acc.l?.push(parsePrice(l));
            acc.h?.push(parsePrice(h));
            acc.c.push(parsePrice(c));
            acc.v?.push(parseQuantity(v));
            return acc;
          },
          {
            t: [],
            o: [],
            l: [],
            h: [],
            c: [],
            v: [],
          } as BaseBars
        );

        response.status(200).send({ s: 'ok', ...asTable });
      } else {
        const ret: Bars = {
          s: 'no_data',
        };
        response.status(200).send(ret);
      }
    },
  });

  done();
}
