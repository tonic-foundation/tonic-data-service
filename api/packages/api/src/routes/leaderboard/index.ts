import { FastifyInstance } from 'fastify';

import rankings from './rankings';
import search from './search';

export default function registerLeaderboardRoutes(api: FastifyInstance, _: unknown, done: () => unknown) {
  api.register(rankings);
  api.register(search);

  done();
}
