import { FastifyInstance } from 'fastify';

import history from './history';
import summary from './summary';

export default function registerRewardsV1Routes(api: FastifyInstance, _: unknown, done: () => unknown) {
  api.register(summary);
  api.register(history);

  done();
}
