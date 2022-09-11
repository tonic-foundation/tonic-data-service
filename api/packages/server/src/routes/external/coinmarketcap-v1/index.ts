// Implements CoinMarketCap's spot exchange info endpoints. There are some
// unexpected behaviors required, which we comment inline.
//
// https://docs.google.com/document/d/1S4urpzUnO2t7DmS_1dc4EL4tgnnbTObPYXvDeBnukCg/edit#
import { FastifyInstance } from 'fastify';

import summary from './summary';
import ticker from './ticker';
import orderbook from './orderbook';
import trades from './trades';

export default function registerCoinMarketCapV1Routes(api: FastifyInstance, _: unknown, done: () => unknown) {
  api.register(summary);
  api.register(ticker);
  api.register(orderbook);
  api.register(trades);

  done();
}
