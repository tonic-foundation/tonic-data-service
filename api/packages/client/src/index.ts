import axios, { Axios } from 'axios';
import BN from 'bn.js';
import * as models from '@tonic-foundation/indexer-models';
import { addSeconds } from 'date-fns';

type RawTrade = Pick<models.NewFill, 'created_at' | 'fill_price' | 'fill_qty'>;

/**
 * 24h price change stats
 */
export interface MarketStats {
  latest?: number;
  previous?: number;
  high?: number;
  low?: number;
  quantity: number;
}

export interface RecentTrade {
  price: BN;
  quantity: BN;
  timestamp: Date;
}

/**
 * A market for which the API supports charting/stats/history.
 */
export interface MarketInfo {
  id: string;
  symbol: string;
  base_token_id: string;
  quote_token_id: string;
  base_decimals: number;
  quote_decimals: number;
}

/**
 * An entry in a user's trade history
 */
export interface Trade {
  order_id: string;
  created_at: Date;
  quantity: number;
  price: number;
  direction: 'Buy' | 'Sell';
}
// TODO: refactor

export interface Fill {
  created_at: Date;
  quantity: number | string;
  price: number | string;
}
// TODO: refactor

export interface OrderStatus {
  /**
   * If true, the order is indexed, but the market isn't specifically supported
   * by the API. Prices and quantites will be returned in the raw on-string
   * representation (eg, 5 USDC will be returned as '5000000')
   */
  raw: boolean;
  order_id: string;
  market_id: string;
  created_at: Date;
  side: string;
  canceled: boolean;
  fills: Fill[];
}
// TODO: refactor

const REQUESTED_WITH = 'tonic-js-sdk';

const apiPrefix = {
  1: 'api/v1',
} as const;

export class TonicIndexer {
  _baseUrl: string;
  _client: Axios;

  constructor(baseUrl: string, readonly version: keyof typeof apiPrefix = 1) {
    if (!(baseUrl.startsWith('http://') || baseUrl.startsWith('https://'))) {
      throw new Error(`Tonic API base URL should be http(s) protocol`);
    }
    const stripped = baseUrl.replace(/\/+$/, ''); // remove trailing slash
    this._baseUrl = `${stripped}/${apiPrefix[version]}`;
    this._client = axios.create({
      baseURL: this._baseUrl,
      timeout: 10 * 1000,
      headers: { 'X-Requested-With': REQUESTED_WITH },
      validateStatus: (status) => {
        return (status >= 200 && status < 300) || status === 404;
      },
    });
  }

  /**
   * Return a market's latest trade price, latest trade price at least 24h
   * previous, and 24h high, low, and _base_ volume.
   */
  async markets(): Promise<MarketInfo[]> {
    const { data } = await this._client.get<{ markets: MarketInfo[] }>('markets');
    return data.markets;
  }

  /**
   * Return list of tokens used in markets supported by the API.
   */
  async tokens(): Promise<{ id: string }[]> {
    const { data } = await this._client.get<{ tokens: { id: string }[] }>('tokens');
    return data.tokens;
  }

  /**
   * Return a market's latest trade price, latest trade price at least 24h
   * previous, and 24h high, low, and base volume.
   */
  async marketStats(market: string): Promise<MarketStats> {
    const { data } = await this._client.get<{ stats: MarketStats }>('stats', {
      params: {
        market,
      },
    });

    return {
      ...data.stats,
      quantity: data.stats.quantity || 0, // may be undefined
    };
  }

  /**
   * Return recent trades by market ID.
   *
   * @param market market ID
   * @param limit max number of records to return
   * @param after optional time to fetch from
   */
  async recentTrades(market: string, limit = 100, after?: Date): Promise<RecentTrade[]> {
    const { data } = await this._client.get<{ trades: RawTrade[] }>('recent-trades', {
      params: {
        market,
        limit,
        after: after?.toISOString(),
      },
    });

    return data.trades.map((t) => {
      return {
        price: new BN(t.fill_price),
        quantity: new BN(t.fill_qty),
        timestamp: new Date(t.created_at),
      };
    });
  }

  /**
   * Return an async generator of recent trades.
   *
   * @param market market ID
   * @param from optional time to prefill data from
   * @returns Trade stream as an asynv generator and a cancel function to stop streaming
   */
  recentTradeStream(
    market: string,
    from?: Date,
    _opts: { batchSize: number; interval: number } = { batchSize: 40, interval: 5_000 }
  ): [AsyncGenerator<RecentTrade>, () => unknown] {
    const { batchSize, interval } = _opts;

    let stopped = false;

    function stop() {
      stopped = true;
    }

    async function* generator(client: TonicIndexer): AsyncGenerator<RecentTrade> {
      let prev = from || new Date();
      while (true) {
        if (stopped) {
          return;
        }
        try {
          const trades = await client.recentTrades(market, batchSize, prev);
          if (trades.length) {
            prev = addSeconds(trades.slice(-1)[0].timestamp, 1);
          }
          for (const trade of trades) {
            yield trade;
          }
        } catch (e) {
          console.info(e);
        }
        // TODO(renthog:websockets): remove
        await new Promise((resolve) => setTimeout(resolve, interval));
      }
    }

    return [generator(this), stop];
  }

  /**
   * Return recent trades by market ID.
   *
   * @param market market ID
   * @param account account ID
   * @param limit max number of records to return
   * @param after optional timestamp to fetch from
   */
  async tradeHistory(market: string, account: string, limit = 100, after?: Date): Promise<Trade[]> {
    const { data } = await this._client.get<{ trades: Trade[] }>('trade-history', {
      params: {
        account,
        market,
        limit,
        after: after?.toISOString(),
      },
    });

    return data.trades.map((t: Trade) => {
      return {
        ...t,
        created_at: new Date(t.created_at),
      };
    });
  }

  async getOrder(id: string): Promise<OrderStatus | null> {
    const resp = await this._client.get<OrderStatus>('order', {
      params: { id },
    });

    if (resp.status >= 400 && resp.status < 500) {
      return null;
    }

    return resp.data;
  }
}
