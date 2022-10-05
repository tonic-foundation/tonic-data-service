/**
 * Data routes. Backs the Tonic trading UI.
 */
import { FastifyInstance } from 'fastify';
import indexer from './indexer';

export default function registerApiV1Routes(api: FastifyInstance, _: unknown, done: () => unknown) {
  api.register(indexer);

  done();
}
