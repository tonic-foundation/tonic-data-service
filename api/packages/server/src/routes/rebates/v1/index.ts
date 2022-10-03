// Routes for USN rewards program.
import { FastifyInstance } from 'fastify';

import summary from './summary';

export default function registerRewardsV1Routes(api: FastifyInstance, _: unknown, done: () => unknown) {
  api.register(summary);

  done();
}
