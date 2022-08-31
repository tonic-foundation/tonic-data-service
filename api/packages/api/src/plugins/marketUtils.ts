// Implements basic utils used in routes that have to deal with lot/decimal
// conversions.
import fp from 'fastify-plugin';
import { FastifyInstance } from 'fastify';
import { MarketInfo } from '../models/market-info';
import { bnToApproximateDecimal } from '@tonic-foundation/utils';
import { BN } from 'bn.js';

declare module 'fastify' {
  interface FastifyInstance {
    getMarketInfoAndUtils: ReturnType<typeof marketUtilsFactory>;
  }
}

/**
 * Return a plugin that gets common metadata and functions for working with
 * market events. Uses the in-memory cache to avoid DB round trips.
 */
function marketUtilsFactory(server: FastifyInstance) {
  // man
  return async (id: string) => {
    const cacheKey = `market-info-${id}`;
    let info: MarketInfo | undefined = server.cache.get(cacheKey);
    if (!info) {
      // info not cached
      info = await server.knex<MarketInfo>('market').where('id', id).first('*');
      server.cache.set(cacheKey, info);
    }
    if (!info) {
      // the market doesn't exist
      return;
    } else {
      const { base_decimals, quote_decimals } = info;
      return {
        ...info,
        priceStringToNumber(s?: string | null) {
          // note: new BN(null) will immediately overflow the heap, hence the check
          if (s) {
            return bnToApproximateDecimal(new BN(s), quote_decimals);
          }
          return undefined;
        },
        quantityStringToNumber(s?: string | null) {
          if (s) {
            return bnToApproximateDecimal(new BN(s), base_decimals);
          }
          return undefined;
        },
      };
    }
  };
}

const marketUtilsPlugin = async (fastify: FastifyInstance, _: unknown, next: () => unknown) => {
  if (!fastify.getMarketInfoAndUtils) {
    fastify.decorate('getMarketInfoAndUtils', marketUtilsFactory(fastify));
  }

  next();
};

export default fp(marketUtilsPlugin);
