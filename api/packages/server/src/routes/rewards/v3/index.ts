// TODO: unimplemented
// Routes for USN rewards program.
import { FastifyInstance } from 'fastify';
import eligibility from './eligibility';

import history from './history';
import parameters from './parameters';
import unfinalized from './unfinalized';

export default function registerRewardsV3Routes(api: FastifyInstance, _: unknown, done: () => unknown) {
  api.register(eligibility);
  api.register(history);
  api.register(parameters);
  api.register(unfinalized);

  done();
}
