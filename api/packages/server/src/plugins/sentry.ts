import * as sentry from '@sentry/node';
import '@sentry/tracing';
import { Transaction } from '@sentry/types';
import { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { getConfig } from '../config';

declare module 'fastify' {
  interface FastifyRequest {
    transaction: Transaction;
  }
}

const sentryPlugin = async (fastify: FastifyInstance, _: unknown, next: () => unknown) => {
  const config = getConfig();
  if (config.SENTRY_URL?.length) {
    fastify.addHook('onRequest', (req, _, next) => {
      // hack to get request path
      const endpoint = new URL('https://example.com' + req.url).pathname;
      req.transaction = sentry.startTransaction({
        op: 'HTTP Request',
        name: endpoint,
      });
      next();
    });

    fastify.addHook('onError', (req, _, error, done) => {
      sentry.captureException(error, req.transaction);
      done();
    });

    fastify.addHook('onResponse', (req, _, done) => {
      req.transaction.finish();
      done();
    });
  }

  next();
};

export default fp(sentryPlugin);
