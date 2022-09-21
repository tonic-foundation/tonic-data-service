// Routes for USN rewards program.
import { FastifyInstance } from 'fastify';
import eligibility from './eligibility';

import history from './history';
// import payouts from './payouts';
import parameters from './parameters';
import stats from './stats';
import unfinalized from './unfinalized';
import leaderboard from './leaderboard';

export default function registerRewardsV2Routes(api: FastifyInstance, _: unknown, done: () => unknown) {
  api.register(eligibility);
  api.register(history);
  api.register(leaderboard);
  api.register(parameters);
  // api.register(payouts);
  api.register(stats);
  api.register(unfinalized);

  done();
}
