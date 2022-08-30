import { FastifyInstance } from 'fastify';
import { LibrarySymbolInfo, ResolutionString } from '../../../types/datafeed';

interface BasicInfo {
  symbol: string;
  pricescale: string;
}

interface ToSymbolInfoArgs {
  /** Name of market, displayed in top left legend */
  name: string;
  /**
   * Ticker, eg, NEAR/USDC
   */
  ticker: string;
  /**
   * Number of decimals to display in price. Varies per market. TODO: add a
   * column for this; default to 100 (0.001)
   */
  pricescale: number;
}

/**
 * Query for getting symbol and pricescale information about a market.
 *
 * Accepts one parameter, `{ symbol: string }`, which is lowercase by
 * convention.
 */
const BASIC_INFO_QUERY = `
  select
    m.symbol,
    round(pow(10, q.decimals)::numeric / quote_lot_size::numeric) pricescale
  from nep_141_token b
  join market m
  on b.id = m.base_token_id
  join nep_141_token q
  on q.id = m.quote_token_id
  where m.symbol = :symbol
`;

/**
 * Implement TradingView symbol search API.
 */
export default function makeSymbolsHandler(exchangeName: string) {
  function toSymbolInfo({ name, ticker, pricescale = 100 }: ToSymbolInfoArgs): LibrarySymbolInfo {
    return {
      name,
      ticker,
      description: '',
      session: '24x7',
      type: 'crypto',
      exchange: exchangeName,
      timezone: 'Etc/UTC',
      format: 'price',
      minmov: 1,
      pricescale,
      supported_resolutions: ['1', '5', '15', '30', '60', '1D'] as ResolutionString[],
      listed_exchange: exchangeName,
      full_name: name,
      has_intraday: true,
      volume_precision: 2, // tells chart there _may_ be 2 decimals
    };
  }

  return function (server: FastifyInstance, _: unknown, done: () => unknown) {
    server.route<{
      Querystring: {
        symbol: string;
      };
      Headers: unknown;
    }>({
      url: `/symbols`,
      method: 'GET',
      schema: {
        querystring: {
          symbol: { type: 'string' },
        },
      },
      handler: async (request, response) => {
        const { symbol } = request.query;

        const key = `symbol-${symbol}`;
        let info: BasicInfo | undefined = server.cache.get(key);
        if (!info) {
          const { rows } = await server.knex.raw<{ rows: BasicInfo[] }>(BASIC_INFO_QUERY, {
            symbol: symbol.toLowerCase(),
          });
          if (rows.length) {
            info = rows[0];
            server.cache.set(key, info);
          }
        }

        if (info) {
          const pricescale = Number(info.pricescale);
          response.status(200).send(
            toSymbolInfo({
              name: info.symbol,
              ticker: info.symbol,
              pricescale,
            })
          );
        } else {
          response.status(404);
        }
      },
    });

    done();
  };
}
