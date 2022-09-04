// Routes for USN rewards program.
import { FastifyInstance } from 'fastify';

import history from './history';
import unfinalized from './unfinalized';
// import rewardsfrom './rewards';

export default function registerRewardsRoutes(api: FastifyInstance, _: unknown, done: () => unknown) {
  api.register(history);
  api.register(unfinalized);

  done();
}
