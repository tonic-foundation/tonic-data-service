// Implements basic request timing plugin.
import { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';

declare module 'fastify' {
  interface FastifyRequest {
    metrics?: {
      start: Date;
    };
  }
}

const metricsPlugin = async (fastify: FastifyInstance, _: unknown, next: () => unknown) => {
  fastify.addHook('onRequest', (req, _, next) => {
    req.metrics = { start: new Date() };
    next();
  });

  fastify.addHook('onResponse', (req, _, done) => {
    if (req.metrics) {
      console.log(
        JSON.stringify({ path: req.url, elapsed: (new Date().getTime() - req.metrics.start.getTime()) / 1000 })
      );
    }
    done();
  });

  next();
};

export default fp(metricsPlugin);
