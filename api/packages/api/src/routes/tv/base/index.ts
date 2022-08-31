import { FastifyInstance } from 'fastify';

import configController from './config';
import historyContoller from './history';
import makeSymbolsController from './symbols';

/**
 * Factory for making TradingView APIs, allows making partner routes for the
 * ones who want to whitelabel the exchange.
 */
export default function makeTvRouter(exchangeName: string) {
  return function (api: FastifyInstance, _: unknown, done: () => unknown) {
    api.register(configController);
    api.register(historyContoller);
    api.register(makeSymbolsController(exchangeName));

    done();
  };
}
