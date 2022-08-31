// Implements basic in-memory caching
import fp from 'fastify-plugin';
import { FastifyInstance } from 'fastify';

export interface CacheService {
  set<T = any>(k: string, v: T): T | undefined;
  get<T = any>(k: string): T | undefined;
  setTimed<T>(k: string, v: T, ttl: number): void;
  getTimed<T = any>(k: string): T | undefined;
}

declare module 'fastify' {
  interface FastifyInstance {
    cache: CacheService;
  }
}

function cachePlugin(fastify: FastifyInstance, _: unknown, next: () => unknown) {
  const cache: Record<string, unknown> = {};
  const timedCache: Record<string, { start: number; ttl: number; value: unknown }> = {};

  const cacheService: CacheService = {
    get<T = unknown>(k: string) {
      if (k in cache) {
        return cache[k] as T;
      }
      return undefined;
    },
    set<T = unknown>(k: string, v: T) {
      let ret: T | undefined = undefined;
      if (k in cache) {
        ret = cache[k] as T;
      }
      cache[k] = v;
      return ret;
    },
    getTimed<T = unknown>(k: string) {
      if (k in timedCache) {
        const { start, ttl, value } = timedCache[k];
        if (Date.now() - start >= ttl) {
          delete timedCache[k];
          return;
        }
        return value as T;
      }
      return;
    },
    setTimed<T = unknown>(k: string, value: T, ttl: number) {
      timedCache[k] = { start: Date.now(), value, ttl };
    },
  };

  fastify.decorate('cache', cacheService);

  next();
}

export default fp(cachePlugin);
