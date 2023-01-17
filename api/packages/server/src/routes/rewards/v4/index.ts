import { FastifyInstance } from 'fastify';
import eligibility from './eligibility';

import rankings from './rankings';

export default function registerRewardsV4Routes(api: FastifyInstance, _: unknown, done: () => unknown) {
  api.register(eligibility);
  api.register(rankings);

  done();
}
