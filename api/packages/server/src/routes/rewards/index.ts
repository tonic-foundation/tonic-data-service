// Routes for USN rewards program.
import { FastifyInstance } from 'fastify';

import history from './history';
import parameters from './parameters';
import stats from './stats';
import unfinalized from './unfinalized';

export default function registerRewardsRoutes(api: FastifyInstance, _: unknown, done: () => unknown) {
  api.register(unfinalized);
  api.register(history);
  api.register(stats);
  api.register(parameters);

  done();
}