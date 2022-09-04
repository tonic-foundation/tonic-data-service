// Routes for USN rewards program.
import { FastifyInstance } from 'fastify';

import history from './history';
import unfinalized from './unfinalized';

export default function registerRewardsRoutes(api: FastifyInstance, _: unknown, done: () => unknown) {
  api.register(unfinalized);
  api.register(history);

  done();
}
