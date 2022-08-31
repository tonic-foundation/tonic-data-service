import fastify from 'fastify';
import fastifyCorsPlugin from '@fastify/cors';
import * as sentry from '@sentry/node';
import '@sentry/tracing';
import httpErrors from 'http-errors';
import { getConfig } from './config';
import cachePlugin from './plugins/cache';
import dbPlugin from './plugins/db';
import marketUtilsPlugin from './plugins/marketUtils';
import metricsPlugin from './plugins/metrics';
import sentryPlugin from './plugins/sentry';
import { apiV1Routes, coinMarketCapV1Routes, makeTvRouter } from './routes';

const config = getConfig();

const server = fastify({
  logger: !config.IS_DEV,
});

if (config.SENTRY_URL?.length) {
  if (!config.SENTRY_ENV?.length) {
    throw new Error('Missing SENTRY_ENV');
  }
  sentry.init({
    dsn: config.SENTRY_URL,
    tracesSampleRate: config.SENTRY_SAMPLE_RATE,
    environment: config.SENTRY_ENV,
  });
  server.log.info(`initialized sentry (env=${config.SENTRY_ENV},samplerate=${config.SENTRY_SAMPLE_RATE})`);
}

server.setErrorHandler((e, request, reply) => {
  request.log.error(`${e}`);
  if (process.env.NODE_ENV === 'development') {
    reply.send(e);
  } else if (httpErrors.isHttpError(e)) {
    reply.send(e);
  } else {
    reply.send(new httpErrors.InternalServerError());
  }
});

/**
 * Plugins
 */
server.register(fastifyCorsPlugin, { origin: config.checkCorsOrigin });
server.register(dbPlugin);
server.register(cachePlugin);
server.register(metricsPlugin);
server.register(sentryPlugin);
server.register(marketUtilsPlugin); // must be after db/cache

/**
 * Routes
 */
server.register(apiV1Routes, { prefix: '/api/v1' });
server.register(makeTvRouter('Tonic'), { prefix: '/tv' });

// coinmarketcap routes
server.register(coinMarketCapV1Routes, { prefix: '/external/coinmarketcap/v1' });

export default server;
