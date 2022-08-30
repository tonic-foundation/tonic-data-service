import { FastifyInstance } from 'fastify';

import stats from './stats';
import healthz from './healthz';
import markets from './markets';
import tradeHistory from './trade-history';
import recentTrades from './recent-trades';
import order from './order';
import supportedTokens from './supported-tokens';

export default function registerApiV1Routes(api: FastifyInstance, _: unknown, done: () => unknown) {
  api.register(stats);
  api.register(healthz);
  api.register(markets);
  api.register(recentTrades);
  api.register(tradeHistory);
  api.register(order);
  api.register(supportedTokens);

  done();
}
