import * as nearApi from 'near-api-js';
import { Tonic } from '@tonic-foundation/tonic';
import { getNearConfig } from '@tonic-foundation/config';
import { TonicIndexer } from '.';

export async function getOrderInfo(tonic: Tonic, indexer: TonicIndexer, id: string) {
  const indexedOrder = await indexer.getOrder(id);
  if (!indexedOrder) {
    return null;
  }

  const openOrder = await tonic.getOrder(indexedOrder.market_id, id);
  return {
    ...indexedOrder,
    openOrder,
  };
}

(async () => {
  const indexer = new TonicIndexer('https://data-api.mainnet.tonic.foundation');
  const near = new nearApi.Near({ ...getNearConfig('mainnet'), keyStore: new nearApi.keyStores.InMemoryKeyStore() });
  const viewer = await near.account('');
  const tonic = new Tonic(viewer, 'v1.orderbook.near');

  console.log('getting order status');
  try {
    console.log('existing', await getOrderInfo(tonic, indexer, 'GokLUshoFuhinvDmmxpSew'));
    console.log('nonexistent', await getOrderInfo(tonic, indexer, 'fake'));
  } catch (e) {
    console.info(e);
  }

  const markets = await indexer.markets();
  console.log('getting trade stream for market', markets[0].symbol);

  const [stream, stop] = indexer.recentTradeStream(markets[0].id);
  setTimeout(stop, 10_000);
  for await (const trade of stream) {
    console.log(trade);
  }
  console.log('stopped');
})();
