import { FastifyInstance } from 'fastify';

import rewardsHistory from './rewards-history';
// import rewardsfrom './rewards';

export default function registerRewardsRoutes(api: FastifyInstance, _: unknown, done: () => unknown) {
  api.register(rewardsHistory);

  done();
}
