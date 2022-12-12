// TODO: unimplemented
// Routes for USN rewards program.
import { FastifyInstance } from 'fastify';
import eligibility from './eligibility';

import parameters from './parameters';
import rankings from './rankings';

export default function registerRewardsV3Routes(api: FastifyInstance, _: unknown, done: () => unknown) {
  api.register(eligibility);
  api.register(parameters);
  api.register(rankings);

  done();
}
